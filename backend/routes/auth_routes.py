try:
    from fastapi import APIRouter, HTTPException, Depends
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from models import User, UserResponse
    from auth import get_password_hash, verify_password, create_access_token, verify_token
    from pydantic import BaseModel
    from config import supabase
    from datetime import timedelta, datetime
    print("All auth imports successful")
except Exception as e:
    print(f"Error importing auth modules: {e}")
    raise

router = APIRouter()
security = HTTPBearer()

print("Auth router created successfully")
print("User model imported:", User)


def _claim_pending_tenant_assignments(user_id: int, national_id: str | None):
    if not national_id:
        return

    apartments_result = (
        supabase.table("apartments")
        .select("id,current_contract_id,tenant_user_id")
        .eq("tenant_national_id", national_id)
        .execute()
    )
    apartments = getattr(apartments_result, "data", None) or []
    print("Pending tenant assignments found:", apartments)

    for apartment in apartments:
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
        
        # Create user data for database
        user_data = {
            "email": user.email,
            "password": hashed_password,
            "role": user.role,
            "name": user.name,
            "national_id": user.national_id,
            "created_at": datetime.utcnow().isoformat()
        }
        # Only include phone if it's provided
        if user.phone:
            user_data["phone"] = user.phone
        
        # Insert user into database
        result = supabase.table("users").insert(user_data).execute()
        
        if result.data:
            print("User registered successfully:", result.data[0])
            created_user = result.data[0]
            if created_user.get("role") == "tenant":
                _claim_pending_tenant_assignments(created_user["id"], created_user.get("national_id"))
            return {"message": "User registered successfully", "user_id": created_user["id"]}
        else:
            raise HTTPException(status_code=500, detail="Failed to create user")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error during registration: {e}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


# Pydantic model for login request
class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(request: LoginRequest):
    email = request.email
    password = request.password
    result = supabase.table("users").select("*").eq("email", email).execute()

    if not result.data or not verify_password(password, result.data[0]["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_data = result.data[0]
    access_token = create_access_token(data={"sub": email}, expires_delta=timedelta(minutes=30))

    response_payload = {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_data.get("id"),
            "email": user_data.get("email"),
            "name": user_data.get("name"),
            "role": user_data.get("role"),
            "phone": user_data.get("phone"),
            "national_id": user_data.get("national_id")
        }
    }

    return response_payload

print("Auth router routes after definitions:", [route.path for route in router.routes])

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = supabase.table("users").select("*").eq("email", email).execute()
    if not user.data:
        raise HTTPException(status_code=401, detail="User not found")
    return user.data[0]