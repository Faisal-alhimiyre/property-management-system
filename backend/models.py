from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime, date

class User(BaseModel):
    id: Optional[int] = None
    email: str
    password: str
    # Omitted at signup until auth/role.html; server stores "pending" until then.
    role: Optional[str] = None
    name: str
    phone: Optional[str] = None
    national_id: str
    created_at: Optional[datetime] = None

class Apartment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: Optional[int] = None
    owner_id: Optional[int] = None  # set server-side on create
    building_id: Optional[int] = None
    apartment_number: Optional[str] = None
    floor_number: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    living_rooms: Optional[int] = None
    address: str
    description: Optional[str] = None
    rent: float
    maintenance_id: Optional[int] = None
    created_at: Optional[datetime] = None

class Tenant(BaseModel):
    id: Optional[int] = None
    user_id: Optional[int] = None
    apartment_id: Optional[int] = None
    lease_start: datetime
    lease_end: datetime
    created_at: Optional[datetime] = None

class InstallmentUpdate(BaseModel):
    status: Optional[str] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    paid_at: Optional[str] = None
    notes: Optional[str] = None


class GenerateInstallmentsBody(BaseModel):
    payment_cycle: str = "monthly"

class Message(BaseModel):
    id: Optional[int] = None
    sender_id: int
    receiver_id: int
    content: str
    timestamp: Optional[datetime] = None


class Contract(BaseModel):
    id: Optional[int] = None
    apartment_id: Optional[int] = None
    tenant_id: Optional[int] = None
    start_date: date
    end_date: date
    terms: Optional[str] = None
    created_at: Optional[datetime] = None

class Document(BaseModel):
    id: Optional[int] = None
    user_id: int
    apartment_id: Optional[int] = None
    name: str
    type: Optional[str] = None
    url: str
    uploaded_at: Optional[datetime] = None

class MaintenanceRequestCreate(BaseModel):
    """Body for POST /api/maintenance — tenant profile id is resolved server-side."""

    model_config = ConfigDict(extra="ignore")

    apartment_id: int
    title: str
    description: str
    priority: str = "medium"
    request_type: str = "maintenance"
    contract_id: Optional[int] = None


class MaintenanceRequestPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: Optional[str] = None
    owner_reply: Optional[str] = None
    owner_seen: Optional[bool] = None
    tenant_reply_seen: Optional[bool] = None


class MaintenanceRequest(BaseModel):
    id: Optional[int] = None
    tenant_id: Optional[int] = None
    apartment_id: int
    title: str
    description: str
    status: str = "pending"
    priority: str = "medium"
    request_type: Optional[str] = "maintenance"
    contract_id: Optional[int] = None
    building_id: Optional[int] = None
    submitted_by_user_id: Optional[int] = None
    owner_reply: Optional[str] = None
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
    national_id: Optional[str] = None
    created_at: Optional[datetime] = None
    roles: Optional[List[str]] = None
    active_role: Optional[str] = None


class UserSelfUpdate(BaseModel):
    """Allowed fields for PUT /users/me."""

    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    phone: Optional[str] = None
    national_id: Optional[str] = None
    # Replace entire roles list (advanced); prefer active_role from role.html
    roles: Optional[List[str]] = None
    # Last choice on auth/role.html — merged into roles and sets legacy role column
    active_role: Optional[str] = None

class ApartmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    owner_id: Optional[int] = None
    building_id: Optional[int] = None
    apartment_number: Optional[str] = None
    floor_number: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    living_rooms: Optional[int] = None
    address: str
    description: Optional[str] = None
    rent: float
    tenant_user_id: Optional[int] = None
    tenant_national_id: Optional[str] = None
    tenant_info: Optional[dict] = None
    current_contract_id: Optional[int] = None
    lease_status: Optional[str] = "vacant"
    maintenance_id: Optional[int] = None
    created_at: Optional[datetime] = None
    # Filled for tenants on GET /apartments/{id} only (linked tenant); not a DB column.
    owner_public_name: Optional[str] = None
    owner_public_national_id: Optional[str] = None

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