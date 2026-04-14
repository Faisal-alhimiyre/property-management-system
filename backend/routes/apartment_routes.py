import json
import logging
from collections import defaultdict
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from models import Apartment, ApartmentResponse
from config import supabase
from routes.auth_routes import get_current_user, normalize_saudi_national_id, national_id_lookup_variants
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_assign_payload(payload: dict) -> dict:
    payload = payload or {}
    tenant_info = payload.get("tenant_info", payload.get("tenantInfo")) or {}
    tenant_national_id = (
        payload.get("tenant_national_id")
        or payload.get("tenantNationalId")
        or payload.get("national_id")
        or payload.get("nationalId")
        or tenant_info.get("national_id")
        or tenant_info.get("nationalId")
    )
    if tenant_national_id is not None:
        tenant_national_id = str(tenant_national_id).strip() or None
        nn = normalize_saudi_national_id(tenant_national_id)
        if nn:
            tenant_national_id = nn

    normalized = {
        "tenant_user_id": payload.get("tenant_user_id", payload.get("tenantUserId")),
        "tenant_national_id": tenant_national_id,
        "tenant_info": tenant_info,
        "start_date": payload.get("start_date", payload.get("startDate")),
        "end_date": payload.get("end_date", payload.get("endDate")),
        "rent": payload.get("rent"),
        "notes": payload.get("notes"),
        "meter_number": payload.get("meter_number", payload.get("meterNumber")),
        "bedrooms": payload.get("bedrooms"),
        "bathrooms": payload.get("bathrooms"),
        "living_rooms": payload.get("living_rooms", payload.get("livingRooms")),
    }
    return normalized


def _resolve_tenant_user_id(assign_payload: dict) -> int | None:
    tenant_user_id = assign_payload.get("tenant_user_id")
    if tenant_user_id is not None:
        try:
            return int(tenant_user_id)
        except (TypeError, ValueError):
            return None

    tenant_national_id = assign_payload.get("tenant_national_id")
    if not tenant_national_id:
        return None

    nid_key = normalize_saudi_national_id(tenant_national_id) or str(tenant_national_id).strip()

    user_lookup = (
        supabase.table("users")
        .select("id")
        .eq("national_id", nid_key)
        .limit(1)
        .execute()
    )
    logger.info("tenant user lookup by national_id response: %s", getattr(user_lookup, "data", None))
    if not user_lookup.data:
        return None

    try:
        return int(user_lookup.data[0].get("id"))
    except (TypeError, ValueError):
        return None


def _parse_iso_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _derive_lease_status(_start_date_value, tenant_national_id: str | None) -> str:
    """Assign-tenant: overdue is derived later from payment_installments during reconcile."""
    if not tenant_national_id:
        return "vacant"
    return "occupied"


def _batch_contract_installment_lease_sets(contract_ids: list[int]) -> tuple[set[int], set[int]]:
    """
    Returns:
      contracts_with_any_installment_row — contract has a generated schedule in DB
      contracts_with_overdue_pending — at least one pending installment with due_date before today
    """
    with_rows: set[int] = set()
    overdue: set[int] = set()
    if not contract_ids:
        return with_rows, overdue
    try:
        res = (
            supabase.table("payment_installments")
            .select("contract_id, status, due_date")
            .in_("contract_id", contract_ids)
            .execute()
        )
    except Exception:
        logger.exception(
            "payment_installments batch read failed; lease_status reconcile falls back to occupied"
        )
        return with_rows, overdue

    today = date.today()
    for row in getattr(res, "data", None) or []:
        cid = row.get("contract_id")
        if cid is None:
            continue
        try:
            ic = int(cid)
        except (TypeError, ValueError):
            continue
        with_rows.add(ic)
        if str(row.get("status") or "").lower() != "pending":
            continue
        dd = _parse_iso_date(row.get("due_date"))
        if dd and dd < today:
            overdue.add(ic)

    return with_rows, overdue


def _derive_apartment_lease_status_for_existing_row(
    apartment_row: dict,
    contracts_with_installments: set[int],
    contracts_with_overdue_installments: set[int],
) -> str:
    tenant_user_id = apartment_row.get("tenant_user_id")
    tenant_national_id = apartment_row.get("tenant_national_id")
    tenant_info = apartment_row.get("tenant_info") or {}
    has_tenant = bool(
        tenant_user_id
        or tenant_national_id
        or tenant_info.get("fullName")
        or tenant_info.get("full_name")
    )

    if not has_tenant:
        return "vacant"

    current_contract_id = apartment_row.get("current_contract_id")
    if not current_contract_id:
        return "occupied"
    try:
        cid = int(current_contract_id)
    except (TypeError, ValueError):
        return "occupied"

    if cid in contracts_with_installments:
        return "overdue" if cid in contracts_with_overdue_installments else "occupied"

    # No installment schedule yet — do not mark red based on contract start date alone.
    return "occupied"


def _reconcile_owner_apartment_statuses(apartments_data: list[dict]) -> list[dict]:
    contract_ids: list[int] = []
    for apartment in apartments_data or []:
        cid = apartment.get("current_contract_id")
        if cid is None:
            continue
        try:
            contract_ids.append(int(cid))
        except (TypeError, ValueError):
            continue
    unique_cids = list(dict.fromkeys(contract_ids))
    with_inst, overdue_inst = _batch_contract_installment_lease_sets(unique_cids)

    reconciled = []

    for apartment in apartments_data or []:
        expected_lease_status = _derive_apartment_lease_status_for_existing_row(
            apartment,
            with_inst,
            overdue_inst,
        )

        if apartment.get("lease_status") != expected_lease_status:
            update_payload = {
                "lease_status": expected_lease_status,
            }
            try:
                update_result = (
                    supabase.table("apartments")
                    .update(update_payload)
                    .eq("id", apartment.get("id"))
                    .execute()
                )
                if getattr(update_result, "data", None):
                    apartment = update_result.data[0]
                else:
                    apartment = {**apartment, **update_payload}
            except Exception:
                logger.exception("Failed to reconcile apartment status for apartment_id=%s", apartment.get("id"))
                apartment = {**apartment, **update_payload}

        reconciled.append(apartment)

    return reconciled


def _maintenance_request_is_open(status_raw) -> bool:
    st = str(status_raw or "").lower()
    return st not in ("resolved", "closed")


def _reconcile_owner_apartment_maintenance_pointers(apartments_data: list[dict]) -> list[dict]:
    """
    Keep apartments.maintenance_id in sync with open maintenance_requests rows.
    Points to the lowest id among open requests for that apartment (stable primary ticket).
    """
    if not apartments_data:
        return apartments_data

    apt_ids: list[int] = []
    for apartment in apartments_data:
        aid = apartment.get("id")
        if aid is None:
            continue
        try:
            apt_ids.append(int(aid))
        except (TypeError, ValueError):
            continue
    if not apt_ids:
        return apartments_data

    try:
        res = (
            supabase.table("maintenance_requests")
            .select("id, apartment_id, status, request_type")
            .in_("apartment_id", apt_ids)
            .execute()
        )
    except Exception:
        logger.exception("maintenance_requests batch read failed; skipping maintenance_id reconcile")
        return apartments_data

    open_ids_by_apt: dict[int, list[int]] = defaultdict(list)
    for row in getattr(res, "data", None) or []:
        if not _maintenance_request_is_open(row.get("status")):
            continue
        # Include all request categories created via POST /api/maintenance (not only literal "maintenance").
        rt = str(row.get("request_type") or "maintenance").lower()
        if rt not in ("maintenance", "complaint", "suggestion", "request"):
            continue
        aid = row.get("apartment_id")
        rid = row.get("id")
        if aid is None or rid is None:
            continue
        try:
            open_ids_by_apt[int(aid)].append(int(rid))
        except (TypeError, ValueError):
            continue

    expected: dict[int, int | None] = {}
    for aid in apt_ids:
        rids = open_ids_by_apt.get(aid) or []
        expected[aid] = min(rids) if rids else None

    reconciled: list[dict] = []
    for apartment in apartments_data:
        aid = apartment.get("id")
        if aid is None:
            reconciled.append(apartment)
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            reconciled.append(apartment)
            continue

        exp = expected.get(iaid)
        cur = apartment.get("maintenance_id")
        try:
            cur_i = int(cur) if cur is not None else None
        except (TypeError, ValueError):
            cur_i = None

        if cur_i == exp:
            reconciled.append(apartment)
            continue

        update_payload = {"maintenance_id": exp}
        try:
            update_result = (
                supabase.table("apartments")
                .update(update_payload)
                .eq("id", iaid)
                .execute()
            )
            if getattr(update_result, "data", None):
                apartment = update_result.data[0]
            else:
                apartment = {**apartment, **update_payload}
        except Exception:
            logger.exception("Failed to reconcile maintenance_id for apartment_id=%s", iaid)
            apartment = {**apartment, **update_payload}

        reconciled.append(apartment)

    return reconciled


def _denormalized_tenant_present(apt: dict) -> bool:
    if apt.get("tenant_user_id") is not None:
        return True
    if apt.get("tenant_national_id"):
        return True
    ti = apt.get("tenant_info") or {}
    if isinstance(ti, dict) and (ti.get("fullName") or ti.get("full_name")):
        return True
    return False


def _repair_stale_apartment_tenant_columns(rows: list[dict]) -> list[dict]:
    """
    Persist a fix when contracts were removed in SQL/Table Editor but apartments still hold tenant_*.
    Also clears when current_contract_id points at a missing contract id.
    """
    if not rows:
        return rows
    to_fix: set[int] = set()

    cids: list[int] = []
    for r in rows:
        aid = r.get("id")
        if aid is None:
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            continue
        cid = r.get("current_contract_id")
        if cid is None:
            if _denormalized_tenant_present(r):
                to_fix.add(iaid)
            continue
        try:
            icid = int(cid)
        except (TypeError, ValueError):
            to_fix.add(iaid)
            continue
        cids.append(icid)

    existing_contracts: set[int] = set()
    if cids:
        unique_cids = list(dict.fromkeys(cids))
        try:
            cr = supabase.table("contracts").select("id").in_("id", unique_cids).execute()
            for row in getattr(cr, "data", None) or []:
                if row.get("id") is not None:
                    existing_contracts.add(int(row["id"]))
        except Exception:
            logger.exception("repair: contract batch lookup failed")

    for r in rows:
        aid = r.get("id")
        if aid is None:
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            continue
        cid = r.get("current_contract_id")
        if cid is None:
            continue
        try:
            icid = int(cid)
        except (TypeError, ValueError):
            continue
        if icid not in existing_contracts:
            to_fix.add(iaid)

    if not to_fix:
        return rows

    fix_list = list(to_fix)
    clear_payload = {
        "tenant_user_id": None,
        "tenant_national_id": None,
        "tenant_info": None,
        "current_contract_id": None,
        "lease_status": "vacant",
        "maintenance_id": None,
        "rent": 0,
    }
    try:
        for aid in fix_list:
            try:
                supabase.table("tenants").update({"apartment_id": None}).eq("apartment_id", aid).execute()
            except Exception:
                logger.exception("repair: detach tenants for apartment_id=%s", aid)
        supabase.table("apartments").update(clear_payload).in_("id", fix_list).execute()
        logger.info("repair stale apartment tenant columns: apartment_ids=%s", fix_list)
    except Exception:
        logger.exception("repair: batch clear apartment tenant columns failed")
        return rows

    try:
        refreshed = supabase.table("apartments").select("*").in_("id", fix_list).execute()
        fresh_by_id = {int(x["id"]): x for x in (getattr(refreshed, "data", None) or [])}
    except Exception:
        logger.exception("repair: re-fetch apartments failed")
        fresh_by_id = {}

    out: list[dict] = []
    for r in rows:
        rid = r.get("id")
        try:
            ir = int(rid)
        except (TypeError, ValueError):
            out.append(r)
            continue
        if ir in fresh_by_id:
            out.append(fresh_by_id[ir])
        else:
            out.append(r)
    return out


def _is_contract_row_active(row: dict) -> bool:
    return str(row.get("status") or "active").lower() == "active"


def _active_contract_rows_for_apartment(apartment_id: int) -> list[dict]:
    try:
        res = (
            supabase.table("contracts")
            .select("id, status, apartment_id")
            .eq("apartment_id", apartment_id)
            .execute()
        )
    except Exception:
        logger.exception("contracts list failed apartment_id=%s", apartment_id)
        return []
    return [r for r in (getattr(res, "data", None) or []) if _is_contract_row_active(r)]


def reconcile_apartment_maintenance_pointer(apartment_id: int) -> None:
    """Call after maintenance_requests create/update to refresh FK on apartments."""
    res = supabase.table("apartments").select("id, maintenance_id").eq("id", apartment_id).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        return
    _reconcile_owner_apartment_maintenance_pointers(rows)


def _get_or_create_tenant_row(tenant_user_id: int | None, apartment_id: int, start_date, end_date) -> dict:
    existing_tenants = (
        supabase.table("tenants")
        .select("*")
        .eq("apartment_id", apartment_id)
        .order("id", desc=True)
        .execute()
    )
    tenant_rows = getattr(existing_tenants, "data", None) or []
    logger.info("tenant profile lookup response: %s", tenant_rows)

    tenant_row = None
    if tenant_user_id is not None:
        tenant_row = next(
            (row for row in tenant_rows if row.get("user_id") is not None and int(row.get("user_id")) == int(tenant_user_id)),
            None,
        )
    else:
        tenant_row = next((row for row in tenant_rows if row.get("user_id") is None), None)

    if tenant_row:
        update_payload = {
            "apartment_id": apartment_id,
            "lease_start": start_date,
            "lease_end": end_date,
        }
        if tenant_user_id is not None and tenant_row.get("user_id") is None:
            update_payload["user_id"] = tenant_user_id
        update_payload = {k: v for k, v in update_payload.items() if v is not None}

        if update_payload:
            tenant_update = (
                supabase.table("tenants")
                .update(update_payload)
                .eq("id", tenant_row["id"])
                .execute()
            )
            logger.info("tenant profile update payload: %s", update_payload)
            logger.info("tenant profile update response: %s", getattr(tenant_update, "data", None))
            if tenant_update.data:
                return tenant_update.data[0]
        return tenant_row

    insert_payload = {
        "apartment_id": apartment_id,
        "lease_start": start_date,
        "lease_end": end_date,
    }
    if tenant_user_id is not None:
        insert_payload["user_id"] = tenant_user_id
    insert_payload = {k: v for k, v in insert_payload.items() if v is not None}
    logger.info("tenant profile insert payload: %s", insert_payload)

    tenant_insert = supabase.table("tenants").insert(insert_payload).execute()
    logger.info("tenant profile insert response: %s", getattr(tenant_insert, "data", None))
    if not tenant_insert.data:
        raise HTTPException(status_code=500, detail="Failed to create tenant profile row")

    return tenant_insert.data[0]

@router.post("/apartments", response_model=ApartmentResponse)
async def create_apartment(apartment: Apartment, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can create apartments")
    
    apartment_data = apartment.dict()
    apartment_data["owner_id"] = current_user["id"]
    response = supabase.table("apartments").insert(apartment_data).execute()
    row = dict(response.data[0])
    _attach_building_names([row])
    return ApartmentResponse(**row)

@router.get("/apartments", response_model=list[ApartmentResponse])
async def get_apartments(
    view: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    rows: list[dict] = []

    as_tenant_view = (view or "").strip().lower() == "as_tenant"

    if has_role(current_user, "owner") and not as_tenant_view:
        owner_rows_result = (
            supabase.table("apartments")
            .select("*")
            .eq("owner_id", current_user["id"])
            .execute()
        )
        rows = getattr(owner_rows_result, "data", None) or []
        rows = _repair_stale_apartment_tenant_columns(rows)
        rows = _reconcile_owner_apartment_statuses(rows)
        rows = _reconcile_owner_apartment_maintenance_pointers(rows)
    else:
        by_user_result = (
            supabase.table("apartments")
            .select("*")
            .eq("tenant_user_id", current_user["id"])
            .execute()
        )
        rows = getattr(by_user_result, "data", None) or []

        national_id_raw = current_user.get("national_id")
        variants = national_id_lookup_variants(national_id_raw)
        canon = normalize_saudi_national_id(national_id_raw)
        if variants:
            by_national_result = (
                supabase.table("apartments")
                .select("*")
                .in_("tenant_national_id", variants)
                .execute()
            )
            for apartment in getattr(by_national_result, "data", None) or []:
                apt_nid = normalize_saudi_national_id(apartment.get("tenant_national_id"))
                if canon and apt_nid != canon:
                    continue
                if not any(existing.get("id") == apartment.get("id") for existing in rows):
                    rows.append(apartment)

        # Fallback by tenant profile rows (tenants.user_id -> tenants.apartment_id),
        # so tenant UI still works if apartment tenant columns are temporarily stale.
        tenant_rows_result = (
            supabase.table("tenants")
            .select("apartment_id")
            .eq("user_id", current_user["id"])
            .execute()
        )
        tenant_rows = getattr(tenant_rows_result, "data", None) or []
        tenant_apartment_ids = [row.get("apartment_id") for row in tenant_rows if row.get("apartment_id") is not None]
        tenant_apartment_ids = list(dict.fromkeys(tenant_apartment_ids))
        if tenant_apartment_ids:
            by_tenants_result = (
                supabase.table("apartments")
                .select("*")
                .in_("id", tenant_apartment_ids)
                .execute()
            )
            for apartment in getattr(by_tenants_result, "data", None) or []:
                if not any(existing.get("id") == apartment.get("id") for existing in rows):
                    rows.append(apartment)

    _attach_building_names(rows)
    return [ApartmentResponse(**apt) for apt in rows]

@router.get("/apartments/{apartment_id}", response_model=ApartmentResponse)
async def get_apartment(apartment_id: int, current_user: dict = Depends(get_current_user)):
    apartment = supabase.table("apartments").select("*").eq("id", apartment_id).execute()
    if not apartment.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apt = apartment.data[0]

    try:
        viewer_id = int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized")

    apt_owner_id = apt.get("owner_id")
    try:
        is_landlord = apt_owner_id is not None and int(apt_owner_id) == viewer_id
    except (TypeError, ValueError):
        is_landlord = False

    if not is_landlord:
        current_national_id = current_user.get("national_id")
        is_linked_tenant = (
            apt.get("tenant_user_id") == viewer_id
            or (current_national_id and apt.get("tenant_national_id") == current_national_id)
        )
        if not is_linked_tenant:
            tenant = (
                supabase.table("tenants")
                .select("id")
                .eq("user_id", viewer_id)
                .eq("apartment_id", apartment_id)
                .limit(1)
                .execute()
            )
            if not getattr(tenant, "data", None):
                raise HTTPException(status_code=403, detail="Not authorized")

    if is_landlord:
        tmp = _repair_stale_apartment_tenant_columns([dict(apt)])
        tmp = _reconcile_owner_apartment_statuses(tmp)
        tmp = _reconcile_owner_apartment_maintenance_pointers(tmp)
        apt = tmp[0]

    row = dict(apt)
    # Owner contact on the apartment row (same user may be owner_id and tenant_user_id in test data).
    if row.get("owner_id") is not None:
        try:
            oid = int(row["owner_id"])
            ures = (
                supabase.table("users")
                .select("*")
                .eq("id", oid)
                .limit(1)
                .execute()
            )
            if getattr(ures, "data", None):
                ou = ures.data[0]
                row["owner_public_name"] = (
                    ou.get("name")
                    or ou.get("full_name")
                    or ou.get("fullName")
                )
                row["owner_public_national_id"] = (
                    ou.get("national_id") or ou.get("nationalId")
                )
        except Exception:
            logger.exception(
                "owner_public lookup failed for tenant apartment_id=%s", apartment_id
            )

    _attach_building_names([row])
    return ApartmentResponse(**row)


def _contract_snapshot_for_history(contract_id) -> dict | None:
    if contract_id is None:
        return None
    try:
        cid = int(contract_id)
    except (TypeError, ValueError):
        return None
    try:
        cres = (
            supabase.table("contracts")
            .select("id, start_date, end_date")
            .eq("id", cid)
            .limit(1)
            .execute()
        )
        rows = getattr(cres, "data", None) or []
        if not rows:
            return None
        c = rows[0]
        return {
            "id": c.get("id"),
            "startDate": str(c["start_date"])[:10] if c.get("start_date") else None,
            "endDate": str(c["end_date"])[:10] if c.get("end_date") else None,
        }
    except Exception:
        logger.exception("contract snapshot for apartment_history")
        return None


def _building_name_from_id(building_id) -> str | None:
    if building_id is None:
        return None
    try:
        bid = int(building_id)
    except (TypeError, ValueError):
        return None
    try:
        bres = (
            supabase.table("buildings")
            .select("name")
            .eq("id", bid)
            .limit(1)
            .execute()
        )
        rows = getattr(bres, "data", None) or []
        if not rows:
            return None
        return rows[0].get("name")
    except Exception:
        logger.exception("buildings name lookup for apartment_history")
        return None


def _attach_building_names(rows: list[dict] | None) -> None:
    """Set building_name on each row from buildings.name (batch lookup)."""
    if not rows:
        return
    ids: list[int] = []
    for r in rows:
        bid = r.get("building_id")
        if bid is None:
            continue
        try:
            ids.append(int(bid))
        except (TypeError, ValueError):
            continue
    ids = list(dict.fromkeys(ids))
    if not ids:
        return
    bmap: dict[int, str | None] = {}
    try:
        bres = supabase.table("buildings").select("id,name").in_("id", ids).execute()
        for brow in getattr(bres, "data", None) or []:
            try:
                bid = int(brow.get("id"))
            except (TypeError, ValueError):
                continue
            bmap[bid] = brow.get("name")
    except Exception:
        logger.exception("batch building name lookup for apartment responses")
        return
    for r in rows:
        bid = r.get("building_id")
        if bid is None:
            continue
        try:
            bid_int = int(bid)
        except (TypeError, ValueError):
            continue
        name = bmap.get(bid_int)
        if name is not None:
            r["building_name"] = name


def _user_can_view_apartment_row(apt: dict, current_user: dict) -> bool:
    try:
        viewer_id = int(current_user["id"])
    except (TypeError, ValueError):
        return False
    apt_owner_id = apt.get("owner_id")
    try:
        if apt_owner_id is not None and int(apt_owner_id) == viewer_id:
            return True
    except (TypeError, ValueError):
        pass
    current_national_id = current_user.get("national_id")
    if (
        apt.get("tenant_user_id") == viewer_id
        or (current_national_id and apt.get("tenant_national_id") == current_national_id)
    ):
        return True
    try:
        tenant = (
            supabase.table("tenants")
            .select("id")
            .eq("user_id", viewer_id)
            .eq("apartment_id", apt.get("id"))
            .limit(1)
            .execute()
        )
        if getattr(tenant, "data", None):
            return True
    except Exception:
        logger.exception("tenant fallback auth for apartment_history")
    return False


@router.get("/apartments/{apartment_id}/tenant-history")
async def get_apartment_tenant_history(
    apartment_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Rows from public.apartment_history for this unit (e.g. vacate snapshots)."""
    try:
        aid = int(apartment_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid apartment_id")

    apt_res = supabase.table("apartments").select("*").eq("id", aid).limit(1).execute()
    if not apt_res.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apt = apt_res.data[0]
    if not _user_can_view_apartment_row(apt, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        hres = (
            supabase.table("apartment_history")
            .select("*")
            .eq("apartment_id", aid)
            .order("changed_at", desc=True)
            .execute()
        )
    except Exception as exc:
        logger.exception("apartment_history select failed apartment_id=%s", aid)
        raise HTTPException(status_code=503, detail=f"apartment_history query failed: {exc!s}") from exc

    rows = getattr(hres, "data", None) or []
    default_building_name = _building_name_from_id(apt.get("building_id"))
    enriched: list[dict] = []
    for row in rows:
        r = dict(row)
        od = r.get("old_data")
        if isinstance(od, dict) and default_building_name and not od.get("buildingName"):
            r["old_data"] = {**od, "buildingName": default_building_name}
        enriched.append(r)
    return enriched


@router.patch("/apartments/{apartment_id}/assign-tenant")
async def assign_tenant_to_apartment(
    apartment_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    logger.info("assign-tenant route entered: apartment_id=%s current_user_id=%s", apartment_id, current_user.get("id"))
    try:
        if not has_role(current_user, "owner"):
            raise HTTPException(status_code=403, detail="Only owners can assign tenants")

        logger.info("assign-tenant incoming payload: apartment_id=%s payload=%s", apartment_id, payload)
        normalized_payload = _normalize_assign_payload(payload)
        logger.info("assign-tenant normalized payload: %s", normalized_payload)

        # Verify apartment exists and belongs to this owner
        apt_result = supabase.table("apartments").select("*").eq("id", apartment_id).execute()
        logger.info("assign-tenant apartment lookup response: %s", getattr(apt_result, "data", None))
        if not apt_result.data:
            raise HTTPException(status_code=404, detail="Apartment not found")
        apartment = apt_result.data[0]
        apt_owner = apartment.get("owner_id")
        if apt_owner is None or int(apt_owner) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")

        tenant_user_id = _resolve_tenant_user_id(normalized_payload)
        tenant_national_id = normalized_payload.get("tenant_national_id")
        if not tenant_national_id and tenant_user_id is None:
            raise HTTPException(
                status_code=400,
                detail="tenant_national_id is required when tenant_user_id is missing",
            )

        logger.info("assign-tenant resolved tenant_user_id=%s", tenant_user_id)
        logger.info("assign-tenant tenant data payload: national_id=%s tenant_info=%s", tenant_national_id, normalized_payload.get("tenant_info"))

        lease_start = normalized_payload.get("start_date")
        lease_end = normalized_payload.get("end_date")
        if not lease_start or not lease_end:
            raise HTTPException(
                status_code=400,
                detail="start_date and end_date are required (maps to tenants.lease_start / lease_end and contract dates).",
            )

        tenant_row = _get_or_create_tenant_row(
            tenant_user_id=tenant_user_id,
            apartment_id=apartment_id,
            start_date=lease_start,
            end_date=lease_end,
        )
        logger.info("assign-tenant tenant row used: %s", tenant_row)

        # Build contract terms (meter + notes in JSON when needed).
        meter_number = normalized_payload.get("meter_number")
        notes_value = normalized_payload.get("notes") or ""
        if meter_number is not None and str(meter_number).strip() != "":
            contract_terms = json.dumps(
                {
                    "notes": notes_value,
                    "meterNumber": str(meter_number).strip(),
                },
                ensure_ascii=False,
            )
        else:
            contract_terms = notes_value

        contract_update_body = {
            "tenant_id": tenant_row.get("id"),
            "start_date": lease_start,
            "end_date": lease_end,
            "terms": contract_terms,
        }
        contract_update_body = {k: v for k, v in contract_update_body.items() if v is not None}

        existing_ccid = apartment.get("current_contract_id")
        try:
            existing_ccid_int = int(existing_ccid) if existing_ccid is not None else None
        except (TypeError, ValueError):
            existing_ccid_int = None

        contract_id: int | None = None

        if existing_ccid_int is not None:
            ver = (
                supabase.table("contracts")
                .select("id, apartment_id")
                .eq("id", existing_ccid_int)
                .limit(1)
                .execute()
            )
            vr = getattr(ver, "data", None) or []
            if not vr:
                raise HTTPException(status_code=400, detail="current_contract_id not found")
            try:
                if int(vr[0].get("apartment_id")) != int(apartment_id):
                    raise HTTPException(
                        status_code=400,
                        detail="current_contract_id does not belong to this apartment",
                    )
            except HTTPException:
                raise
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Invalid contract apartment reference") from None

            try:
                upd_c = (
                    supabase.table("contracts")
                    .update(contract_update_body)
                    .eq("id", existing_ccid_int)
                    .execute()
                )
            except Exception as exc:
                logger.exception("assign-tenant contract update failed contract_id=%s", existing_ccid_int)
                raise HTTPException(status_code=500, detail=f"Contract update failed: {str(exc)}") from exc
            if not getattr(upd_c, "data", None):
                raise HTTPException(status_code=500, detail="Contract update returned empty response")
            contract_id = existing_ccid_int
            logger.info("assign-tenant updated existing contract id=%s", contract_id)
        else:
            apt_race = (
                supabase.table("apartments")
                .select("id, current_contract_id")
                .eq("id", apartment_id)
                .limit(1)
                .execute()
            )
            ar = getattr(apt_race, "data", None) or []
            if ar and ar[0].get("current_contract_id"):
                raise HTTPException(
                    status_code=409,
                    detail="Tenant link was already saved for this apartment. Refresh the page.",
                )

            active_for_apt = _active_contract_rows_for_apartment(apartment_id)
            if active_for_apt:
                raise HTTPException(
                    status_code=409,
                    detail="This apartment already has an active contract. Refresh the page or end the current lease first.",
                )

            contract_data = {
                "apartment_id": apartment_id,
                "tenant_id": tenant_row.get("id"),
                "start_date": lease_start,
                "end_date": lease_end,
                "terms": contract_terms,
            }
            contract_data = {k: v for k, v in contract_data.items() if v is not None}
            logger.info("assign-tenant contract insert payload: %s", contract_data)

            contract_result = supabase.table("contracts").insert(contract_data).execute()
            logger.info("assign-tenant contract insert response: %s", getattr(contract_result, "data", None))
            if not contract_result.data:
                raise HTTPException(status_code=500, detail="Failed to create contract record: empty response from Supabase")

            created_contract = contract_result.data[0]
            contract_id = created_contract.get("id")
            logger.info("assign-tenant created contract id=%s", contract_id)

        tenant_info = normalized_payload.get("tenant_info") or {}
        full_name = tenant_info.get("fullName", tenant_info.get("full_name"))
        phone_number = tenant_info.get("phoneNumber", tenant_info.get("phone_number"))
        nationality = tenant_info.get("nationality")
        tenant_type = tenant_info.get("tenantType", tenant_info.get("tenant_type"))
        lease_status_value = _derive_lease_status(
            normalized_payload.get("start_date"),
            tenant_national_id,
        )

        rent_value = normalized_payload.get("rent")
        try:
            rent_value = float(rent_value) if rent_value is not None else None
        except (TypeError, ValueError):
            rent_value = None

        update_payload = {
            "tenant_user_id": tenant_user_id,
            "tenant_national_id": tenant_national_id,
            "tenant_info": {
                "fullName": full_name,
                "phoneNumber": phone_number,
                "nationality": nationality,
                "tenantType": tenant_type,
            },
            "current_contract_id": contract_id,
            "lease_status": lease_status_value,
        }
        if rent_value is not None:
            update_payload["rent"] = rent_value
        for db_key in ("bedrooms", "bathrooms", "living_rooms"):
            raw = normalized_payload.get(db_key)
            if raw is None or raw == "":
                continue
            try:
                update_payload[db_key] = int(raw)
            except (TypeError, ValueError):
                pass

        logger.info(
            "assign-tenant apartment update start: apartment_id=%s contract_id=%s tenant_user_id=%s payload=%s",
            apartment_id,
            contract_id,
            tenant_user_id,
            update_payload,
        )

        try:
            update_result = supabase.table("apartments").update(update_payload).eq("id", apartment_id).execute()
        except Exception as update_exc:
            logger.exception(
                "assign-tenant apartment update exception: apartment_id=%s contract_id=%s tenant_user_id=%s",
                apartment_id,
                contract_id,
                tenant_user_id,
            )
            raise HTTPException(status_code=500, detail=f"Apartment update failed: {str(update_exc)}")

        logger.info(
            "assign-tenant apartment update response: apartment_id=%s contract_id=%s tenant_user_id=%s response=%s",
            apartment_id,
            contract_id,
            tenant_user_id,
            getattr(update_result, "data", None),
        )

        if not update_result.data:
            logger.error("assign-tenant apartment update failed, rolling back contract_id=%s", contract_id)
            if existing_ccid_int is None and contract_id is not None:
                try:
                    supabase.table("contracts").delete().eq("id", contract_id).execute()
                except Exception:
                    logger.exception("assign-tenant rollback failed for contract_id=%s", contract_id)
            raise HTTPException(
                status_code=500,
                detail="Apartment update failed: empty response from Supabase. "
                       "Check that columns tenant_user_id, tenant_national_id, tenant_info, "
                      "current_contract_id, lease_status exist in apartments table.",
            )

        updated_apt = update_result.data[0]
        reconciled = _reconcile_owner_apartment_statuses([dict(updated_apt)])
        reconciled = _reconcile_owner_apartment_maintenance_pointers(reconciled)
        updated_apt = reconciled[0]
        _attach_building_names([updated_apt])
        logger.info("assign-tenant final response apartment_id=%s response=%s", apartment_id, updated_apt)
        return updated_apt
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("assign-tenant unexpected exception apartment_id=%s", apartment_id)
        raise HTTPException(status_code=500, detail=f"assign-tenant internal error: {str(exc)}")


@router.patch("/apartments/{apartment_id}/vacate-tenant", response_model=ApartmentResponse)
async def vacate_tenant(apartment_id: int, current_user: dict = Depends(get_current_user)):
    """
    End the active tenancy on the apartment row. Does not delete the contract row (history);
    clears tenant links and current_contract_id on the apartment only.
    """
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can vacate tenants")

    try:
        apt_id_int = int(apartment_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid apartment_id")

    apt_result = supabase.table("apartments").select("*").eq("id", apt_id_int).execute()
    if not apt_result.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apartment = apt_result.data[0]

    apt_owner = apartment.get("owner_id")
    try:
        if apt_owner is None or int(apt_owner) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")
    except HTTPException:
        raise
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")

    tenant_info_pre = apartment.get("tenant_info") or {}
    had_tenancy = bool(
        apartment.get("tenant_user_id")
        or apartment.get("tenant_national_id")
        or tenant_info_pre.get("fullName")
        or tenant_info_pre.get("full_name")
        or apartment.get("current_contract_id")
    )
    if had_tenancy:
        old_data_hist: dict = {
            "tenantInfo": tenant_info_pre,
            "tenantNationalId": apartment.get("tenant_national_id"),
            "tenantUserId": apartment.get("tenant_user_id"),
            "currentContractId": apartment.get("current_contract_id"),
            "rent": apartment.get("rent"),
        }
        bn_hist = _building_name_from_id(apartment.get("building_id"))
        if bn_hist:
            old_data_hist["buildingName"] = bn_hist
        apt_num = apartment.get("apartment_number")
        if apt_num is not None and str(apt_num).strip() != "":
            old_data_hist["apartmentNumber"] = str(apt_num).strip()
        csnap = _contract_snapshot_for_history(apartment.get("current_contract_id"))
        if csnap:
            old_data_hist["contract"] = csnap
        try:
            supabase.table("apartment_history").insert(
                {
                    "apartment_id": apt_id_int,
                    "user_id": int(current_user["id"]),
                    "change_type": "tenant_vacated",
                    "old_data": old_data_hist,
                    "new_data": {"lease_status": "vacant", "current_contract_id": None},
                }
            ).execute()
        except Exception:
            logger.exception("apartment_history insert failed on vacate apartment_id=%s", apt_id_int)

    ccid_end = apartment.get("current_contract_id")
    if ccid_end is not None:
        try:
            supabase.table("contracts").update({"status": "terminated"}).eq("id", int(ccid_end)).execute()
        except Exception:
            logger.exception("vacate: could not mark contract terminated id=%s", ccid_end)

    # Clear tenant snapshot including agreed/listed rent on the apartment row (vacant unit).
    update_payload = {
        "tenant_user_id": None,
        "tenant_national_id": None,
        "tenant_info": None,
        "current_contract_id": None,
        "lease_status": "vacant",
        "maintenance_id": None,
        "rent": 0,
    }

    try:
        # Detach all tenant profile rows pointing at this unit (covers national-id-only links and stale user_id).
        supabase.table("tenants").update({"apartment_id": None}).eq("apartment_id", apt_id_int).execute()
    except Exception:
        logger.exception("vacate-tenant: failed to detach tenants rows for apartment_id=%s", apt_id_int)

    try:
        update_result = supabase.table("apartments").update(update_payload).eq("id", apt_id_int).execute()
    except Exception as exc:
        logger.exception("vacate-tenant apartment update failed apartment_id=%s", apt_id_int)
        raise HTTPException(status_code=500, detail=f"Apartment update failed: {str(exc)}") from exc

    if not update_result.data:
        raise HTTPException(status_code=500, detail="Apartment update failed: empty response")

    updated_apt = update_result.data[0]
    reconciled = _reconcile_owner_apartment_statuses([dict(updated_apt)])
    reconciled = _reconcile_owner_apartment_maintenance_pointers(reconciled)
    row = reconciled[0] if reconciled else updated_apt

    if row.get("owner_id") is not None:
        try:
            oid = int(row["owner_id"])
            ures = (
                supabase.table("users")
                .select("*")
                .eq("id", oid)
                .limit(1)
                .execute()
            )
            if getattr(ures, "data", None):
                ou = ures.data[0]
                row["owner_public_name"] = (
                    ou.get("name")
                    or ou.get("full_name")
                    or ou.get("fullName")
                )
                row["owner_public_national_id"] = (
                    ou.get("national_id") or ou.get("nationalId")
                )
        except Exception:
            logger.exception("vacate-tenant owner_public lookup failed apartment_id=%s", apt_id_int)

    _attach_building_names([row])
    return ApartmentResponse(**row)