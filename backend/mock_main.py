from fastapi import FastAPI, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext

# Mock data storage (replace with Supabase later)
users_db = []
apartments_db = []
tenants_db = []
payments_db = []
messages_db = []
contracts_db = []
maintenance_db = []
documents_db = []
notifications_db = []

# JWT settings
SECRET_KEY = "your_secret_key_here"
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Pydantic models
class User(BaseModel):
    email: str
    password: str
    role: str
    name: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    name: str
    created_at: datetime

class Apartment(BaseModel):
    owner_id: int
    address: str
    description: Optional[str] = None
    rent: float

class ApartmentResponse(BaseModel):
    id: int
    owner_id: int
    address: str
    description: Optional[str]
    rent: float
    created_at: datetime

app = FastAPI(title="Property Management API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper functions
def hash_password(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except:
        # Fallback for mock version
        return f"hashed_{password}"

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except:
        # Fallback for mock version
        return hashed_password == f"hashed_{plain_password}"

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(hours=1)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        user = next((u for u in users_db if u["email"] == email), None)
        return user
    except:
        return None

# Routes
@app.post("/auth/register")
async def register(user: User):
    if any(u["email"] == user.email for u in users_db):
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = {
        "id": len(users_db) + 1,
        "email": user.email,
        "password": hash_password(user.password),
        "role": user.role,
        "name": user.name,
        "created_at": datetime.utcnow()
    }
    users_db.append(new_user)
    return {"message": "User registered successfully"}

@app.post("/auth/login")
async def login(email: str = Form(...), password: str = Form(...)):
    user = next((u for u in users_db if u["email"] == email), None)
    if not user or not verify_password(password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def get_me(token: str = None):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user = get_current_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return UserResponse(**user)

@app.post("/api/apartments")
async def create_apartment(apartment: Apartment, token: str = None):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user = get_current_user(token)
    if not user or user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create apartments")

    new_apartment = {
        "id": len(apartments_db) + 1,
        "owner_id": user["id"],
        "address": apartment.address,
        "description": apartment.description,
        "rent": apartment.rent,
        "created_at": datetime.utcnow()
    }
    apartments_db.append(new_apartment)
    return ApartmentResponse(**new_apartment)

@app.get("/api/apartments")
async def get_apartments(token: str = None):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    user = get_current_user(token)

    if user["role"] == "owner":
        apartments = [a for a in apartments_db if a["owner_id"] == user["id"]]
    else:
        # For tenants, get their apartment
        tenant = next((t for t in tenants_db if t["user_id"] == user["id"]), None)
        if tenant:
            apartments = [a for a in apartments_db if a["id"] == tenant["apartment_id"]]
        else:
            apartments = []

    return [ApartmentResponse(**apt) for apt in apartments]

@app.get("/")
async def root():
    return {"message": "Property Management API - Mock Version"}