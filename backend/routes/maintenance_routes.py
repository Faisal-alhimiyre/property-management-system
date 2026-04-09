from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from models import MaintenanceRequest
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()


@router.post("/maintenance")
async def create_maintenance_request(request: MaintenanceRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "tenant":
        raise HTTPException(status_code=403, detail="Only tenants can create maintenance requests")

    # Verify tenant is linked to the apartment
    tenant = (
        supabase.table("tenants")
        .select("*")
        .eq("user_id", current_user["id"])
        .eq("apartment_id", request.apartment_id)
        .execute()
    )
    if not tenant.data:
        raise HTTPException(status_code=403, detail="Not authorized for this apartment")

    request_data = request.dict()
    request_data["tenant_id"] = tenant.data[0]["id"]
    response = supabase.table("maintenance_requests").insert(request_data).execute()
    return response.data[0]


@router.get("/maintenance")
async def get_maintenance_requests(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "tenant":
        tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).execute()
        if tenant.data:
            requests = supabase.table("maintenance_requests").select("*").eq("tenant_id", tenant.data[0]["id"]).execute()
        else:
            requests = {"data": []}
    elif current_user["role"] == "owner":
        # Get requests for owner's apartments
        apartments = supabase.table("apartments").select("id").eq("owner_id", current_user["id"]).execute()
        apt_rows = apartments.data or []
        apt_ids = [apt["id"] for apt in apt_rows]
        if apt_ids:
            requests = supabase.table("maintenance_requests").select("*").in_("apartment_id", apt_ids).execute()
        else:
            requests = {"data": []}
    else:
        requests = {"data": []}
    return requests.data or []


@router.put("/maintenance/{request_id}")
async def update_maintenance_request(request_id: int, status: str, current_user: dict = Depends(get_current_user)):
    # Only owners can update status
    if current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can update maintenance requests")

    # Verify the request belongs to owner's apartment
    request = supabase.table("maintenance_requests").select("apartment_id").eq("id", request_id).execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="Request not found")

    apartment = supabase.table("apartments").select("*").eq("id", request.data[0]["apartment_id"]).execute()
    if not apartment.data or apartment.data[0]["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    response = (
        supabase.table("maintenance_requests")
        .update({"status": status, "updated_at": datetime.utcnow().isoformat()})
        .eq("id", request_id)
        .execute()
    )
    return response.data[0]
