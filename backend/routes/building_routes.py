import logging
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from installment_service import cycle_months
from models import Building, BuildingResponse, CostResponse, UnitLayoutBody
from config import supabase
from routes.auth_routes import get_current_user
from routes.cost_routes import _row_to_response as _cost_row_to_response
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_iso_date(val) -> date | None:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except (TypeError, ValueError):
        return None


def _contract_id_to_period_months(
    contract_rows: list[dict], installment_rows: list[dict]
) -> dict[int, int]:
    """
    Months covered by one installment row for that contract (1=monthly, 3=quarterly, …).
    Prefer contracts.payment_cycle; else infer from spacing between consecutive due_dates.
    """
    result: dict[int, int] = {}
    for c in contract_rows or []:
        cid = c.get("id")
        if cid is None:
            continue
        try:
            ic = int(cid)
        except (TypeError, ValueError):
            continue
        pc = c.get("payment_cycle")
        if pc is not None and str(pc).strip() != "":
            result[ic] = cycle_months(str(pc))

    by_cid: dict[int, list[dict]] = defaultdict(list)
    for r in installment_rows or []:
        cid = r.get("contract_id")
        if cid is None:
            continue
        try:
            by_cid[int(cid)].append(r)
        except (TypeError, ValueError):
            continue

    for cid, group in by_cid.items():
        if cid in result and result[cid] >= 1:
            continue
        sorted_g = sorted(group, key=lambda x: str(x.get("due_date") or ""))
        if len(sorted_g) >= 2:
            d0 = _parse_iso_date(sorted_g[0].get("due_date"))
            d1 = _parse_iso_date(sorted_g[1].get("due_date"))
            if d0 and d1:
                months = (d1.year - d0.year) * 12 + (d1.month - d0.month)
                result[cid] = max(1, months)
        if cid not in result:
            result[cid] = 1

    for c in contract_rows or []:
        if c.get("id") is None:
            continue
        try:
            ic = int(c["id"])
        except (TypeError, ValueError):
            continue
        result.setdefault(ic, 1)

    return result


def _to_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_building_payload(payload: dict, owner_id: int) -> dict:
    building_name = payload.get("name")
    building_city = payload.get("city")
    building_lat = _to_float(payload.get("latitude"))
    building_lng = _to_float(payload.get("longitude"))

    if not building_name or not building_city:
        raise HTTPException(status_code=400, detail="name and city are required")
    if building_lat is None or building_lng is None:
        raise HTTPException(status_code=400, detail="latitude and longitude are required")

    raw_nb = payload.get("neighborhood")
    neighborhood = None
    if raw_nb is not None:
        s = str(raw_nb).strip()
        neighborhood = s if s else None

    normalized = {
        "owner_id": owner_id,
        "name": building_name,
        "city": building_city,
        "code": payload.get("code") or payload.get("id"),
        # Optional geo location for map pin
        "latitude": building_lat,
        "longitude": building_lng,
        "total_floors": _to_int(payload.get("total_floors", payload.get("totalFloors")), 0),
        "apartments_count": _to_int(
            payload.get("apartments_count", payload.get("apartment_count", payload.get("apartmentCount"))),
            0,
        ),
        "apartments_per_floor": _to_int(payload.get("apartments_per_floor", payload.get("apartmentsPerFloor")), 0),
        "apartment_defaults": payload.get("apartment_defaults", payload.get("apartmentDefaults")),
        "payment_defaults": payload.get("payment_defaults", payload.get("paymentDefaults")),
    }
    if neighborhood:
        normalized["neighborhood"] = neighborhood

    # Remove empty optional fields so we do not force nulls into strict DB columns.
    return {k: v for k, v in normalized.items() if v is not None}


def _insert_building_with_schema_fallback(building_data: dict):
    """
    Insert building row while tolerating optional columns that may not exist
    on older / newly recreated DB schemas.
    """
    try:
        return supabase.table("buildings").insert(building_data).execute()
    except Exception as exc:
        msg = str(exc).lower()
        fallback = dict(building_data)
        removed: list[str] = []

        # Optional JSON columns are dropped only when the DB error points to them.
        for col in ("apartment_defaults", "payment_defaults"):
            if col in fallback and col in msg:
                fallback.pop(col, None)
                removed.append(col)

        if removed:
            logger.warning(
                "Retrying building insert after dropping optional columns: %s",
                removed,
            )
            try:
                return supabase.table("buildings").insert(fallback).execute()
            except Exception as exc2:
                msg = str(exc2).lower()
                exc = exc2

        # Handle duplicate building code by generating a server-side fallback code.
        if "duplicate key" in msg and "code" in msg:
            fallback2 = dict(fallback)
            fallback2["code"] = f"BLD-{abs(hash(str(fallback2.get('name') or 'x'))) % 1000000}"
            logger.warning("Retrying building insert with regenerated code=%s", fallback2["code"])
            return supabase.table("buildings").insert(fallback2).execute()

        raise exc


def _build_apartment_seed_rows(building_row: dict) -> list[dict]:
    rows: list[dict] = []
    apartment_defaults = building_row.get("apartment_defaults") or {}
    default_bedrooms = _to_int(
        apartment_defaults.get("bedrooms", apartment_defaults.get("roomsCount")), 0
    )
    default_bathrooms = _to_int(
        apartment_defaults.get("bathrooms", apartment_defaults.get("bathroomsCount")), 0
    )
    default_living_rooms = _to_int(
        apartment_defaults.get("livingRooms", apartment_defaults.get("livingRoomsCount")), 0
    )

    apartments_count = _to_int(
        building_row.get("apartments_count", building_row.get("apartment_count")),
        0,
    )
    total_floors = _to_int(
        building_row.get("total_floors", building_row.get("totalFloors")),
        0,
    )
    apartments_per_floor = _to_int(
        building_row.get("apartments_per_floor", building_row.get("apartmentsPerFloor")),
        0,
    )

    if apartments_count < 1 or total_floors < 1:
        return rows

    if apartments_per_floor < 1:
        apartments_per_floor = (apartments_count + total_floors - 1) // total_floors

    building_id = _to_int(building_row.get("id"), 0)
    owner_id = _to_int(building_row.get("owner_id"), 0)
    if building_id < 1:
        raise ValueError("building id missing from inserted building row")
    if owner_id < 1:
        raise ValueError("owner_id missing from inserted building row")

    building_name = building_row.get("name") or "عمارة"

    for current_apartment in range(1, apartments_count + 1):
        floor_number = ((current_apartment - 1) // apartments_per_floor) + 1
        if floor_number > total_floors:
            floor_number = total_floors

        apartment_number = str(current_apartment)
        rows.append(
            {
                "owner_id": owner_id,
                "building_id": building_id,
                "apartment_number": apartment_number,
                "floor_number": floor_number,
                "bedrooms": default_bedrooms,
                "bathrooms": default_bathrooms,
                "living_rooms": default_living_rooms,
                "lease_status": "vacant",
                "address": f"{building_name} - شقة {apartment_number}",
                "description": f"Apartment {apartment_number} in building {building_id}",
            }
        )

    return rows


def _filter_new_apartment_rows(building_id: int, rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    existing_result = (
        supabase.table("apartments")
        .select("apartment_number")
        .eq("building_id", building_id)
        .execute()
    )
    existing_numbers = {
        str(item.get("apartment_number"))
        for item in (getattr(existing_result, "data", None) or [])
        if item.get("apartment_number") is not None
    }

    filtered: list[dict] = []
    for row in rows:
        number = row.get("apartment_number")
        if number is None:
            continue
        if str(number) in existing_numbers:
            continue
        filtered.append(row)

    return filtered


def _expected_apartment_number_set(building_row: dict) -> set[str]:
    apartments_count = _to_int(
        building_row.get("apartments_count", building_row.get("apartment_count")),
        0,
    )
    if apartments_count < 1:
        return set()
    return {str(i) for i in range(1, apartments_count + 1)}


def _fetch_existing_apartment_number_set(building_id: int) -> set[str]:
    existing_result = (
        supabase.table("apartments")
        .select("apartment_number")
        .eq("building_id", building_id)
        .execute()
    )
    return {
        str(item.get("apartment_number"))
        for item in (getattr(existing_result, "data", None) or [])
        if item.get("apartment_number") is not None
    }


def _heal_missing_apartments(building_row: dict) -> dict:
    building_id = _to_int(building_row.get("id"), 0)
    if building_id < 1:
        return {"expected": 0, "before": 0, "after": 0, "healed": 0}

    expected_numbers = _expected_apartment_number_set(building_row)
    before_numbers = _fetch_existing_apartment_number_set(building_id)

    missing_numbers = expected_numbers - before_numbers
    if missing_numbers:
        all_rows = _build_apartment_seed_rows(building_row)
        missing_rows = [r for r in all_rows if str(r.get("apartment_number")) in missing_numbers]
        if missing_rows:
            supabase.table("apartments").insert(missing_rows).execute()
            logger.warning(
                "Apartment seed mismatch detected for building_id=%s, auto-healed missing=%s",
                building_id,
                sorted(missing_numbers, key=lambda x: int(x) if str(x).isdigit() else str(x)),
            )

    after_numbers = _fetch_existing_apartment_number_set(building_id)
    return {
        "expected": len(expected_numbers),
        "before": len(before_numbers),
        "after": len(after_numbers),
        "healed": max(0, len(after_numbers) - len(before_numbers)),
    }

@router.post("/buildings")
async def create_building(building: dict, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can create buildings")

    try:
        owner_id = current_user.get("id")
        if owner_id in (None, ""):
            raise HTTPException(status_code=401, detail="Invalid session: missing user id")
        payload = _normalize_building_payload(building or {}, owner_id)
        # Minimal insert path: write building row only, return raw inserted DB row.
        # This avoids secondary seed/verification failures blocking creation.
        result = _insert_building_with_schema_fallback(payload)
        rows = getattr(result, "data", None) or []
        if not rows:
            raise HTTPException(status_code=500, detail="Failed to create building: empty insert response")
        return rows[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled create_building error")
        raise HTTPException(status_code=500, detail=f"create_building crashed: {str(exc)}")

@router.get("/buildings", response_model=list[BuildingResponse])
async def get_buildings(current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can list buildings")

    result = supabase.table("buildings").select("*").eq("owner_id", current_user["id"]).execute()
    return [BuildingResponse(**b) for b in (result.data or [])]

@router.patch("/buildings/{building_id}", response_model=BuildingResponse)
async def update_building(building_id: int, building: Building, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can edit buildings")

    existing = supabase.table("buildings").select("*").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    if existing.data[0]["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = building.dict(exclude_unset=True)
    effective_lat = update_data.get("latitude", existing.data[0].get("latitude"))
    effective_lng = update_data.get("longitude", existing.data[0].get("longitude"))
    if _to_float(effective_lat) is None or _to_float(effective_lng) is None:
        raise HTTPException(status_code=400, detail="latitude and longitude are required")
    supabase.table("buildings").update(update_data).eq("id", building_id).execute()
    updated = supabase.table("buildings").select("*").eq("id", building_id).execute()
    return BuildingResponse(**updated.data[0])


@router.delete("/buildings/{building_id}")
async def delete_building(building_id: int, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can delete buildings")

    existing = supabase.table("buildings").select("*").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    if int(existing.data[0]["owner_id"]) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        apt_res = (
            supabase.table("apartments")
            .select("id,current_contract_id")
            .eq("building_id", building_id)
            .execute()
        )
        apt_rows = apt_res.data or []
        apt_ids = []
        contract_ids = []
        for row in apt_rows:
            aid = row.get("id")
            if aid is not None:
                try:
                    apt_ids.append(int(aid))
                except (TypeError, ValueError):
                    pass
            ccid = row.get("current_contract_id")
            if ccid is not None:
                try:
                    contract_ids.append(int(ccid))
                except (TypeError, ValueError):
                    pass

        if apt_ids:
            # Include ended leases that are not current_contract_id on apartment rows.
            c_res = (
                supabase.table("contracts")
                .select("id")
                .in_("apartment_id", apt_ids)
                .execute()
            )
            for c in c_res.data or []:
                cid = c.get("id")
                if cid is None:
                    continue
                try:
                    contract_ids.append(int(cid))
                except (TypeError, ValueError):
                    pass

        contract_ids = list(dict.fromkeys(contract_ids))

        # Keep historical maintenance/costs rows for archive/history pages.
        # Remove relational blockers only, then contracts/apartments/building.
        if apt_ids:
            try:
                supabase.table("documents").delete().in_("apartment_id", apt_ids).execute()
            except Exception:
                logger.exception("delete_building: documents cleanup failed building_id=%s", building_id)
            try:
                supabase.table("apartment_history").delete().in_("apartment_id", apt_ids).execute()
            except Exception:
                logger.exception("delete_building: apartment_history cleanup failed building_id=%s", building_id)
            try:
                supabase.table("tenants").update({"apartment_id": None}).in_("apartment_id", apt_ids).execute()
            except Exception:
                logger.exception("delete_building: tenants detachment failed building_id=%s", building_id)

        if contract_ids:
            # Best-effort cleanup only. Some DBs may still have legacy contract triggers
            # referencing removed apartments columns (e.g. `rent`), which can break hard delete.
            # We do not block building deletion on these non-critical history rows.
            try:
                supabase.table("payment_installments").delete().in_("contract_id", contract_ids).execute()
            except Exception:
                logger.exception("delete_building: installments cleanup failed building_id=%s", building_id)
            try:
                # Skip contract deletion failures so active delete can proceed.
                supabase.table("contracts").delete().in_("id", contract_ids).execute()
            except Exception:
                logger.exception("delete_building: contracts cleanup failed building_id=%s", building_id)

        if apt_ids:
            # Break lease link first to avoid contract FK restrictions while deleting apartments.
            try:
                supabase.table("apartments").update({"current_contract_id": None}).in_("id", apt_ids).execute()
            except Exception:
                logger.exception("delete_building: clearing apartment current_contract_id failed building_id=%s", building_id)
            try:
                supabase.table("apartments").delete().in_("id", apt_ids).execute()
            except Exception:
                logger.exception("delete_building: apartments hard-delete failed, trying detach fallback building_id=%s", building_id)
                # Fallback for legacy DB triggers: detach apartments from this building
                # so building row can still be deleted from owner list.
                supabase.table("apartments").update({"building_id": None}).in_("id", apt_ids).execute()
        supabase.table("buildings").delete().eq("id", building_id).execute()
    except Exception as exc:
        logger.exception("delete_building failed building_id=%s", building_id)
        raise HTTPException(status_code=500, detail=f"Failed to delete building: {str(exc)}")

    return {"ok": True}


@router.post("/buildings/{building_id}/unit-layout")
async def apply_building_unit_layout(
    building_id: int,
    body: UnitLayoutBody,
    current_user: dict = Depends(get_current_user),
):
    """
    Upsert apartments for a building from an explicit list (floor + global apartment number + rooms).
    Updates building apartments_count / total_floors / apartments_per_floor for seed/heal consistency.
    """
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can update unit layout")

    units_in = body.units or []
    if not units_in:
        raise HTTPException(status_code=400, detail="units must be a non-empty list")

    existing = supabase.table("buildings").select("*").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")

    building_row = existing.data[0]
    if int(building_row["owner_id"]) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    seen_numbers: set[str] = set()
    normalized: list[dict] = []
    for u in units_in:
        fn = _to_int(u.floor_number, 0)
        an = str(u.apartment_number or "").strip()
        if fn < 1:
            raise HTTPException(status_code=400, detail="floor_number must be >= 1 for every unit")
        if not an:
            raise HTTPException(status_code=400, detail="apartment_number required for every unit")
        if an in seen_numbers:
            raise HTTPException(status_code=400, detail=f"duplicate apartment_number: {an}")
        seen_numbers.add(an)
        normalized.append(
            {
                "floor_number": fn,
                "apartment_number": an,
                "bedrooms": max(0, _to_int(u.bedrooms, 0)),
                "bathrooms": max(0, _to_int(u.bathrooms, 0)),
                "living_rooms": max(0, _to_int(u.living_rooms, 0)),
            }
        )

    cap = _to_int(
        building_row.get("apartments_count", building_row.get("apartment_count")),
        0,
    )
    if cap >= 1 and len(normalized) != cap:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Layout must include exactly {cap} units (this building's apartments_count); "
                f"received {len(normalized)}."
            ),
        )

    building_name = building_row.get("name") or "Building"
    owner_id = _to_int(building_row.get("owner_id"), 0)
    if owner_id < 1:
        raise HTTPException(status_code=500, detail="building owner_id missing")

    created = 0
    updated = 0
    for row in normalized:
        apt_num = row["apartment_number"]
        sel = (
            supabase.table("apartments")
            .select("id")
            .eq("building_id", building_id)
            .eq("apartment_number", apt_num)
            .limit(1)
            .execute()
        )
        payload = {
            "floor_number": row["floor_number"],
            "bedrooms": row["bedrooms"],
            "bathrooms": row["bathrooms"],
            "living_rooms": row["living_rooms"],
        }
        if sel.data:
            supabase.table("apartments").update(payload).eq("id", sel.data[0]["id"]).execute()
            updated += 1
        else:
            insert_row = {
                "owner_id": owner_id,
                "building_id": building_id,
                "apartment_number": apt_num,
                "floor_number": row["floor_number"],
                "bedrooms": row["bedrooms"],
                "bathrooms": row["bathrooms"],
                "living_rooms": row["living_rooms"],
                "lease_status": "vacant",
                "address": f"{building_name} - Apt {apt_num}",
                "description": f"Apartment {apt_num} in building {building_id}",
                "rent": 0,
            }
            supabase.table("apartments").insert(insert_row).execute()
            created += 1

    per_floor: dict[int, int] = defaultdict(int)
    max_floor = 0
    for row in normalized:
        f = row["floor_number"]
        per_floor[f] += 1
        max_floor = max(max_floor, f)
    apm = max(per_floor.values()) if per_floor else 0

    supabase.table("buildings").update(
        {
            "apartments_count": len(normalized),
            "total_floors": max_floor,
            "apartments_per_floor": apm,
        }
    ).eq("id", building_id).execute()

    heal = _heal_missing_apartments(
        {
            **building_row,
            "apartments_count": len(normalized),
            "total_floors": max_floor,
            "apartments_per_floor": apm,
        }
    )

    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "total_units": len(normalized),
        "heal": heal,
    }


@router.post("/buildings/{building_id}/seed-apartments")
async def seed_building_apartments(building_id: int, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can seed apartments")

    existing = supabase.table("buildings").select("*").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")

    building_row = existing.data[0]
    if int(building_row["owner_id"]) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        apartment_rows = _build_apartment_seed_rows(building_row)
        filtered_apartment_rows = _filter_new_apartment_rows(building_id, apartment_rows)
        logger.info(
            "Seed endpoint dedupe for building_id=%s -> generated=%s insertable=%s",
            building_id,
            len(apartment_rows),
            len(filtered_apartment_rows),
        )

        if filtered_apartment_rows:
            apartment_insert_response = supabase.table("apartments").insert(filtered_apartment_rows).execute()
            logger.info(
                "Seed endpoint inserted apartments for building_id=%s, response=%s",
                building_id,
                getattr(apartment_insert_response, "data", None),
            )
        else:
            logger.info("Seed endpoint skipped insert because no new apartment numbers were found")
        heal_result = _heal_missing_apartments(building_row)
        return {
            "created": len(filtered_apartment_rows),
            "generated": len(apartment_rows),
            "verified_expected": heal_result["expected"],
            "verified_before": heal_result["before"],
            "verified_after": heal_result["after"],
            "auto_healed": heal_result["healed"],
            "ok": True,
        }
    except Exception as seed_error:
        logger.exception("Seed endpoint failed for building_id=%s", building_id)
        raise HTTPException(status_code=500, detail=str(seed_error))


@router.get("/buildings/{building_id}/installments")
async def list_building_installments(
    building_id: int,
    current_user: dict = Depends(get_current_user),
):
    """
    All payment_installments for contracts tied to apartments in this building — including
    ended tenancies (vacated units no longer have current_contract_id on the apartment row).
    Used for owner-building monthly income so realized rent in-range is not lost after vacate.
    """
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can list building installments")

    try:
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = supabase.table("buildings").select("id, owner_id").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    if int(existing.data[0].get("owner_id") or -1) != uid:
        raise HTTPException(status_code=403, detail="Not authorized")

    ar = supabase.table("apartments").select("id").eq("building_id", building_id).execute()
    apt_ids = [int(a["id"]) for a in (ar.data or []) if a.get("id") is not None]
    if not apt_ids:
        return []

    cr = (
        supabase.table("contracts")
        .select("*")
        .in_("apartment_id", apt_ids)
        .execute()
    )
    contract_rows = cr.data or []
    cids = [int(c["id"]) for c in contract_rows if c.get("id") is not None]
    cid_to_apt = {
        int(c["id"]): int(c["apartment_id"])
        for c in contract_rows
        if c.get("id") is not None and c.get("apartment_id") is not None
    }
    if not cids:
        return []

    try:
        res = (
            supabase.table("payment_installments")
            .select("*")
            .in_("contract_id", cids)
            .execute()
        )
    except Exception:
        logger.exception("list_building_installments: payment_installments query failed building_id=%s", building_id)
        return []

    out: list[dict] = []
    for row in res.data or []:
        r = dict(row)
        if r.get("apartment_id") is None and r.get("contract_id") is not None:
            try:
                cid = int(r["contract_id"])
                if cid in cid_to_apt:
                    r["apartment_id"] = cid_to_apt[cid]
            except (TypeError, ValueError):
                pass
        out.append(r)

    period_map = _contract_id_to_period_months(contract_rows, out)
    for r in out:
        try:
            cid = int(r.get("contract_id"))
        except (TypeError, ValueError):
            r["period_months"] = 1
            continue
        r["period_months"] = max(1, int(period_map.get(cid, 1)))

    return out


@router.get("/buildings/{building_id}/costs", response_model=list[CostResponse])
async def list_building_costs(
    building_id: int,
    current_user: dict = Depends(get_current_user),
):
    """All cost rows for apartments in this building (owner-only). One query instead of N per-apartment calls."""
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can list building costs")

    try:
        uid = int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = supabase.table("buildings").select("id, owner_id").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    if int(existing.data[0].get("owner_id") or -1) != uid:
        raise HTTPException(status_code=403, detail="Not authorized")

    ar = supabase.table("apartments").select("id").eq("building_id", building_id).execute()
    apt_ids = [int(a["id"]) for a in (ar.data or []) if a.get("id") is not None]
    if not apt_ids:
        return []

    try:
        res = (
            supabase.table("costs")
            .select("*")
            .in_("apartment_id", apt_ids)
            .order("id", desc=True)
            .execute()
        )
    except Exception:
        logger.exception("list_building_costs: query failed building_id=%s", building_id)
        raise HTTPException(status_code=503, detail="Database error") from None

    rows = getattr(res, "data", None) or []
    return [_cost_row_to_response(r) for r in rows]

