from fastapi import APIRouter, Depends, HTTPException
from models import UserResponse
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()


def _public_user_row(row: dict) -> dict:
    return {k: v for k, v in row.items() if k != "password"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**_public_user_row(current_user))

@router.put("/me", response_model=UserResponse)
async def update_me(updated_data: dict, current_user: dict = Depends(get_current_user)):
    # Update user data
    supabase.table("users").update(updated_data).eq("id", current_user["id"]).execute()
    updated_user = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
    return UserResponse(**_public_user_row(updated_user.data[0]))