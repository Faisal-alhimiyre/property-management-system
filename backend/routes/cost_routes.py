import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from config import supabase
from models import CostCreate, CostResponse
from routes.auth_routes import get_current_user
from routes import document_routes as doc_routes

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
        status=str(row.get("status") or "pending"),
        expense_date=ed if isinstance(ed, date) else date.today(),
        notes=row.get("notes"),
        created_at=row.get("created_at"),
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
            # Active costs table: only the current tenancy's contract (vacated costs live in apartment_history).
            ccid = apt.get("current_contract_id")
            if ccid is None:
                return []
            q = q.eq("contract_id", int(ccid))
        res = q.order("id", desc=True).execute()
    except Exception as exc:
        logger.exception("costs list failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(res, "data", None) or []
    return [_row_to_response(r) for r in rows]


@router.post("/costs", response_model=CostResponse)
async def create_cost(body: CostCreate, current_user: dict = Depends(get_current_user)):
    _assert_owner_apartment_for_costs(current_user, body.apartment_id)
    if body.contract_id is not None:
        if not _contract_belongs_to_apartment(int(body.contract_id), int(body.apartment_id)):
            raise HTTPException(status_code=400, detail="Contract does not belong to this apartment")
    payload = {
        "apartment_id": int(body.apartment_id),
        "contract_id": body.contract_id,
        "cost_type": (body.cost_type or "").strip(),
        "amount": float(body.amount),
        "status": body.status,
        "expense_date": body.expense_date.isoformat() if isinstance(body.expense_date, date) else str(body.expense_date),
        "notes": (body.notes or "").strip() or None,
    }
    if not payload["cost_type"]:
        raise HTTPException(status_code=400, detail="cost_type is required")
    try:
        ins = supabase.table("costs").insert(payload).execute()
    except Exception as exc:
        logger.exception("costs insert failed")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    data = getattr(ins, "data", None) or []
    if not data:
        raise HTTPException(status_code=500, detail="Insert returned no row")
    return _row_to_response(data[0])


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
    aid = int(row["apartment_id"])
    _assert_owner_apartment_for_costs(current_user, aid)
    try:
        supabase.table("costs").delete().eq("id", cost_id).execute()
    except Exception as exc:
        logger.exception("costs delete failed id=%s", cost_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "id": cost_id}
