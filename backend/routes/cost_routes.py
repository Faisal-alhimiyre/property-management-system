import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from config import supabase
from models import CostCreate, CostResponse
from routes.auth_routes import get_current_user
from routes import document_routes as doc_routes
from deposit_service import (
    insert_deposit_transaction,
    remaining_deposit_for_contract,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _viewer_id(current_user: dict) -> int:
    try:
        return int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid session") from None


def _assert_owner_apartment_for_costs(current_user: dict, apartment_id: int) -> dict:
    apt = doc_routes._apartment_row(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    uid = _viewer_id(current_user)
    try:
        oid = apt.get("owner_id")
        if oid is None or int(oid) != uid:
            raise HTTPException(status_code=403, detail="Only the apartment owner can manage costs")
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Only the apartment owner can manage costs") from None
    return apt


def _row_to_response(row: dict) -> CostResponse:
    ed = row.get("expense_date")
    if isinstance(ed, str):
        try:
            ed = date.fromisoformat(ed[:10])
        except ValueError:
            ed = None
    return CostResponse(
        id=int(row["id"]),
        apartment_id=int(row["apartment_id"]),
        contract_id=row.get("contract_id"),
        cost_type=str(row.get("cost_type") or ""),
        amount=float(row.get("amount") or 0),
        status=str(row.get("status") or "approved"),
        expense_date=ed if isinstance(ed, date) else date.today(),
        notes=row.get("notes"),
        created_at=row.get("created_at"),
        funding_source=str(row.get("funding_source") or "owner"),
        deposit_covered_amount=float(row.get("deposit_covered_amount") or 0),
    )


def _contract_belongs_to_apartment(contract_id: int, apartment_id: int) -> bool:
    try:
        res = (
            supabase.table("contracts")
            .select("id")
            .eq("id", contract_id)
            .eq("apartment_id", apartment_id)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.exception("costs: contract lookup failed")
        raise HTTPException(status_code=503, detail="Database error") from None
    return bool(getattr(res, "data", None))


@router.get("/costs", response_model=list[CostResponse])
async def list_costs(
    apartment_id: int = Query(..., description="Apartment id (owner-only)"),
    contract_id: int | None = Query(None, description="Optional filter by contract"),
    current_user: dict = Depends(get_current_user),
):
    apt = _assert_owner_apartment_for_costs(current_user, apartment_id)
    try:
        q = supabase.table("costs").select("*").eq("apartment_id", apartment_id)
        if contract_id is not None:
            q = q.eq("contract_id", contract_id)
        else:
            ccid = apt.get("current_contract_id")
            if ccid is not None:
                # Occupied: current tenancy costs + vacant-recorded costs (null contract).
                # PostgREST or_ filter: contract_id.eq.X,contract_id.is.null
                q = q.or_(f"contract_id.eq.{int(ccid)},contract_id.is.null")
            # Vacant: all apartment costs (including null contract_id)
        res = q.order("id", desc=True).execute()
    except Exception as exc:
        logger.exception("costs list failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(res, "data", None) or []
    return [_row_to_response(r) for r in rows]


@router.post("/costs", response_model=CostResponse)
async def create_cost(body: CostCreate, current_user: dict = Depends(get_current_user)):
    apt = _assert_owner_apartment_for_costs(current_user, body.apartment_id)
    amount = float(body.amount)
    if amount < 0:
        raise HTTPException(status_code=400, detail="amount must be >= 0")

    funding = str(body.funding_source or "owner").strip().lower()
    if funding not in ("owner", "security_deposit"):
        raise HTTPException(status_code=400, detail="funding_source must be owner or security_deposit")

    deposit_cover = body.deposit_covered_amount
    if deposit_cover is None:
        deposit_cover = amount if funding == "security_deposit" else 0.0
    try:
        deposit_cover = float(deposit_cover)
    except (TypeError, ValueError):
        deposit_cover = 0.0
    if deposit_cover < 0 or deposit_cover > amount + 0.009:
        raise HTTPException(status_code=400, detail="deposit_covered_amount out of range")

    contract_id = body.contract_id
    if contract_id is not None:
        if not _contract_belongs_to_apartment(int(contract_id), int(body.apartment_id)):
            raise HTTPException(status_code=400, detail="Contract does not belong to this apartment")

    # Vacant / no deposit: force owner funding.
    if funding == "security_deposit":
        if contract_id is None:
            raise HTTPException(
                status_code=400,
                detail="Security deposit funding requires a contract_id",
            )
        bal = remaining_deposit_for_contract(int(contract_id))
        if deposit_cover > bal + 0.009:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient security deposit balance ({bal})",
            )
    else:
        deposit_cover = 0.0
        funding = "owner"

    status = str(body.status or "approved").strip().lower()
    if status not in ("approved", "pending", "cancelled"):
        status = "approved"

    # Insert as owner-funded first; only mark deposit-funded after ledger deduction succeeds.
    payload = {
        "apartment_id": int(body.apartment_id),
        "contract_id": int(contract_id) if contract_id is not None else None,
        "cost_type": (body.cost_type or "").strip(),
        "amount": amount,
        "status": status,
        "expense_date": body.expense_date.isoformat()
        if isinstance(body.expense_date, date)
        else str(body.expense_date),
        "notes": (body.notes or "").strip() or None,
        "funding_source": "owner",
        "deposit_covered_amount": 0,
    }
    if not payload["cost_type"]:
        raise HTTPException(status_code=400, detail="cost_type is required")

    try:
        ins = supabase.table("costs").insert(payload).execute()
    except Exception as exc:
        # Compat: columns may be missing before migration — retry without new fields.
        msg = str(exc)
        if "funding_source" in msg or "deposit_covered_amount" in msg:
            payload.pop("funding_source", None)
            payload.pop("deposit_covered_amount", None)
            try:
                ins = supabase.table("costs").insert(payload).execute()
            except Exception as exc2:
                logger.exception("costs insert failed")
                raise HTTPException(status_code=503, detail=str(exc2)) from exc2
        else:
            logger.exception("costs insert failed")
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    data = getattr(ins, "data", None) or []
    if not data:
        raise HTTPException(status_code=500, detail="Insert returned no row")
    row = data[0]
    cost_id = int(row["id"])

    if funding == "security_deposit" and deposit_cover > 0:
        try:
            insert_deposit_transaction(
                contract_id=int(contract_id),
                apartment_id=int(body.apartment_id),
                tx_type="deduction",
                amount=deposit_cover,
                cost_id=cost_id,
                notes=f"Cost #{cost_id} covered by security deposit",
            )
            upd = (
                supabase.table("costs")
                .update(
                    {
                        "funding_source": "security_deposit",
                        "deposit_covered_amount": deposit_cover,
                    }
                )
                .eq("id", cost_id)
                .execute()
            )
            updated = getattr(upd, "data", None) or []
            if updated:
                row = updated[0]
            else:
                row = {**row, "funding_source": "security_deposit", "deposit_covered_amount": deposit_cover}
        except Exception as exc:
            # Atomic failure: remove the cost so it is not left as deposit-funded.
            try:
                supabase.table("costs").delete().eq("id", cost_id).execute()
            except Exception:
                logger.exception("costs rollback delete failed cost_id=%s", cost_id)
            logger.exception("deposit deduction failed for cost_id=%s", cost_id)
            raise HTTPException(
                status_code=503,
                detail=f"Security deposit deduction failed; cost was not saved. {exc}",
            ) from exc

    return _row_to_response(row)


@router.delete("/costs/{cost_id}")
async def delete_cost(cost_id: int, current_user: dict = Depends(get_current_user)):
    try:
        res = supabase.table("costs").select("*").eq("id", cost_id).limit(1).execute()
    except Exception as exc:
        logger.exception("costs delete lookup failed id=%s", cost_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Cost not found")
    row = rows[0]
    _assert_owner_apartment_for_costs(current_user, int(row["apartment_id"]))
    try:
        supabase.table("costs").delete().eq("id", cost_id).execute()
    except Exception as exc:
        logger.exception("costs delete failed id=%s", cost_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "id": cost_id}
