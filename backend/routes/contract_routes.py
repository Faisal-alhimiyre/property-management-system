from fastapi import APIRouter, Depends, HTTPException
from models import Contract
from config import supabase
from routes.auth_routes import get_current_user

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


@router.get("/contracts")
async def get_contracts(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "owner":
        # Get contracts for owner's apartments
        apartments = supabase.table("apartments").select("id").eq("owner_id", current_user["id"]).execute()
        apt_rows = apartments.data or []
        apt_ids = [apt["id"] for apt in apt_rows]
        if apt_ids:
            contracts = supabase.table("contracts").select("*").in_("apartment_id", apt_ids).execute()
        else:
            contracts = {"data": []}
    else:
        # For tenants, get their contracts
        tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).execute()
        if tenant.data:
            contracts = supabase.table("contracts").select("*").eq("tenant_id", tenant.data[0]["id"]).execute()
        else:
            contracts = {"data": []}
    return contracts.data or []
