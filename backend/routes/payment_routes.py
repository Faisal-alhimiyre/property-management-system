import logging
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from models import GenerateInstallmentsBody, InstallmentUpdate
from config import supabase
from routes.auth_routes import get_current_user, normalize_saudi_national_id
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
    # but apartment tenant_national_id is already set (compare normalized Saudi IDs).
    if not is_tenant:
        u_n = normalize_saudi_national_id(user.get("national_id"))
        a_n = normalize_saudi_national_id(apartment.get("tenant_national_id"))
        if u_n and a_n and u_n == a_n:
            is_tenant = True
        elif user.get("national_id") is not None and apartment.get("tenant_national_id") is not None:
            is_tenant = (
                str(user.get("national_id")).strip()
                == str(apartment.get("tenant_national_id")).strip()
            )

    if not (is_owner or is_tenant):
        raise HTTPException(status_code=403, detail="Not authorized")

    return contract, apartment


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
    force: bool = Query(False),
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
        if not force:
            return {"message": "Schedule already exists", "inserted": 0}
        try:
            current_rows = (
                supabase.table("payment_installments")
                .select("id,status")
                .eq("contract_id", contract_id)
                .execute()
            )
        except Exception as exc:
            logger.exception("payment_installments force-read failed contract_id=%s", contract_id)
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        rows_now = getattr(current_rows, "data", None) or []
        has_paid = any(str(r.get("status") or "").lower() in ("paid", "partial_paid") for r in rows_now)
        if has_paid:
            raise HTTPException(
                status_code=409,
                detail="Cannot regenerate installments: some installments are already paid/partial_paid.",
            )
        try:
            supabase.table("payment_installments").delete().eq("contract_id", contract_id).execute()
        except Exception as exc:
            logger.exception("payment_installments force-delete failed contract_id=%s", contract_id)
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    sd = _parse_date(contract.get("start_date"))
    ed = _parse_date(contract.get("end_date"))
    if not sd or not ed:
        raise HTTPException(
            status_code=400,
            detail="Contract must have start_date and end_date to generate installments",
        )

    # Canonical rent is yearly on the contract; monthly amounts are always yearly_rent / 12.
    yearly_rent: Decimal | None = None
    try:
        yc = contract.get("yearly_rent")
        if yc is not None and float(yc) > 0:
            yearly_rent = Decimal(str(yc))
    except Exception:
        yearly_rent = None
    if yearly_rent is None:
        try:
            if body.yearly_rent is not None and float(body.yearly_rent) > 0:
                yearly_rent = Decimal(str(body.yearly_rent))
        except Exception:
            yearly_rent = None
    if yearly_rent is None or yearly_rent <= 0:
        raise HTTPException(
            status_code=400,
            detail="Rent must be greater than zero (set contracts.yearly_rent on the lease).",
        )
    monthly = yearly_rent / Decimal("12")

    tid = contract.get("tenant_id")
    rows = generate_installment_rows(
        contract_id=contract_id,
        apartment_id=apartment.get("id"),
        tenant_id=tid,
        start_date=sd,
        end_date=ed,
        monthly_rent=monthly,
        yearly_rent=yearly_rent,
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
