try:
    import json
    from typing import Optional

    from fastapi import APIRouter, HTTPException, Depends, Request
    from fastapi.responses import JSONResponse
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from models import User, UserResponse
    from auth import get_password_hash, verify_password, create_access_token, verify_token
    from config import supabase
    from datetime import timedelta, datetime
    print("All auth imports successful")
except Exception as e:
    print(f"Error importing auth modules: {e}")
    raise

router = APIRouter()
# auto_error=False so cookie-only clients work; token optional in Authorization header.
security = HTTPBearer(auto_error=False)

COOKIE_NAME = "walajna_session"
ACCESS_MAX_AGE_SECONDS = 30 * 60

print("Auth router created successfully")
print("User model imported:", User)


def normalize_saudi_national_id(value) -> str | None:
    """Digits-only 10-digit Saudi national / iqama id for consistent DB matching."""
    if value is None:
        return None
    digits = "".join(c for c in str(value) if c.isdigit())
    if not digits:
        return None
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        return None
    return digits


def national_id_lookup_variants(raw: str | None) -> list[str]:
    """Values that may appear in apartments.tenant_national_id for the same person."""
    out: list[str] = []
    n = normalize_saudi_national_id(raw)
    if n:
        out.append(n)
    if raw is not None:
        stripped = str(raw).strip()
        if stripped and stripped not in out:
            out.append(stripped)
    return out


def _claim_pending_tenant_assignments(user_id: int, national_id: str | None):
    canon = normalize_saudi_national_id(national_id)
    variants = national_id_lookup_variants(national_id)
    if not variants:
        return

    apartments_result = (
        supabase.table("apartments")
        .select("id,current_contract_id,tenant_user_id,tenant_national_id")
        .in_("tenant_national_id", variants)
        .execute()
    )
    apartments = getattr(apartments_result, "data", None) or []
    print("Apartments matching tenant_national_id variants:", len(apartments))

    # Link every pending unit whose stored id normalizes to the same 10 digits (same person, multiple units).
    pending = []
    for a in apartments:
        if a.get("tenant_user_id") not in (None, "", 0, "0"):
            continue
        apt_nid = normalize_saudi_national_id(a.get("tenant_national_id"))
        if canon and apt_nid == canon:
            pending.append(a)

    for apartment in pending:
        apartment_id = apartment.get("id")
        current_contract_id = apartment.get("current_contract_id")

        if apartment.get("tenant_user_id") != user_id:
            supabase.table("apartments").update({"tenant_user_id": user_id}).eq("id", apartment_id).execute()

        tenant_row_id = None
        if current_contract_id is not None:
            contract_result = (
                supabase.table("contracts")
                .select("tenant_id")
                .eq("id", current_contract_id)
                .limit(1)
                .execute()
            )
            if contract_result.data:
                tenant_row_id = contract_result.data[0].get("tenant_id")

        if tenant_row_id is not None:
            supabase.table("tenants").update({"user_id": user_id}).eq("id", tenant_row_id).execute()
            continue

        tenant_lookup = (
            supabase.table("tenants")
            .select("id,user_id")
            .eq("apartment_id", apartment_id)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if tenant_lookup.data:
            supabase.table("tenants").update({"user_id": user_id}).eq("id", tenant_lookup.data[0]["id"]).execute()

    _link_tenant_profile_rows_by_national_id(user_id, national_id)


def _link_tenant_profile_rows_by_national_id(user_id: int, national_id: str | None):
    """
    Fill tenants.user_id using tenants.national_id when the apartment/contract path
    missed a row (e.g. apartment.tenant_national_id out of sync or multiple tenant rows).
    """
    canon = normalize_saudi_national_id(national_id)
    variants = national_id_lookup_variants(national_id)
    if not canon or not variants:
        return

    try:
        res = (
            supabase.table("tenants")
            .select("id,apartment_id,national_id,user_id")
            .in_("national_id", variants)
            .execute()
        )
    except Exception as exc:
        print("tenants.national_id link skipped:", exc)
        return

    for row in getattr(res, "data", None) or []:
        if row.get("user_id") not in (None, "", 0, "0"):
            continue
        if normalize_saudi_national_id(row.get("national_id")) != canon:
            continue
        tid = row.get("id")
        aid = row.get("apartment_id")
        if tid is None:
            continue
        supabase.table("tenants").update({"user_id": user_id}).eq("id", tid).execute()
        if aid is not None:
            apt_row = (
                supabase.table("apartments")
                .select("tenant_user_id")
                .eq("id", aid)
                .limit(1)
                .execute()
            )
            cur = None
            if apt_row.data:
                cur = apt_row.data[0].get("tenant_user_id")
            if cur in (None, "", 0, "0"):
                supabase.table("apartments").update({"tenant_user_id": user_id}).eq("id", aid).execute()

@router.post("/test")
async def test_endpoint():
    print("Test endpoint called")
    return {"message": "Test successful"}

@router.post("/register")
async def register(user: User):
    print("=== REGISTER ENDPOINT CALLED ===")
    print("Register endpoint called with user:", user.dict())
    
    try:
        # Check if user already exists
        existing_user = supabase.table("users").select("*").eq("email", user.email).execute()
        if existing_user.data:
            raise HTTPException(status_code=400, detail="User with this email already exists")
        
        # Hash the password
        hashed_password = get_password_hash(user.password)
        
        nid_stored = normalize_saudi_national_id(user.national_id) or str(user.national_id).strip()

        raw_role = (user.role or "").strip().lower()
        if raw_role not in ("owner", "tenant"):
            raw_role = "pending"

        # Create user data for database — real owner/tenant is set on auth/role.html via PUT /users/me.
        user_data = {
            "email": user.email,
            "password": hashed_password,
            "role": raw_role,
            "name": user.name,
            "national_id": nid_stored,
            "created_at": datetime.utcnow().isoformat(),
        }
        if raw_role == "pending":
            user_data["roles"] = []
        else:
            user_data["roles"] = [raw_role]
            user_data["active_role"] = raw_role
        # Only include phone if it's provided
        if user.phone:
            user_data["phone"] = user.phone
        
        # Insert user into database
        result = supabase.table("users").insert(user_data).execute()
        
        if result.data:
            print("User registered successfully:", result.data[0])
            created_user = result.data[0]
            # Owners often register first then pick "tenant" in the UI; claim by national id regardless of role.
            _claim_pending_tenant_assignments(
                created_user["id"], created_user.get("national_id")
            )
            return {"message": "User registered successfully", "user_id": created_user["id"]}
        else:
            raise HTTPException(status_code=500, detail="Failed to create user")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error during registration: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


def _login_from_json_dict(body: dict) -> dict:
    raw_nid = body.get("national_id", body.get("nationalId"))
    national_id = str(raw_nid).strip() if raw_nid is not None else ""
    if national_id.lower() in ("none", "null", "undefined"):
        national_id = ""

    raw_email = body.get("email")
    email = str(raw_email).strip() if raw_email is not None else ""
    if email.lower() in ("none", "null", "undefined"):
        email = ""

    if body.get("password") is None:
        raise HTTPException(status_code=400, detail="كلمة المرور مطلوبة")
    password = str(body.get("password"))
    if not password.strip():
        raise HTTPException(status_code=400, detail="كلمة المرور مطلوبة")

    if not national_id and not email:
        raise HTTPException(
            status_code=400,
            detail="يجب إدخال رقم الهوية أو البريد الإلكتروني",
        )

    if national_id:
        result = supabase.table("users").select("*").eq("national_id", national_id).execute()
    else:
        result = supabase.table("users").select("*").eq("email", email).execute()

    if not result.data or not verify_password(password, result.data[0]["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_data = result.data[0]
    try:
        _claim_pending_tenant_assignments(
            int(user_data["id"]), user_data.get("national_id")
        )
    except Exception as claim_exc:
        print("claim_pending_tenant_assignments on login:", claim_exc)

    access_token = create_access_token(
        data={"sub": f"uid:{user_data['id']}"},
        expires_delta=timedelta(minutes=30),
    )

    lg = str(user_data.get("role") or "").lower()
    roles_out = user_data.get("roles")
    if not isinstance(roles_out, list) or len(roles_out) == 0:
        roles_out = [] if lg == "pending" else ([user_data["role"]] if lg else [])
    active_out = user_data.get("active_role")
    if active_out is None and lg and lg != "pending":
        active_out = user_data.get("role")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_data.get("id"),
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "role": user_data.get("role"),
            "roles": roles_out,
            "active_role": active_out,
            "phone": user_data.get("phone"),
            "national_id": user_data.get("national_id"),
        },
    }


async def login_handler(request: Request):
    """Registered on the FastAPI app in main.py (not on the router) so /login cannot be shadowed."""
    raw = await request.body()
    if not raw or not raw.strip():
        raise HTTPException(
            status_code=400,
            detail='Body required: {"national_id":"...","password":"..."}',
        )
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON body must be an object")
    payload = _login_from_json_dict(body)
    token = payload["access_token"]
    response = JSONResponse(
        content={
            "user": payload["user"],
            "token_type": payload["token_type"],
        }
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=ACCESS_MAX_AGE_SECONDS,
        path="/",
    )
    return response


async def logout_handler():
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return response

print("Auth router routes after definitions:", [route.path for route in router.routes])

def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    if not token:
        token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    subject = verify_token(token)
    if not subject:
        raise HTTPException(status_code=401, detail="Invalid token")

    if subject.startswith("uid:"):
        try:
            user_id = int(subject[4:])
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Invalid token")
        user = supabase.table("users").select("*").eq("id", user_id).execute()
        if not user.data:
            raise HTTPException(status_code=401, detail="User not found")
        return user.data[0]

    if "@" in subject:
        user = supabase.table("users").select("*").eq("email", subject).execute()
    else:
        user = supabase.table("users").select("*").eq("national_id", subject).execute()
    if not user.data:
        raise HTTPException(status_code=401, detail="User not found")
    return user.data[0]