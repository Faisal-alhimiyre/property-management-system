try:
    import json
    import hashlib
    import os
    import secrets
    import smtplib
    from typing import Optional
    from email.message import EmailMessage
    import httpx

    from fastapi import APIRouter, HTTPException, Depends, Request
    from fastapi.responses import JSONResponse
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from models import User, UserResponse
    from auth import get_password_hash, verify_password, create_access_token, verify_token
    from config import supabase
    from password_policy import validate_password_strength
    from datetime import timedelta, datetime
    print("All auth imports successful")
except Exception as e:
    print(f"Error importing auth modules: {e}")
    raise

router = APIRouter()
# auto_error=False so cookie-only clients work; token optional in Authorization header.
security = HTTPBearer(auto_error=False)

COOKIE_NAME = "walajna_session"
# Default 7 days — short TTL caused frequent logouts on GitHub Pages + Render.
ACCESS_MAX_AGE_SECONDS = int(os.getenv("ACCESS_TOKEN_MAX_AGE_SECONDS", str(7 * 24 * 3600)))
RESET_CODE_TTL_MINUTES = 10

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


def _utc_now() -> datetime:
    return datetime.utcnow()


def _parse_iso_dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    txt = str(value).strip()
    if not txt:
        return None
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(txt)
        if parsed.tzinfo is not None:
            return parsed.astimezone().replace(tzinfo=None)
        return parsed
    except ValueError:
        return None


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _lookup_user_for_reset(method: str, identifier: str) -> dict | None:
    value = str(identifier or "").strip()
    if not value:
        return None
    if method == "phone":
        res = supabase.table("users").select("id,email,phone,name").eq("phone", value).limit(1).execute()
    else:
        res = supabase.table("users").select("id,email,phone,name").eq("email", value.lower()).limit(1).execute()
    return res.data[0] if res.data else None


def _send_email_smtp(to_email: str, subject: str, body: str) -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    port_raw = (os.getenv("SMTP_PORT") or "587").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    # Gmail App Passwords are often copied with spaces — strip them.
    password = (os.getenv("SMTP_PASS") or "").replace(" ", "").strip()
    sender = (os.getenv("SMTP_FROM_EMAIL") or user).strip()
    use_tls = (os.getenv("SMTP_USE_TLS") or "true").strip().lower() != "false"
    if not host or not sender:
        return False
    try:
        port = int(port_raw)
    except (TypeError, ValueError):
        port = 587

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=20) as server:
        if use_tls:
            server.starttls()
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    return True


def _send_email_resend(to_email: str, subject: str, body: str) -> bool:
    api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    from_email = (
        os.getenv("RESEND_FROM_EMAIL")
        or os.getenv("SMTP_FROM_EMAIL")
        or os.getenv("SMTP_USER")
        or ""
    ).strip()
    if not api_key or not from_email:
        return False

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "text": body,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=20.0) as client:
        resp = client.post("https://api.resend.com/emails", json=payload, headers=headers)
    if resp.status_code >= 300:
        raise RuntimeError(f"Resend send failed: {resp.status_code} {resp.text}")
    return True


def _deliver_reset_code_email(to_email: str, code: str) -> tuple[bool, str]:
    """Try configured providers. Returns (ok, error_message)."""
    subject = "رمز استعادة كلمة المرور — ولجنا / Walajna reset code"
    body = (
        "رمز استعادة كلمة المرور في ولجنا:\n\n"
        f"{code}\n\n"
        f"ينتهي هذا الرمز خلال {RESET_CODE_TTL_MINUTES} دقيقة.\n"
        "إذا لم تطلب ذلك، تجاهل هذه الرسالة.\n\n"
        "---\n"
        "Your Walajna password reset code is:\n\n"
        f"{code}\n\n"
        f"This code expires in {RESET_CODE_TTL_MINUTES} minutes.\n"
        "If you did not request this, ignore this email."
    )
    provider = (os.getenv("RESET_EMAIL_PROVIDER") or "auto").strip().lower()
    errors: list[str] = []

    def try_resend() -> bool:
        try:
            return bool(_send_email_resend(to_email, subject, body))
        except Exception as exc:
            errors.append(f"resend: {exc}")
            print("reset email resend failed:", exc)
            return False

    def try_smtp() -> bool:
        try:
            return bool(_send_email_smtp(to_email, subject, body))
        except Exception as exc:
            errors.append(f"smtp: {exc}")
            print("reset email smtp failed:", exc)
            return False

    if provider == "resend":
        if try_resend():
            return True, ""
        return False, errors[0] if errors else "Resend is not configured"
    if provider == "smtp":
        if try_smtp():
            return True, ""
        return False, errors[0] if errors else "SMTP is not configured"

    # auto: try Resend, then SMTP (even if Resend errors)
    if try_resend():
        return True, ""
    if try_smtp():
        return True, ""
    if errors:
        return False, "; ".join(errors)
    return False, "No email provider configured (set RESEND_* or SMTP_* in backend .env)"

@router.post("/test")
async def test_endpoint():
    print("Test endpoint called")
    return {"message": "Test successful"}

@router.post("/register")
async def register(user: User):
    print("=== REGISTER ENDPOINT CALLED ===")
    try:
        print("Register endpoint called with user:", json.dumps(user.model_dump(), ensure_ascii=True))
    except Exception:
        print("Register endpoint called (payload logging skipped)")
    
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
            try:
                print(
                    "User registered successfully:",
                    json.dumps(result.data[0], ensure_ascii=True),
                )
            except Exception:
                print("User registered successfully (payload logging skipped)")
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


@router.post("/api/reset-password")
@router.post("/reset-password")
async def reset_password(body: dict):
    new_password = str(body.get("new_password", "")).strip()
    try:
        new_password = validate_password_strength(new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    reset_token = str(body.get("reset_token", "")).strip()
    user_row = None
    token_row = None
    if reset_token:
        reset_token_hash = _sha256_hex(reset_token)
        token_res = (
            supabase.table("password_reset_tokens")
            .select("*")
            .eq("reset_token_hash", reset_token_hash)
            .is_("used_at", None)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if token_res.data:
            token_row = token_res.data[0]
            expires_at = _parse_iso_dt(token_row.get("expires_at"))
            verified_at = _parse_iso_dt(token_row.get("verified_at"))
            if not verified_at or (expires_at and expires_at < _utc_now()):
                raise HTTPException(status_code=400, detail="Reset token expired or invalid")
            uid = token_row.get("user_id")
            if uid is not None:
                user_res = supabase.table("users").select("*").eq("id", uid).limit(1).execute()
                if user_res.data:
                    user_row = user_res.data[0]

    # Backward compatibility with previous local/demo flow.
    if user_row is None:
        user_id = body.get("user_id")
        national_id = str(body.get("national_id", "")).strip()
        email = str(body.get("email", "")).strip()
        phone = str(body.get("phone", "")).strip()

        if user_id not in (None, ""):
            try:
                uid = int(user_id)
            except (TypeError, ValueError):
                uid = None
            if uid is not None:
                res = supabase.table("users").select("*").eq("id", uid).limit(1).execute()
                if res.data:
                    user_row = res.data[0]

        if user_row is None and national_id:
            res = supabase.table("users").select("*").eq("national_id", national_id).limit(1).execute()
            if res.data:
                user_row = res.data[0]

        if user_row is None and email:
            res = supabase.table("users").select("*").eq("email", email).limit(1).execute()
            if res.data:
                user_row = res.data[0]

        if user_row is None and phone:
            res = supabase.table("users").select("*").eq("phone", phone).limit(1).execute()
            if res.data:
                user_row = res.data[0]

    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")

    hashed = get_password_hash(new_password)
    upd = (
        supabase.table("users")
        .update({"password": hashed})
        .eq("id", user_row["id"])
        .execute()
    )
    if not upd.data:
        raise HTTPException(status_code=500, detail="Failed to update password")

    if token_row and token_row.get("id") is not None:
        supabase.table("password_reset_tokens").update(
            {"used_at": _utc_now().isoformat()}
        ).eq("id", token_row["id"]).execute()

    return {"ok": True, "user_id": user_row["id"]}


@router.post("/api/forgot-password")
@router.post("/forgot-password")
async def forgot_password(body: dict):
    method = str(body.get("method", "email")).strip().lower()
    if method not in ("email", "phone"):
        method = "email"
    identifier = str(body.get("identifier", "")).strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifier is required")

    user_row = _lookup_user_for_reset(method, identifier)
    # Privacy-safe response for unknown identifiers.
    if user_row is None:
        return {"ok": True, "sent": True}

    email = str(user_row.get("email") or "").strip().lower()
    if not email:
        # Keep generic response to avoid account probing.
        return {"ok": True, "sent": True}

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    expires_at = (_utc_now() + timedelta(minutes=RESET_CODE_TTL_MINUTES)).isoformat()
    code_hash = _sha256_hex(code)

    try:
        supabase.table("password_reset_tokens").insert(
            {
                "user_id": user_row.get("id"),
                "code_hash": code_hash,
                "channel": "email",
                "destination": email,
                "expires_at": expires_at,
                "used_at": None,
                "verified_at": None,
                "attempts": 0,
                "created_at": _utc_now().isoformat(),
            }
        ).execute()
    except Exception as exc:
        print("password_reset_tokens insert failed:", exc)
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to create reset code. "
                "Ensure the password_reset_tokens table exists in Supabase "
                "(backend/sql/password_reset_tokens_2026.sql)."
            ),
        )

    sent, send_err = _deliver_reset_code_email(email, code)
    if not sent:
        print(
            f"[password-reset] email delivery failed for user_id={user_row.get('id')} "
            f"email={email}: {send_err}"
        )
        print(
            f"[password-reset][fallback] code for user_id={user_row.get('id')} email={email}: {code}"
        )
        # Local/dev escape hatch when SMTP/Resend is misconfigured (e.g. Gmail blocks login).
        # Set RESET_CODE_FALLBACK=false in production once mail works.
        allow_fallback = (os.getenv("RESET_CODE_FALLBACK") or "true").strip().lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        if allow_fallback:
            return {
                "ok": True,
                "sent": False,
                "fallback_code": code,
                "detail": (
                    "Email could not be sent (check Gmail App Password / Resend). "
                    "Use the on-screen code to continue."
                ),
            }
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not send the reset email. "
                "For Gmail SMTP use an App Password (not your normal password). "
                "Or configure RESEND_API_KEY / RESEND_FROM_EMAIL."
            ),
        )
    return {"ok": True, "sent": True}


@router.post("/api/verify-reset-code")
@router.post("/verify-reset-code")
async def verify_reset_code(body: dict):
    method = str(body.get("method", "email")).strip().lower()
    if method not in ("email", "phone"):
        method = "email"
    identifier = str(body.get("identifier", "")).strip()
    code = str(body.get("code", "")).strip()
    if not identifier or not code:
        raise HTTPException(status_code=400, detail="Identifier and code are required")

    user_row = _lookup_user_for_reset(method, identifier)
    if user_row is None:
        raise HTTPException(status_code=400, detail="Invalid code")

    uid = user_row.get("id")
    token_rows = (
        supabase.table("password_reset_tokens")
        .select("*")
        .eq("user_id", uid)
        .eq("channel", "email")
        .is_("used_at", None)
        .order("id", desc=True)
        .limit(10)
        .execute()
    )
    rows = token_rows.data or []
    if not rows:
        raise HTTPException(status_code=400, detail="Invalid code")

    now = _utc_now()
    code_hash = _sha256_hex(code)
    matched = None
    for row in rows:
        expires_at = _parse_iso_dt(row.get("expires_at"))
        if expires_at and expires_at < now:
            continue
        if str(row.get("code_hash") or "") == code_hash:
            matched = row
            break
    if matched is None:
        latest = rows[0]
        tries = int(latest.get("attempts") or 0) + 1
        supabase.table("password_reset_tokens").update({"attempts": tries}).eq("id", latest.get("id")).execute()
        raise HTTPException(status_code=400, detail="Invalid code")

    reset_token = secrets.token_urlsafe(32)
    reset_token_hash = _sha256_hex(reset_token)
    supabase.table("password_reset_tokens").update(
        {
            "verified_at": now.isoformat(),
            "reset_token_hash": reset_token_hash,
        }
    ).eq("id", matched.get("id")).execute()

    return {"ok": True, "reset_token": reset_token}


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

    try:
        import time

        last_exc = None
        result = None
        for attempt in range(3):
            try:
                if national_id:
                    result = (
                        supabase.table("users")
                        .select("*")
                        .eq("national_id", national_id)
                        .execute()
                    )
                else:
                    result = (
                        supabase.table("users").select("*").eq("email", email).execute()
                    )
                last_exc = None
                break
            except Exception as db_exc:
                last_exc = db_exc
                msg = str(db_exc)
                # After project unpause, PostgREST often returns PGRST002 until schema cache is ready.
                transient = (
                    "PGRST002" in msg
                    or "schema cache" in msg.lower()
                    or "ConnectError" in type(db_exc).__name__
                    or "LocalProtocolError" in msg
                )
                if transient and attempt < 2:
                    time.sleep(0.8 * (attempt + 1))
                    continue
                break
        if last_exc is not None:
            print("login supabase query failed:", type(last_exc).__name__, last_exc)
            raise HTTPException(
                status_code=503,
                detail="Database temporarily unavailable. Please retry in a moment.",
            ) from last_exc
    except HTTPException:
        raise
    except Exception as db_exc:
        print("login supabase query failed:", type(db_exc).__name__, db_exc)
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please retry in a moment.",
        ) from db_exc

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
        expires_delta=timedelta(seconds=ACCESS_MAX_AGE_SECONDS),
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
            # Cross-origin frontends (e.g. GitHub Pages) cannot rely on cookies; use Bearer token.
            "access_token": token,
        }
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
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
    def fetch_user_by(column: str, value):
        """
        Supabase/httpx can rarely throw transient LocalProtocolError; retry once so
        protected endpoints don't fail with 500 and break the UI.
        """
        last_exc = None
        for attempt in range(2):
            try:
                return supabase.table("users").select("*").eq(column, value).execute()
            except Exception as exc:
                last_exc = exc
                if attempt == 0 and "LocalProtocolError" in str(exc):
                    continue
                break
        print(f"get_current_user lookup failed on {column}={value!r}: {last_exc}")
        # Do not return 401 on transient DB errors — the frontend treats 401 as "log out now".
        raise HTTPException(
            status_code=503,
            detail="Database temporarily unavailable. Please retry.",
        )

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
        user = fetch_user_by("id", user_id)
        if not user.data:
            raise HTTPException(status_code=401, detail="User not found")
        return user.data[0]

    if "@" in subject:
        user = fetch_user_by("email", subject)
    else:
        user = fetch_user_by("national_id", subject)
    if not user.data:
        raise HTTPException(status_code=401, detail="User not found")
    return user.data[0]