from fastapi import APIRouter, Depends, HTTPException
from models import Payment
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()


@router.post("/payments")
async def create_payment(payment: Payment, current_user: dict = Depends(get_current_user)):
    # Assume tenant creates payment
    if current_user["role"] != "tenant":
        raise HTTPException(status_code=403, detail="Only tenants can create payments")

    # Check if tenant is linked to the apartment
    tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).eq("id", payment.tenant_id).execute()
    if not tenant.data:
        raise HTTPException(status_code=403, detail="Not authorized")

    payment_data = payment.dict()
    response = supabase.table("payments").insert(payment_data).execute()
    return response.data[0]


@router.get("/payments")
async def get_payments(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "tenant":
        tenant = supabase.table("tenants").select("*").eq("user_id", current_user["id"]).execute()
        if tenant.data:
            payments = supabase.table("payments").select("*").eq("tenant_id", tenant.data[0]["id"]).execute()
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
