import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from config import supabase
from models import DepositBalanceResponse, DepositTransactionCreate, DepositTransactionResponse
from routes.auth_routes import get_current_user
from routes import document_routes as doc_routes
from deposit_service import (
    DEPOSIT_TYPES,
    deposit_summary_for_contract,
    insert_deposit_transaction,
    ledger_totals_for_apartments,
)
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


def _viewer_id(current_user: dict) -> int:
    try:
        return int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid session") from None


def _assert_owner_apartment(current_user: dict, apartment_id: int) -> dict:
    apt = doc_routes._apartment_row(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    uid = _viewer_id(current_user)
    try:
        if apt.get("owner_id") is None or int(apt["owner_id"]) != uid:
            raise HTTPException(status_code=403, detail="Not authorized")
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized") from None
    return apt


def _tx_response(row: dict) -> DepositTransactionResponse:
    return DepositTransactionResponse(
        id=int(row["id"]),
        contract_id=int(row["contract_id"]),
        apartment_id=int(row["apartment_id"]),
        type=str(row.get("type") or ""),
        amount=float(row.get("amount") or 0),
        cost_id=row.get("cost_id"),
        notes=row.get("notes"),
        created_at=row.get("created_at"),
    )


@router.get("/deposits/balance", response_model=DepositBalanceResponse)
async def get_deposit_balance(
    contract_id: int = Query(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        cres = (
            supabase.table("contracts")
            .select("id, apartment_id, insurance_paid")
            .eq("id", int(contract_id))
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(cres, "data", None) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Contract not found")
    contract = rows[0]
    apt_id = int(contract["apartment_id"])
    # Read balance: owner or linked tenant (display only; mutations stay owner-gated).
    doc_routes._assert_apartment_access(current_user, apt_id)
    summary = deposit_summary_for_contract(
        int(contract_id), insurance_paid=contract.get("insurance_paid")
    )
    return DepositBalanceResponse(
        contract_id=int(contract_id),
        apartment_id=apt_id,
        original=summary["original"],
        received=summary["received"],
        used=summary["used"],
        replenished=summary["replenished"],
        refunded=summary["refunded"],
        remaining=summary["remaining"],
        is_settled=summary["is_settled"],
    )


@router.get("/deposits/transactions", response_model=list[DepositTransactionResponse])
async def list_deposit_transactions(
    contract_id: int | None = Query(None),
    apartment_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if contract_id is None and apartment_id is None:
        raise HTTPException(status_code=400, detail="contract_id or apartment_id required")
    if apartment_id is not None:
        _assert_owner_apartment(current_user, int(apartment_id))
    if contract_id is not None:
        try:
            cres = (
                supabase.table("contracts")
                .select("apartment_id")
                .eq("id", int(contract_id))
                .limit(1)
                .execute()
            )
            crows = getattr(cres, "data", None) or []
            if not crows:
                raise HTTPException(status_code=404, detail="Contract not found")
            _assert_owner_apartment(current_user, int(crows[0]["apartment_id"]))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        q = supabase.table("security_deposit_transactions").select("*")
        if contract_id is not None:
            q = q.eq("contract_id", int(contract_id))
        if apartment_id is not None:
            q = q.eq("apartment_id", int(apartment_id))
        res = q.order("id", desc=True).execute()
    except Exception as exc:
        logger.exception("list deposit transactions failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return [_tx_response(r) for r in (getattr(res, "data", None) or [])]


@router.post("/deposits/transactions", response_model=DepositTransactionResponse)
async def create_deposit_transaction(
    body: DepositTransactionCreate,
    current_user: dict = Depends(get_current_user),
):
    _assert_owner_apartment(current_user, int(body.apartment_id))
    t = str(body.type or "").strip().lower()
    if t not in DEPOSIT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid deposit transaction type")
    if t == "deduction":
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/costs with funding_source=security_deposit for deductions",
        )
    try:
        row = insert_deposit_transaction(
            contract_id=int(body.contract_id),
            apartment_id=int(body.apartment_id),
            tx_type=t,
            amount=float(body.amount),
            cost_id=body.cost_id,
            notes=body.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("create deposit transaction failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _tx_response(row)


@router.get("/buildings/{building_id}/deposits-summary")
async def building_deposits_summary(
    building_id: int,
    as_of: str | None = Query(None, description="Report date YYYY-MM-DD; balance as of end of that day"),
    current_user: dict = Depends(get_current_user),
):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners")
    uid = _viewer_id(current_user)
    try:
        bres = (
            supabase.table("buildings")
            .select("id, owner_id")
            .eq("id", int(building_id))
            .limit(1)
            .execute()
        )
        brows = getattr(bres, "data", None) or []
        if not brows or int(brows[0].get("owner_id") or -1) != uid:
            raise HTTPException(status_code=403, detail="Not authorized")
        ares = (
            supabase.table("apartments")
            .select("id")
            .eq("building_id", int(building_id))
            .execute()
        )
        apt_ids = [int(a["id"]) for a in (getattr(ares, "data", None) or []) if a.get("id") is not None]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    totals = ledger_totals_for_apartments(apt_ids, as_of=as_of)
    totals["apartment_ids"] = apt_ids
    return totals


@router.get("/owner/deposits-summary")
async def owner_deposits_summary(
    as_of: str | None = Query(None, description="Report date YYYY-MM-DD; balance as of end of that day"),
    current_user: dict = Depends(get_current_user),
):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners")
    uid = _viewer_id(current_user)
    try:
        ares = supabase.table("apartments").select("id").eq("owner_id", uid).execute()
        apt_ids = [int(a["id"]) for a in (getattr(ares, "data", None) or []) if a.get("id") is not None]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return ledger_totals_for_apartments(apt_ids, as_of=as_of)