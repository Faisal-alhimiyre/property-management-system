from fastapi import APIRouter, Depends, HTTPException
from models import UserResponse
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)

@router.put("/me", response_model=UserResponse)
async def update_me(updated_data: dict, current_user: dict = Depends(get_current_user)):
    # Update user data
    supabase.table("users").update(updated_data).eq("id", current_user["id"]).execute()
    updated_user = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
    return UserResponse(**updated_user.data[0])