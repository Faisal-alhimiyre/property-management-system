import logging
from fastapi import APIRouter, Depends, HTTPException
from models import Building, BuildingResponse
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


def _to_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_building_payload(payload: dict, owner_id: int) -> dict:
    building_name = payload.get("name")
    building_city = payload.get("city")

    if not building_name or not building_city:
        raise HTTPException(status_code=400, detail="name and city are required")

    normalized = {
        "owner_id": owner_id,
        "name": building_name,
        "city": building_city,
        "code": payload.get("code") or payload.get("id"),
        "total_floors": _to_int(payload.get("total_floors", payload.get("totalFloors")), 0),
        "apartments_count": _to_int(
            payload.get("apartments_count", payload.get("apartment_count", payload.get("apartmentCount"))),
            0,
        ),
        "apartments_per_floor": _to_int(payload.get("apartments_per_floor", payload.get("apartmentsPerFloor")), 0),
        "apartment_defaults": payload.get("apartment_defaults", payload.get("apartmentDefaults")),
        "payment_defaults": payload.get("payment_defaults", payload.get("paymentDefaults")),
    }

    # Remove empty optional fields so we do not force nulls into strict DB columns.
    return {k: v for k, v in normalized.items() if v is not None}


def _build_apartment_seed_rows(building_row: dict) -> list[dict]:
    rows: list[dict] = []

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

    building_name = building_row.get("name") or "Ø¹Ù…Ø§Ø±Ø©"

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
                "lease_status": "vacant",
                "address": f"{building_name} - Ø´Ù‚Ø© {apartment_number}",
                "description": f"Apartment {apartment_number} in building {building_id}",
                "rent": 0,
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

@router.post("/buildings", response_model=BuildingResponse)
async def create_building(building: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create buildings")

    logger.info("Create building incoming payload: %s", building)
    building_data = _normalize_building_payload(building or {}, int(current_user["id"]))

    # Strip fields that exist in our payload but are NOT columns in the buildings DB table.
    # These are used only for apartment seeding, so we keep them in a separate dict.
    _NON_DB_BUILDING_FIELDS = {"apartments_per_floor", "apartment_defaults", "payment_defaults"}
    building_meta = {k: building_data.pop(k) for k in list(building_data.keys()) if k in _NON_DB_BUILDING_FIELDS}

    logger.info("Create building payload mapped for DB: %s", building_data)
    logger.info("Create building non-DB meta (for apartment seeding): %s", building_meta)
    result = supabase.table("buildings").insert(building_data).execute()
    logger.info("Building insert full response object: %s", result)
    logger.info("Building insert response data: %s", getattr(result, "data", None))

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create building: empty insert response")

    inserted_building_id = _to_int(result.data[0].get("id"), 0)
    if inserted_building_id < 1:
        raise HTTPException(status_code=500, detail="Building insert succeeded but no id returned")

    created_row_result = supabase.table("buildings").select("*").eq("id", inserted_building_id).limit(1).execute()
    logger.info("Building select-after-insert response data: %s", getattr(created_row_result, "data", None))
    if not created_row_result.data:
        raise HTTPException(status_code=500, detail="Building inserted but could not be fetched by id")

    new_building = created_row_result.data[0]

    # Merge the non-DB metadata back in so _build_apartment_seed_rows can use apartments_per_floor.
    new_building_with_meta = {**new_building, **building_meta}
    apartment_rows = _build_apartment_seed_rows(new_building_with_meta)
    logger.info(
        "Generated %s apartments for building_id=%s",
        len(apartment_rows),
        new_building.get("id"),
    )

    if apartment_rows:
        logger.info("Sample apartment payload before dedupe: %s", apartment_rows[0])

    filtered_apartment_rows = _filter_new_apartment_rows(inserted_building_id, apartment_rows)
    logger.info(
        "Apartment dedupe result for building_id=%s -> generated=%s insertable=%s",
        inserted_building_id,
        len(apartment_rows),
        len(filtered_apartment_rows),
    )
    if filtered_apartment_rows:
        logger.info("Sample apartment payload after dedupe: %s", filtered_apartment_rows[0])

    try:
        if filtered_apartment_rows:
            apartment_insert_response = supabase.table("apartments").insert(filtered_apartment_rows).execute()
            logger.info(
                "Apartment insert response data: %s",
                getattr(apartment_insert_response, "data", None),
            )
        else:
            logger.info("No apartment rows inserted because all apartment numbers already exist")
    except Exception as apartment_error:
        logger.exception("Apartment insert failed for building_id=%s", new_building.get("id"))
        rollback_ok = False
        rollback_error = None
        try:
            supabase.table("buildings").delete().eq("id", new_building.get("id")).execute()
            rollback_ok = True
        except Exception as delete_error:
            rollback_error = str(delete_error)
            logger.exception("Rollback delete failed for building_id=%s", new_building.get("id"))

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Building created but apartment insert failed",
                "apartment_error": str(apartment_error),
                "rolled_back": rollback_ok,
                "rollback_error": rollback_error,
            },
        )

    return BuildingResponse(**new_building)

@router.get("/buildings", response_model=list[BuildingResponse])
async def get_buildings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can list buildings")

    result = supabase.table("buildings").select("*").eq("owner_id", current_user["id"]).execute()
    return [BuildingResponse(**b) for b in (result.data or [])]

@router.patch("/buildings/{building_id}", response_model=BuildingResponse)
async def update_building(building_id: int, building: Building, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can edit buildings")

    existing = supabase.table("buildings").select("*").eq("id", building_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    if existing.data[0]["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = building.dict(exclude_unset=True)
    supabase.table("buildings").update(update_data).eq("id", building_id).execute()
    updated = supabase.table("buildings").select("*").eq("id", building_id).execute()
    return BuildingResponse(**updated.data[0])


@router.post("/buildings/{building_id}/seed-apartments")
async def seed_building_apartments(building_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "owner":
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
        return {"created": len(filtered_apartment_rows), "generated": len(apartment_rows), "ok": True}
    except Exception as seed_error:
        logger.exception("Seed endpoint failed for building_id=%s", building_id)
        raise HTTPException(status_code=500, detail=str(seed_error))

