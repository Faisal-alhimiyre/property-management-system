from fastapi import APIRouter, Depends, HTTPException
from models import UserResponse, UserSelfUpdate
from config import supabase
from routes.auth_routes import get_current_user

router = APIRouter()


def _public_user_row(row: dict) -> dict:
    return {k: v for k, v in row.items() if k != "password"}


def _normalize_user_response_dict(row: dict) -> dict:
    pub = _public_user_row(row)
    roles = pub.get("roles")
    lg = str(pub.get("role") or "").lower()
    if not roles and lg and lg != "pending":
        roles = [pub["role"]]
    pub["roles"] = list(roles) if roles else []
    if pub.get("active_role") is None and lg and lg != "pending":
        pub["active_role"] = pub["role"]
    return pub


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**_normalize_user_response_dict(current_user))


@router.put("/me", response_model=UserResponse)
async def update_me(
    body: UserSelfUpdate,
    current_user: dict = Depends(get_current_user),
):
    uid = int(current_user["id"])
    payload = body.model_dump(exclude_none=True)

    full = supabase.table("users").select("*").eq("id", uid).execute()
    if not full.data:
        raise HTTPException(status_code=404, detail="User not found")
    row = full.data[0]

    updates: dict = {}

    for key in ("name", "phone", "national_id"):
        if key in payload:
            updates[key] = payload[key]

    if "roles" in payload and payload["roles"] is not None:
        updates["roles"] = payload["roles"]
        if payload["roles"]:
            updates["role"] = payload["roles"][0]

    if payload.get("active_role") is not None:
        ar = str(payload["active_role"]).strip().lower()
        if ar not in ("owner", "tenant"):
            raise HTTPException(
                status_code=400,
                detail="active_role must be owner or tenant",
            )
        eff = [
            x
            for x in (list(row.get("roles") or []))
            if x is not None and str(x).strip().lower() not in ("", "pending")
        ]
        if not eff and row.get("role"):
            r0 = str(row["role"]).strip().lower()
            if r0 not in ("", "pending"):
                eff = [row["role"]]
        if ar not in eff:
            eff.append(ar)
        updates["roles"] = eff
        updates["active_role"] = ar
        updates["role"] = ar

    if not updates:
        return UserResponse(**_normalize_user_response_dict(row))

    supabase.table("users").update(updates).eq("id", uid).execute()
    refreshed = supabase.table("users").select("*").eq("id", uid).execute()
    if not refreshed.data:
        raise HTTPException(status_code=500, detail="Update failed")
    return UserResponse(**_normalize_user_response_dict(refreshed.data[0]))
