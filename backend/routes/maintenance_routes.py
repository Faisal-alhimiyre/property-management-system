import logging
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from models import MaintenanceRequestCreate, MaintenanceRequestPatch
from config import supabase
from routes.auth_routes import get_current_user
from routes.apartment_routes import reconcile_apartment_maintenance_pointer
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


class MarkOwnerSeenBody(BaseModel):
    building_id: int


def _fetch_requests_for_user(current_user: dict, apartment_id: int | None) -> list[dict]:
    uid = current_user.get("id")
    rows_by_id: dict[int, dict] = {}

    def add_rows(items: list[dict] | None) -> None:
        for row in items or []:
            rid = row.get("id")
            if rid is not None:
                rows_by_id[int(rid)] = row

    if has_role(current_user, "tenant"):
        tenant = supabase.table("tenants").select("*").eq("user_id", uid).execute()
        if tenant.data:
            tenant_ids = [t["id"] for t in tenant.data]
            q = supabase.table("maintenance_requests").select("*").in_("tenant_id", tenant_ids)
            if apartment_id is not None:
                q = q.eq("apartment_id", int(apartment_id))
            add_rows(getattr(q.execute(), "data", None))

    if has_role(current_user, "owner"):
        apartments = supabase.table("apartments").select("id").eq("owner_id", uid).execute()
        apt_rows = apartments.data or []
        apt_ids = [apt["id"] for apt in apt_rows]
        if apt_ids:
            if apartment_id is not None:
                try:
                    aid = int(apartment_id)
                except (TypeError, ValueError):
                    aid = None
                if aid is not None and aid in apt_ids:
                    res = (
                        supabase.table("maintenance_requests")
                        .select("*")
                        .eq("apartment_id", aid)
                        .execute()
                    )
                    add_rows(getattr(res, "data", None))
            else:
                res = (
                    supabase.table("maintenance_requests")
                    .select("*")
                    .in_("apartment_id", apt_ids)
                    .execute()
                )
                add_rows(getattr(res, "data", None))

    return sorted(rows_by_id.values(), key=lambda r: int(r.get("id") or 0))


def _tenant_linked_to_apartment(apt_row: dict, current_user: dict) -> bool:
    try:
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        return False
    tuid = apt_row.get("tenant_user_id")
    if tuid is not None:
        try:
            if int(tuid) == uid:
                return True
        except (TypeError, ValueError):
            pass
    nat = str(current_user.get("national_id") or "").strip()
    apt_nat = str(apt_row.get("tenant_national_id") or "").strip()
    return bool(nat and apt_nat and nat == apt_nat)


def _resolve_tenant_row_for_maintenance(apartment_id: int, apt_row: dict, current_user: dict) -> dict:
    """
    maintenance_requests.tenant_id references tenants(id). Resolve or create the profile row:
    1) Prefer existing tenants row for this user + apartment.
    2) Else if apartment shows this user as tenant (tenant_user_id / national_id), attach or create.
    """
    try:
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized for this apartment")

    existing = (
        supabase.table("tenants")
        .select("*")
        .eq("user_id", uid)
        .eq("apartment_id", apartment_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    if not _tenant_linked_to_apartment(apt_row, current_user):
        raise HTTPException(
            status_code=403,
            detail="Not authorized for this apartment",
        )

    orphans = (
        supabase.table("tenants")
        .select("*")
        .eq("apartment_id", apartment_id)
        .order("id", desc=True)
        .limit(25)
        .execute()
    )
    for row in orphans.data or []:
        ru = row.get("user_id")
        if ru is None:
            supabase.table("tenants").update({"user_id": uid}).eq("id", row["id"]).execute()
            return {**row, "user_id": uid}
        try:
            if int(ru) == uid:
                return row
        except (TypeError, ValueError):
            continue

    lease_start = date.today().isoformat()
    lease_end = date.today().isoformat()
    cid = apt_row.get("current_contract_id")
    if cid:
        try:
            cres = (
                supabase.table("contracts")
                .select("start_date, end_date")
                .eq("id", int(cid))
                .limit(1)
                .execute()
            )
            if cres.data:
                ds = cres.data[0].get("start_date")
                de = cres.data[0].get("end_date")
                if ds:
                    lease_start = str(ds)[:10]
                if de:
                    lease_end = str(de)[:10]
        except (TypeError, ValueError):
            pass

    ins = (
        supabase.table("tenants")
        .insert(
            {
                "user_id": uid,
                "apartment_id": apartment_id,
                "lease_start": lease_start,
                "lease_end": lease_end,
            }
        )
        .execute()
    )
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create tenant profile for maintenance request")
    return ins.data[0]


def _enrich_maintenance_rows(rows: list[dict]) -> list[dict]:
    """
    Add tenant_user_id (auth user who owns the tenant profile), building_name/city,
    and ensure building_id is present (from row or from apartments).
    """
    if not rows:
        return []

    apt_ids = []
    for r in rows:
        aid = r.get("apartment_id")
        if aid is not None:
            try:
                apt_ids.append(int(aid))
            except (TypeError, ValueError):
                pass
    apt_ids = list(dict.fromkeys(apt_ids))

    apt_map: dict[int, dict] = {}
    if apt_ids:
        try:
            apt_res = (
                supabase.table("apartments")
                .select("id, building_id, apartment_number, tenant_national_id")
                .in_("id", apt_ids)
                .execute()
            )
            for a in getattr(apt_res, "data", None) or []:
                try:
                    apt_map[int(a["id"])] = a
                except (TypeError, ValueError, KeyError):
                    pass
        except Exception:
            pass

    tenant_ids = []
    for r in rows:
        tid = r.get("tenant_id")
        if tid is not None:
            try:
                tenant_ids.append(int(tid))
            except (TypeError, ValueError):
                pass
    tenant_ids = list(dict.fromkeys(tenant_ids))

    tenant_map: dict[int, dict] = {}
    if tenant_ids:
        try:
            t_res = (
                supabase.table("tenants")
                .select("id, user_id, apartment_id")
                .in_("id", tenant_ids)
                .execute()
            )
            for t in getattr(t_res, "data", None) or []:
                try:
                    tenant_map[int(t["id"])] = t
                except (TypeError, ValueError, KeyError):
                    pass
        except Exception:
            pass

    building_ids: set[int] = set()
    for r in rows:
        bid = r.get("building_id")
        if bid is not None:
            try:
                building_ids.add(int(bid))
            except (TypeError, ValueError):
                pass
    for r in rows:
        aid = r.get("apartment_id")
        if aid is None:
            continue
        try:
            ia = int(aid)
        except (TypeError, ValueError):
            continue
        if r.get("building_id") is None and ia in apt_map:
            ab = apt_map[ia].get("building_id")
            if ab is not None:
                try:
                    building_ids.add(int(ab))
                except (TypeError, ValueError):
                    pass

    buildings_by_id: dict[int, dict] = {}
    if building_ids:
        try:
            b_res = (
                supabase.table("buildings")
                .select("id, name, city")
                .in_("id", list(building_ids))
                .execute()
            )
            for b in getattr(b_res, "data", None) or []:
                try:
                    buildings_by_id[int(b["id"])] = b
                except (TypeError, ValueError, KeyError):
                    pass
        except Exception:
            pass

    out: list[dict] = []
    for row in rows:
        item = dict(row)
        tid = item.get("tenant_id")
        if tid is not None:
            try:
                itid = int(tid)
                if itid in tenant_map:
                    item["tenant_user_id"] = tenant_map[itid].get("user_id")
            except (TypeError, ValueError):
                pass

        aid = item.get("apartment_id")
        if item.get("building_id") is None and aid is not None:
            try:
                ia = int(aid)
                if ia in apt_map and apt_map[ia].get("building_id") is not None:
                    item["building_id"] = apt_map[ia].get("building_id")
            except (TypeError, ValueError):
                pass

        bid = item.get("building_id")
        if bid is not None:
            try:
                ib = int(bid)
                if ib in buildings_by_id:
                    item["building_name"] = buildings_by_id[ib].get("name")
                    item["building_city"] = buildings_by_id[ib].get("city")
            except (TypeError, ValueError):
                pass

        if aid is not None:
            try:
                ia = int(aid)
                if ia in apt_map:
                    an = apt_map[ia].get("apartment_number")
                    if an is not None:
                        item["apartment_number"] = an
                    tn = apt_map[ia].get("tenant_national_id")
                    if tn is not None and item.get("tenant_national_id") in (None, ""):
                        item["tenant_national_id"] = tn
            except (TypeError, ValueError):
                pass

        out.append(item)

    return out


@router.post("/maintenance")
async def create_maintenance_request(
    body: MaintenanceRequestCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        apartment_id = int(body.apartment_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid apartment_id")

    apt_res = (
        supabase.table("apartments")
        .select(
            "id, building_id, owner_id, tenant_user_id, tenant_national_id, current_contract_id"
        )
        .eq("id", apartment_id)
        .limit(1)
        .execute()
    )
    apt_rows = getattr(apt_res, "data", None) or []
    if not apt_rows:
        raise HTTPException(status_code=404, detail="Apartment not found")

    apt_row = apt_rows[0]
    # Legacy role column may not list "tenant" if user also owns units — allow when linked as tenant.
    if not has_role(current_user, "tenant") and not _tenant_linked_to_apartment(
        apt_row, current_user
    ):
        raise HTTPException(status_code=403, detail="Only tenants can create maintenance requests")

    tenant_row = _resolve_tenant_row_for_maintenance(apartment_id, apt_row, current_user)
    try:
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        uid = None

    title_clean = (body.title or "").strip() or "صيانة"
    desc_clean = (body.description or "").strip()
    prio_clean = (body.priority or "medium").strip()
    rt = (body.request_type or "maintenance").strip().lower()
    if rt not in ("maintenance", "complaint", "suggestion", "request"):
        rt = "maintenance"
    cid = body.contract_id
    try:
        cid_i = int(cid) if cid is not None else None
    except (TypeError, ValueError):
        cid_i = None

    # When the client omits contract_id, tie the row to the apartment's current lease if present.
    if cid_i is None:
        cc = apt_row.get("current_contract_id")
        if cc is not None:
            try:
                cid_i = int(cc)
            except (TypeError, ValueError):
                cid_i = None

    insert_full = {
        "tenant_id": tenant_row["id"],
        "apartment_id": apartment_id,
        "title": title_clean,
        "description": desc_clean,
        "status": "pending",
        "priority": prio_clean,
        "request_type": rt,
        "contract_id": cid_i,
        "building_id": apt_row.get("building_id"),
        "submitted_by_user_id": uid,
        "owner_seen": False,
    }
    insert_full = {k: v for k, v in insert_full.items() if v is not None}

    insert_min = {
        "tenant_id": tenant_row["id"],
        "apartment_id": apartment_id,
        "title": title_clean,
        "description": desc_clean,
        "status": "pending",
        "priority": prio_clean,
    }

    try:
        response = supabase.table("maintenance_requests").insert(insert_full).execute()
    except Exception as first_exc:
        logger.warning("maintenance insert (full) failed: %s", first_exc)
        try:
            response = supabase.table("maintenance_requests").insert(insert_min).execute()
        except Exception as second_exc:
            logger.exception("maintenance insert (minimal) failed")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to save maintenance request: {second_exc}",
            ) from second_exc

    rows_back = getattr(response, "data", None) or []
    row = rows_back[0] if rows_back else None
    if row is None:
        logger.error(
            "maintenance_requests insert returned no rows; check SUPABASE_SERVICE_ROLE_KEY, RLS, and table name."
        )
        raise HTTPException(
            status_code=500,
            detail="Insert did not return a row. Use the service role key on the API server and verify table public.maintenance_requests exists.",
        )

    # Minimal insert omits contract_id; full insert can omit it when cid_i was None and then stripped.
    # If we resolved a lease id (body or apartments.current_contract_id), persist it so the row matches reality.
    if row.get("contract_id") is None and cid_i is not None:
        try:
            rid = int(row["id"])
            upd = (
                supabase.table("maintenance_requests")
                .update({"contract_id": cid_i})
                .eq("id", rid)
                .execute()
            )
            udata = getattr(upd, "data", None) or []
            if udata:
                row = udata[0]
            else:
                row["contract_id"] = cid_i
        except Exception as exc:
            logger.warning(
                "maintenance contract_id backfill failed id=%s cid=%s: %s",
                row.get("id"),
                cid_i,
                exc,
            )

    if row and row.get("apartment_id") is not None:
        try:
            reconcile_apartment_maintenance_pointer(int(row["apartment_id"]))
        except (TypeError, ValueError):
            pass
    enriched = _enrich_maintenance_rows([row] if row else [])
    return enriched[0] if enriched else row


@router.get("/maintenance")
async def get_maintenance_requests(
    apartment_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    rows = _fetch_requests_for_user(current_user, apartment_id)
    return _enrich_maintenance_rows(rows)


def _owner_authorized_for_apartment_row(apt: dict, current_user: dict) -> bool:
    try:
        oid = int(apt.get("owner_id"))
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        return False
    return oid == uid


@router.post("/maintenance/mark-owner-seen")
async def mark_owner_seen_for_building(
    body: MarkOwnerSeenBody,
    current_user: dict = Depends(get_current_user),
):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can mark requests seen")

    try:
        bid = int(body.building_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid building_id")

    apts = (
        supabase.table("apartments")
        .select("id")
        .eq("building_id", bid)
        .eq("owner_id", current_user["id"])
        .execute()
    )
    apt_ids = [r["id"] for r in getattr(apts, "data", None) or []]
    if not apt_ids:
        return {"updated": 0}

    now = datetime.utcnow().isoformat()
    supabase.table("maintenance_requests").update(
        {"owner_seen": True, "owner_seen_at": now, "updated_at": now}
    ).in_("apartment_id", apt_ids).eq("owner_seen", False).execute()
    return {"updated": len(apt_ids)}


@router.patch("/maintenance/{request_id}")
async def patch_maintenance_request(
    request_id: int,
    body: MaintenanceRequestPatch,
    current_user: dict = Depends(get_current_user),
):
    res = supabase.table("maintenance_requests").select("*").eq("id", request_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Request not found")
    row = res.data[0]
    apt_id = row.get("apartment_id")
    apt_res = supabase.table("apartments").select("*").eq("id", apt_id).limit(1).execute()
    if not apt_res.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apt_row = apt_res.data[0]

    uid = int(current_user["id"])
    is_owner = _owner_authorized_for_apartment_row(apt_row, current_user)
    is_tenant = _tenant_linked_to_apartment(apt_row, current_user)

    updates: dict = {"updated_at": datetime.utcnow().isoformat()}

    if body.owner_reply is not None:
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized")
        updates["owner_reply"] = body.owner_reply
        updates["status"] = "replied"
        updates["replied_at"] = datetime.utcnow().isoformat()

    if body.status is not None:
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized")
        st = str(body.status).lower()
        updates["status"] = st
        if st == "resolved":
            updates["resolved_at"] = datetime.utcnow().isoformat()

    if body.owner_seen is not None:
        if not is_owner:
            raise HTTPException(status_code=403, detail="Not authorized")
        updates["owner_seen"] = bool(body.owner_seen)
        if body.owner_seen:
            updates["owner_seen_at"] = datetime.utcnow().isoformat()

    if body.tenant_reply_seen is True:
        if not is_tenant:
            raise HTTPException(status_code=403, detail="Not authorized")
        updates["tenant_reply_seen_at"] = datetime.utcnow().isoformat()

    if len(updates) <= 1:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    try:
        response = supabase.table("maintenance_requests").update(updates).eq("id", request_id).execute()
    except Exception as exc:
        logger.exception("patch maintenance failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    rows_back = getattr(response, "data", None) or []
    out = rows_back[0] if rows_back else None
    if apt_id is not None:
        try:
            reconcile_apartment_maintenance_pointer(int(apt_id))
        except (TypeError, ValueError):
            pass
    enriched = _enrich_maintenance_rows([out] if out else [])
    return enriched[0] if enriched else out


@router.put("/maintenance/{request_id}")
async def update_maintenance_request(request_id: int, status: str, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can update maintenance requests")

    request = supabase.table("maintenance_requests").select("apartment_id").eq("id", request_id).execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")

    apartment = supabase.table("apartments").select("*").eq("id", request.data[0]["apartment_id"]).execute()
    if not apartment.data or apartment.data[0]["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    apt_id = request.data[0]["apartment_id"]
    st = str(status).lower()
    upd = {"status": status, "updated_at": datetime.utcnow().isoformat()}
    if st == "resolved":
        upd["resolved_at"] = datetime.utcnow().isoformat()
    response = supabase.table("maintenance_requests").update(upd).eq("id", request_id).execute()
    try:
        reconcile_apartment_maintenance_pointer(int(apt_id))
    except (TypeError, ValueError):
        pass
    row = response.data[0] if getattr(response, "data", None) else None
    enriched = _enrich_maintenance_rows([row] if row else [])
    return enriched[0] if enriched else row
