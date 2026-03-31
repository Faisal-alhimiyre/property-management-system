from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date

class User(BaseModel):
    id: Optional[int] = None
    email: str
    password: str
    role: str  # owner or tenant
    name: str
    phone: Optional[str] = None
    national_id: str
    created_at: Optional[datetime] = None

class Apartment(BaseModel):
    id: Optional[int] = None
    owner_id: int
    address: str
    description: Optional[str] = None
    rent: float
    created_at: Optional[datetime] = None

class Tenant(BaseModel):
    id: Optional[int] = None
    user_id: int
    apartment_id: int
    lease_start: datetime
    lease_end: datetime
    created_at: Optional[datetime] = None

class Payment(BaseModel):
    id: Optional[int] = None
    tenant_id: int
    amount: float
    date: datetime
    status: str  # paid, pending, etc.
    created_at: Optional[datetime] = None

class Message(BaseModel):
    id: Optional[int] = None
    sender_id: int
    receiver_id: int
    content: str
    timestamp: Optional[datetime] = None

class Contract(BaseModel):
    id: Optional[int] = None
    apartment_id: int
    tenant_id: int
    start_date: date
    end_date: date
    terms: Optional[str] = None
    status: str = "active"
    created_at: Optional[datetime] = None

class Document(BaseModel):
    id: Optional[int] = None
    user_id: int
    apartment_id: Optional[int] = None
    name: str
    type: Optional[str] = None
    url: str
    uploaded_at: Optional[datetime] = None

class MaintenanceRequest(BaseModel):
    id: Optional[int] = None
    tenant_id: int
    apartment_id: int
    title: str
    description: str
    status: str = "pending"
    priority: str = "medium"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class Notification(BaseModel):
    id: Optional[int] = None
    user_id: int
    title: str
    message: str
    is_read: bool = False
    created_at: Optional[datetime] = None

class ApartmentHistory(BaseModel):
    id: Optional[int] = None
    apartment_id: int
    user_id: int
    change_type: str
    old_data: Optional[dict] = None
    new_data: Optional[dict] = None
    changed_at: Optional[datetime] = None

# Response models
class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    name: str
    phone: Optional[str] = None
    national_id: str
    created_at: datetime

class ApartmentResponse(BaseModel):
    id: int
    owner_id: int
    building_id: Optional[int] = None
    apartment_number: Optional[str] = None
    floor_number: Optional[int] = None
    address: str
    description: Optional[str] = None
    rent: float
    tenant_user_id: Optional[int] = None
    tenant_national_id: Optional[str] = None
    tenant_info: Optional[dict] = None
    current_contract_id: Optional[int] = None
    lease_status: Optional[str] = "vacant"
    status: Optional[str] = None
    created_at: Optional[datetime] = None

class Building(BaseModel):
    id: Optional[int] = None
    owner_id: Optional[int] = None
    name: str
    city: str
    code: Optional[str] = None
    total_floors: Optional[int] = None
    apartments_count: Optional[int] = None
    created_at: Optional[datetime] = None

class BuildingResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    city: str
    code: Optional[str] = None
    total_floors: Optional[int] = None
    apartments_count: Optional[int] = None
    created_at: Optional[datetime] = None

# Add more response models as needed