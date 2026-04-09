import logging
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from models import Apartment, ApartmentResponse
from config import supabase
from routes.auth_routes import get_current_user

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

    normalized = {
        "tenant_user_id": payload.get("tenant_user_id", payload.get("tenantUserId")),
        "tenant_national_id": tenant_national_id,
        "tenant_info": tenant_info,
        "start_date": payload.get("start_date", payload.get("startDate")),
        "end_date": payload.get("end_date", payload.get("endDate")),
        "rent": payload.get("rent"),
        "notes": payload.get("notes"),
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

    user_lookup = (
        supabase.table("users")
        .select("id")
        .eq("national_id", tenant_national_id)
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
    if current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create apartments")
    
    apartment_data = apartment.dict()
    apartment_data["owner_id"] = current_user["id"]
    response = supabase.table("apartments").insert(apartment_data).execute()
    return ApartmentResponse(**response.data[0])

@router.get("/apartments", response_model=list[ApartmentResponse])
async def get_apartments(
    view: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    rows: list[dict] = []

    as_tenant_view = (view or "").strip().lower() == "as_tenant"

    if current_user["role"] == "owner" and not as_tenant_view:
        owner_rows_result = (
            supabase.table("apartments")
            .select("*")
            .eq("owner_id", current_user["id"])
            .execute()
        )
        rows = getattr(owner_rows_result, "data", None) or []
        rows = _reconcile_owner_apartment_statuses(rows)
    else:
        by_user_result = (
            supabase.table("apartments")
            .select("*")
            .eq("tenant_user_id", current_user["id"])
            .execute()
        )
        rows = getattr(by_user_result, "data", None) or []

        national_id = current_user.get("national_id")
        if national_id:
            by_national_result = (
                supabase.table("apartments")
                .select("*")
                .eq("tenant_national_id", national_id)
                .execute()
            )
            for apartment in getattr(by_national_result, "data", None) or []:
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

    return ApartmentResponse(**row)


@router.patch("/apartments/{apartment_id}/assign-tenant")
async def assign_tenant_to_apartment(
    apartment_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    logger.info("assign-tenant route entered: apartment_id=%s current_user_id=%s", apartment_id, current_user.get("id"))
    try:
        if current_user["role"] != "owner":
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

        # Build and insert contract row
        contract_data = {
            "apartment_id": apartment_id,
            "tenant_id": tenant_row.get("id"),
            "start_date": lease_start,
            "end_date": lease_end,
            "terms": normalized_payload.get("notes") or "",
        }
        contract_data = {k: v for k, v in contract_data.items() if v is not None}
        logger.info("assign-tenant contract data payload: %s", contract_data)

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
        logger.info("assign-tenant final response apartment_id=%s response=%s", apartment_id, updated_apt)
        return updated_apt
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("assign-tenant unexpected exception apartment_id=%s", apartment_id)
        raise HTTPException(status_code=500, detail=f"assign-tenant internal error: {str(exc)}")