from fastapi import APIRouter, Depends, HTTPException
from models import Contract
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()

@router.post("/contracts")
async def create_contract(contract: Contract, current_user: dict = Depends(get_current_user)):
    # Only owners can create contracts for their apartments
    apartment = supabase.table("apartments").select("*").eq("id", contract.apartment_id).execute()
    if not apartment.data or apartment.data[0]["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    contract_data = contract.dict()
    response = supabase.table("contracts").insert(contract_data).execute()
    return response.data[0]

@router.get("/contracts")
async def get_contracts(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "owner":
        # Get contracts for owner's apartments
        apartments = supabase.table("apartments").select("id").eq("owner_id", current_user["id"]).execute()
        apt_ids = [apt["id"] for apt in apartments.data]
        contracts = supabase.table("contracts").select("*").in_("apartment_id", apt_ids).execute()
    else:
        # For tenants, get their contracts
        tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).execute()
        if tenant.data:
            contracts = supabase.table("contracts").select("*").eq("tenant_id", tenant.data[0]["id"]).execute()
        else:
            contracts = {"data": []}
    return contracts.data