import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]

    def _read():
        return supabase.table("notifications").select("*").eq("user_id", uid).execute()

    try:
        notifications = await asyncio.to_thread(_read)
        return notifications.data
    except Exception:
        logger.exception("get_notifications failed for user_id=%s", uid)
        return []

@router.put("/notifications/{notification_id}/read")
async def mark_as_read(notification_id: int, current_user: dict = Depends(get_current_user)):
    # Verify ownership
    notification = supabase.table("notifications").select("*").eq("id", notification_id).eq("user_id", current_user["id"]).execute()
    if not notification.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    response = supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).execute()
    return response.data[0]