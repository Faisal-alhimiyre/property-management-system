import asyncio

from fastapi import APIRouter, Depends, HTTPException
from models import Contract
from config import supabase
from routes.auth_routes import get_current_user
from user_roles import has_role

router = APIRouter()


@router.post("/contracts")
async def create_contract(contract: Contract, current_user: dict = Depends(get_current_user)):
    # Only owners can create contracts for their apartments
    if contract.apartment_id is None or contract.tenant_id is None:
        raise HTTPException(status_code=400, detail="apartment_id and tenant_id are required")
    apartment = supabase.table("apartments").select("*").eq("id", contract.apartment_id).execute()
    apt_row = apartment.data[0] if apartment.data else None
    apt_owner = apt_row.get("owner_id") if apt_row else None
    if not apt_row or apt_owner is None or int(apt_owner) != int(current_user["id"]):
        raise HTTPException(status_code=403, detail="Not authorized")

    contract_data = contract.model_dump(exclude={"id", "created_at"}, exclude_none=True)
    response = supabase.table("contracts").insert(contract_data).execute()
    return response.data[0]


def _get_contracts_merged(current_user: dict) -> list:
    """
    Return contracts this user may see (sync; run in thread pool from async route).
    """
    uid = int(current_user["id"])
    by_id: dict[int, dict] = {}

    if has_role(current_user, "owner"):
        apt_rows = (
            supabase.table("apartments")
            .select("id")
            .eq("owner_id", uid)
            .execute()
        )
        apt_ids = [r["id"] for r in (apt_rows.data or [])]
        if apt_ids:
            res = (
                supabase.table("contracts")
                .select("*")
                .in_("apartment_id", apt_ids)
                .execute()
            )
            for row in res.data or []:
                cid = row.get("id")
                if cid is not None:
                    by_id[int(cid)] = row

    tenant_rows = (
        supabase.table("tenants")
        .select("id")
        .eq("user_id", uid)
        .execute()
    )
    tids = [r["id"] for r in (tenant_rows.data or [])]
    if tids:
        res = (
            supabase.table("contracts")
            .select("*")
            .in_("tenant_id", tids)
            .execute()
        )
        for row in res.data or []:
            cid = row.get("id")
            if cid is not None:
                by_id[int(cid)] = row

    merged = list(by_id.values())
    merged.sort(key=lambda r: int(r.get("id") or 0))
    return merged


@router.get("/contracts")
async def get_contracts(current_user: dict = Depends(get_current_user)):
    """
    Return contracts this user may see:
    - As landlord: contracts on apartments they own (role owner).
    - As tenant: contracts whose tenant_id matches any tenants row for this user_id.

    Registration often stores role=owner while the same person is also a tenant on
    someone else's unit — both sets must be merged or /api/contracts is empty for them.
    """
    return await asyncio.to_thread(_get_contracts_merged, current_user)
