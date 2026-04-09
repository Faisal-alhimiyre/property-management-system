import logging
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from models import GenerateInstallmentsBody, InstallmentUpdate, Payment
from config import supabase
from routes.auth_routes import get_current_user
from installment_service import generate_installment_rows

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def _authorize_contract_access(contract_id: int, user: dict) -> tuple[dict, dict]:
    cr = supabase.table("contracts").select("*").eq("id", contract_id).execute()
    if not cr.data:
        raise HTTPException(status_code=404, detail="Contract not found")
    contract = cr.data[0]
    apt_id = contract.get("apartment_id")
    if not apt_id:
        raise HTTPException(status_code=400, detail="Contract missing apartment")
    ar = supabase.table("apartments").select("*").eq("id", apt_id).execute()
    if not ar.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apartment = ar.data[0]

    uid = user.get("id")
    try:
        uid = int(uid)
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Allow access if user is either the apartment owner OR the linked tenant.
    is_owner = int(apartment.get("owner_id") or -1) == uid

    is_tenant = False
    if apartment.get("tenant_user_id") is not None:
        try:
            is_tenant = int(apartment["tenant_user_id"]) == uid
        except (TypeError, ValueError):
            is_tenant = False

    if not is_tenant:
        tid = contract.get("tenant_id")
        if tid is not None:
            tr = supabase.table("tenants").select("user_id").eq("id", tid).execute()
            if tr.data and tr.data[0].get("user_id") is not None:
                try:
                    is_tenant = int(tr.data[0]["user_id"]) == uid
                except (TypeError, ValueError):
                    is_tenant = False

    # Fallback for recently linked tenants where user_id linkage is not yet backfilled
    # but apartment tenant_national_id is already set.
    if not is_tenant:
        user_national_id = user.get("national_id")
        apartment_national_id = apartment.get("tenant_national_id")
        if user_national_id is not None and apartment_national_id is not None:
            is_tenant = str(user_national_id).strip() == str(apartment_national_id).strip()

    if not (is_owner or is_tenant):
        raise HTTPException(status_code=403, detail="Not authorized")

    return contract, apartment


@router.post("/payments")
async def create_payment(payment: Payment, current_user: dict = Depends(get_current_user)):
    # Assume tenant creates payment
    if current_user["role"] != "tenant":
        raise HTTPException(status_code=403, detail="Only tenants can create payments")

    # Check if tenant is linked to the apartment
    tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).eq("id", payment.tenant_id).execute()
    if not tenant.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    payment_data = payment.model_dump(exclude_none=True)
    response = supabase.table("payments").insert(payment_data).execute()
    return response.data[0]


@router.get("/payments")
async def get_payments(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "tenant":
        tenants = (
            supabase.table("tenants")
            .select("id,apartment_id")
            .eq("user_id", current_user["id"])
            .execute()
        )
        tenant_rows = tenants.data or []
        tenant_ids = [row["id"] for row in tenant_rows if row.get("id") is not None]
        apartment_by_tenant_id = {
            row["id"]: row.get("apartment_id")
            for row in tenant_rows
            if row.get("id") is not None
        }
        if tenant_ids:
            payments = supabase.table("payments").select("*").in_("tenant_id", tenant_ids).execute()
            payment_rows = payments.data or []
            # Add apartment_id for UI filtering on tenant pages.
            for p in payment_rows:
                p["apartment_id"] = apartment_by_tenant_id.get(p.get("tenant_id"))
            return payment_rows
        else:
            payments = {"data": []}
    elif current_user["role"] == "owner":
        # Get payments for owner's apartments
        apartments = supabase.table("apartments").select("id").eq("owner_id", current_user["id"]).execute()
        apt_rows = apartments.data or []
        apt_ids = [apt["id"] for apt in apt_rows]

        if apt_ids:
            tenants = supabase.table("tenants").select("id").in_("apartment_id", apt_ids).execute()
            tenant_rows = tenants.data or []
            tenant_ids = [t["id"] for t in tenant_rows]
            if tenant_ids:
                payments = supabase.table("payments").select("*").in_("tenant_id", tenant_ids).execute()
            else:
                payments = {"data": []}
        else:
            payments = {"data": []}
    else:
        payments = {"data": []}

    return payments.data or []


@router.get("/contracts/{contract_id}/installments")
async def list_contract_installments(
    contract_id: int,
    current_user: dict = Depends(get_current_user),
):
    _authorize_contract_access(contract_id, current_user)
    try:
        res = (
            supabase.table("payment_installments")
            .select("*")
            .eq("contract_id", contract_id)
            .order("installment_index")
            .execute()
        )
        return res.data or []
    except Exception:
        logger.exception(
            "payment_installments query failed (missing table, RLS, or bad column?); contract_id=%s",
            contract_id,
        )
        return []


@router.post("/contracts/{contract_id}/installments/generate")
async def generate_contract_installments(
    contract_id: int,
    body: GenerateInstallmentsBody,
    current_user: dict = Depends(get_current_user),
):
    contract, apartment = _authorize_contract_access(contract_id, current_user)
    if int(apartment.get("owner_id") or -1) != int(current_user.get("id") or -2):
        raise HTTPException(status_code=403, detail="Only owners can generate schedules")

    try:
        existing = (
            supabase.table("payment_installments")
            .select("id")
            .eq("contract_id", contract_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("payment_installments check before generate failed")
        raise HTTPException(
            status_code=503,
            detail=(
                "Cannot access payment_installments. Create the table (backend/sql/payment_installments.sql) "
                "and set SUPABASE_SERVICE_ROLE_KEY in backend/.env for server writes if RLS blocks inserts."
            ),
        ) from exc

    if existing.data:
        return {"message": "Schedule already exists", "inserted": 0}

    sd = _parse_date(contract.get("start_date"))
    ed = _parse_date(contract.get("end_date"))
    if not sd or not ed:
        raise HTTPException(
            status_code=400,
            detail="Contract must have start_date and end_date to generate installments",
        )

    rent = apartment.get("rent")
    try:
        monthly = Decimal(str(rent if rent is not None else 0))
    except Exception:
        monthly = Decimal("0")
    if monthly <= 0:
        raise HTTPException(status_code=400, detail="Apartment rent must be greater than zero")

    tid = contract.get("tenant_id")
    rows = generate_installment_rows(
        contract_id=contract_id,
        apartment_id=apartment.get("id"),
        tenant_id=tid,
        start_date=sd,
        end_date=ed,
        monthly_rent=monthly,
        payment_cycle=body.payment_cycle,
    )
    if not rows:
        raise HTTPException(status_code=400, detail="No installments generated for date range")

    try:
        ins = supabase.table("payment_installments").insert(rows).execute()
    except Exception as exc:
        logger.exception("payment_installments insert failed contract_id=%s rows=%s", contract_id, len(rows))
        hint = str(exc).strip() or type(exc).__name__
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not save installments: {hint}. "
                "If this mentions permission or RLS, add SUPABASE_SERVICE_ROLE_KEY to backend/.env "
                "(Project Settings → API → service_role)."
            ),
        ) from exc

    return {"inserted": len(ins.data or []), "items": ins.data or []}


@router.patch("/payment-installments/{installment_id}")
async def update_installment(
    installment_id: int,
    body: InstallmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    row = (
        supabase.table("payment_installments")
        .select("*")
        .eq("id", installment_id)
        .limit(1)
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="Installment not found")
    inst = row.data[0]
    _authorize_contract_access(int(inst["contract_id"]), current_user)

    updates = body.model_dump(exclude_unset=True)
    if updates.get("status") == "paid" and not updates.get("paid_at"):
        updates["paid_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    if not updates:
        return inst

    supabase.table("payment_installments").update(updates).eq("id", installment_id).execute()
    refreshed = (
        supabase.table("payment_installments")
        .select("*")
        .eq("id", installment_id)
        .execute()
    )
    return (refreshed.data or [inst])[0]
