import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from models import ApartmentArLayoutResponse, ApartmentArLayoutUpsert
from config import supabase
from routes.auth_routes import get_current_user, national_id_lookup_variants, normalize_saudi_national_id

router = APIRouter()
logger = logging.getLogger(__name__)


def _viewer_id(current_user: dict) -> int:
    try:
        return int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid session") from None


def _apartment_row(apartment_id: int) -> dict | None:
    res = supabase.table("apartments").select("*").eq("id", apartment_id).limit(1).execute()
    rows = getattr(res, "data", None) or []
    return rows[0] if rows else None


def _user_can_access_apartment(current_user: dict, apt: dict) -> bool:
    if not apt:
        return False
    uid = _viewer_id(current_user)
    try:
        if apt.get("owner_id") is not None and int(apt["owner_id"]) == uid:
            return True
    except (TypeError, ValueError):
        pass
    try:
        if apt.get("tenant_user_id") is not None and int(apt["tenant_user_id"]) == uid:
            return True
    except (TypeError, ValueError):
        pass
    variants = national_id_lookup_variants(current_user.get("national_id"))
    apt_nid = apt.get("tenant_national_id")
    if variants and apt_nid is not None:
        if normalize_saudi_national_id(apt_nid) == normalize_saudi_national_id(current_user.get("national_id")):
            return True
        if str(apt_nid).strip() in variants:
            return True
    try:
        tres = (
            supabase.table("tenants")
            .select("id")
            .eq("user_id", uid)
            .eq("apartment_id", apt.get("id"))
            .limit(1)
            .execute()
        )
        if getattr(tres, "data", None):
            return True
    except Exception:
        logger.exception("ar: tenants access check failed apartment_id=%s", apt.get("id"))
    return False


def _assert_apartment_access(current_user: dict, apartment_id: int) -> dict:
    apt = _apartment_row(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    if not _user_can_access_apartment(current_user, apt):
        raise HTTPException(status_code=403, detail="Not authorized")
    return apt


def _row_to_response(row: dict) -> ApartmentArLayoutResponse:
    return ApartmentArLayoutResponse(
        id=int(row["id"]),
        apartment_id=int(row["apartment_id"]),
        building_id=row.get("building_id"),
        owner_id=int(row["owner_id"]),
        spec=row.get("spec") or {},
        focus_apartment_number=row.get("focus_apartment_number"),
        focus_floor_number=row.get("focus_floor_number"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


@router.get("/apartments/{apartment_id}/ar-layout", response_model=ApartmentArLayoutResponse)
async def get_apartment_ar_layout(apartment_id: int, current_user: dict = Depends(get_current_user)):
    _assert_apartment_access(current_user, apartment_id)
    res = (
        supabase.table("apartment_ar_layouts")
        .select("*")
        .eq("apartment_id", apartment_id)
        .limit(1)
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(status_code=404, detail="AR layout not found")
    return _row_to_response(rows[0])


@router.put("/apartments/{apartment_id}/ar-layout", response_model=ApartmentArLayoutResponse)
async def upsert_apartment_ar_layout(
    apartment_id: int,
    body: ApartmentArLayoutUpsert,
    current_user: dict = Depends(get_current_user),
):
    apt = _assert_apartment_access(current_user, apartment_id)
    if not isinstance(body.spec, dict) or not body.spec:
        raise HTTPException(status_code=400, detail="spec must be a non-empty object")

    owner_id = apt.get("owner_id")
    try:
        owner_id_int = int(owner_id) if owner_id is not None else None
    except (TypeError, ValueError):
        owner_id_int = None
    if owner_id_int is None:
        raise HTTPException(status_code=400, detail="Apartment owner_id missing")

    building_id = apt.get("building_id")
    try:
        building_id_int = int(building_id) if building_id is not None else None
    except (TypeError, ValueError):
        building_id_int = None

    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "apartment_id": apartment_id,
        "building_id": building_id_int,
        "owner_id": owner_id_int,
        "spec": body.spec,
        "focus_apartment_number": body.focus_apartment_number or apt.get("apartment_number"),
        "focus_floor_number": body.focus_floor_number
        if body.focus_floor_number is not None
        else apt.get("floor_number"),
        "updated_at": now,
    }

    existing = (
        supabase.table("apartment_ar_layouts")
        .select("id")
        .eq("apartment_id", apartment_id)
        .limit(1)
        .execute()
    )
    ex_rows = getattr(existing, "data", None) or []

    try:
        if ex_rows:
            upd = (
                supabase.table("apartment_ar_layouts")
                .update(payload)
                .eq("apartment_id", apartment_id)
                .execute()
            )
            rows = getattr(upd, "data", None) or []
        else:
            payload["created_at"] = now
            ins = supabase.table("apartment_ar_layouts").insert(payload).execute()
            rows = getattr(ins, "data", None) or []
    except Exception as exc:
        logger.exception("apartment_ar_layouts upsert failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not rows:
        raise HTTPException(status_code=500, detail="Failed to save AR layout")
    return _row_to_response(rows[0])
