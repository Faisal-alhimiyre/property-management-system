from fastapi import APIRouter, Depends, HTTPException
from models import Notification
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()

@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = supabase.table("notifications").select("*").eq("user_id", current_user["id"]).execute()
    return notifications.data

@router.put("/notifications/{notification_id}/read")
async def mark_as_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    # Verify ownership
    notification = supabase.table("notifications").select("*").eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    if not notification.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    response = supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    return response.data[0]