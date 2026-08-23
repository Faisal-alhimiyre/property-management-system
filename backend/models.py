
import json
import re
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Any, Optional, List
from datetime import datetime, date

from password_policy import validate_password_strength

# Exactly 3 Arabic name parts: first + father + family (single spaces).
_ARABIC_NAME_PART = re.compile(
    r"^[\u0621-\u064A\u0671\u067E\u0686\u0698\u06A9\u06AF\u06BE\u06C1\u06CC\u06D5آأؤإئءةى]{2,}$"
)


def normalize_government_full_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def is_valid_government_full_name(value: str) -> bool:
    normalized = normalize_government_full_name(value)
    parts = normalized.split(" ")
    if len(parts) != 3:
        return False
    return all(_ARABIC_NAME_PART.match(part) for part in parts)


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

    @field_validator("name")
    @classmethod
    def validate_government_full_name(cls, value: str) -> str:
        normalized = normalize_government_full_name(value)
        if not is_valid_government_full_name(normalized):
            raise ValueError(
                "Full name must be exactly 3 Arabic names "
                "(first father family), e.g. محمد عبدالله الأحمد"
            )
        return normalized

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)

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
    rent: Optional[float] = None
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
    yearly_rent: Optional[float] = None

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

class DocumentCreate(BaseModel):
    """POST /api/documents — server sets user_id from the session."""

    model_config = ConfigDict(extra="ignore")

    apartment_id: int
    name: str
    url: str
    mime_type: Optional[str] = None
    doc_type: Optional[str] = None
    contract_id: Optional[int] = None
    generated_automatically: Optional[bool] = False


class DocumentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    user_id: int
    apartment_id: int
    contract_id: Optional[int] = None
    name: str
    mime_type: Optional[str] = None
    doc_type: Optional[str] = None
    url: str
    generated_automatically: Optional[bool] = False
    uploaded_at: Optional[datetime] = None


class CostCreate(BaseModel):
    """POST /api/costs — owner-only; persists to public.costs."""

    model_config = ConfigDict(extra="ignore")

    apartment_id: int
    contract_id: Optional[int] = None
    cost_type: str
    amount: float
    status: str = "approved"
    expense_date: date
    notes: Optional[str] = None
    funding_source: str = "owner"  # owner | security_deposit
    deposit_covered_amount: Optional[float] = None


class CostResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    apartment_id: int
    contract_id: Optional[int] = None
    cost_type: str
    amount: float
    status: str
    expense_date: date
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    funding_source: Optional[str] = "owner"
    deposit_covered_amount: Optional[float] = 0.0


class DepositTransactionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    contract_id: int
    apartment_id: int
    type: str
    amount: float
    cost_id: Optional[int] = None
    notes: Optional[str] = None


class DepositTransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    contract_id: int
    apartment_id: int
    type: str
    amount: float
    cost_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class DepositBalanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    contract_id: int
    apartment_id: Optional[int] = None
    original: float = 0.0
    received: float = 0.0
    used: float = 0.0
    replenished: float = 0.0
    refunded: float = 0.0
    remaining: float = 0.0
    is_settled: bool = True


class ContractPdfRenderCreate(BaseModel):
    """POST /api/documents/render-upload-contract-pdf"""

    model_config = ConfigDict(extra="ignore")

    apartment_id: int
    name: str
    html: str
    contract_id: Optional[int] = None
    doc_type: Optional[str] = "auto_lease_contract"
    generated_automatically: Optional[bool] = True

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
    # From buildings.name via join lookup — not a column on apartments.
    building_name: Optional[str] = None
    apartment_number: Optional[str] = None
    floor_number: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    living_rooms: Optional[int] = None
    address: str = ""
    description: Optional[str] = None
    rent: Optional[float] = None
    tenant_user_id: Optional[int] = None
    tenant_national_id: Optional[str] = None
    tenant_info: Optional[dict] = None
    current_contract_id: Optional[int] = None
    lease_status: Optional[str] = "vacant"
    maintenance_id: Optional[int] = None
    # Open tenant requests for this unit (owner list GET); not a DB column.
    open_requests: Optional[list[dict[str, Any]]] = None
    created_at: Optional[datetime] = None
    # Built from public.contracts link-tenant columns (+ dates); API-only, not an apartments column.
    lease_terms: Optional[dict[str, Any]] = None
    # Filled for tenants on GET /apartments/{id} only (linked tenant); not a DB column.
    owner_public_name: Optional[str] = None
    owner_public_national_id: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def coerce_supabase_apartment_row(cls, data: Any) -> Any:
        """DB rows may omit NOT NULL legacy fields or return JSON as strings; avoid 500 on list endpoints."""
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if out.get("address") is None:
            out["address"] = ""
        if out.get("rent") is None:
            out["rent"] = 0.0
        ti = out.get("tenant_info")
        if isinstance(ti, str) and ti.strip():
            try:
                parsed = json.loads(ti)
                out["tenant_info"] = parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                out["tenant_info"] = None
        return out

class Building(BaseModel):
    id: Optional[int] = None
    owner_id: Optional[int] = None
    name: str = Field(min_length=3, max_length=40)

    @field_validator("name")
    @classmethod
    def normalize_building_name(cls, value: str) -> str:
        return " ".join(str(value or "").split())
    city: str
    neighborhood: Optional[str] = None
    code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_floors: Optional[int] = None
    apartments_count: Optional[int] = None
    apartments_per_floor: Optional[int] = None
    created_at: Optional[datetime] = None

class BuildingPinUpdate(BaseModel):
    pinned: bool


class BuildingResponse(BaseModel):
    id: int | str
    owner_id: int | str
    name: str
    city: str
    neighborhood: Optional[str] = None
    code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_floors: Optional[int] = None
    apartments_count: Optional[int] = None
    apartments_per_floor: Optional[int] = None
    is_pinned: bool = False
    pinned_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


class UnitLayoutItem(BaseModel):
    """One physical unit when applying per-floor counts + room mix from the owner wizard."""

    model_config = ConfigDict(extra="ignore")

    floor_number: int
    apartment_number: str
    bedrooms: int = 0
    bathrooms: int = 0
    living_rooms: int = 0


class UnitLayoutBody(BaseModel):
    units: list[UnitLayoutItem]


class ApartmentArLayoutUpsert(BaseModel):
    """Body for PUT /api/apartments/{id}/ar-layout — 3D viewer building spec."""

    model_config = ConfigDict(extra="ignore")

    spec: dict[str, Any]
    focus_apartment_number: Optional[str] = None
    focus_floor_number: Optional[int] = None


class ApartmentArLayoutResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    apartment_id: int
    building_id: Optional[int] = None
    owner_id: int
    spec: dict[str, Any]
    focus_apartment_number: Optional[str] = None
    focus_floor_number: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# Add more response models as needed