import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from models import DocumentCreate, DocumentResponse
from config import supabase
from routes.auth_routes import get_current_user, national_id_lookup_variants, normalize_saudi_national_id
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


def _viewer_id(current_user: dict) -> int:
    try:
        return int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid session") from None


def _apartment_row(apartment_id: int) -> dict | None:
    try:
        res = supabase.table("apartments").select("*").eq("id", apartment_id).limit(1).execute()
    except Exception:
        logger.exception("documents: apartment lookup failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=503, detail="Database error") from None
    rows = getattr(res, "data", None) or []
    return rows[0] if rows else None


def _user_can_access_apartment(current_user: dict, apt: dict) -> bool:
    if not apt:
        return False
    uid = _viewer_id(current_user)
    try:
        oid = apt.get("owner_id")
        if oid is not None and int(oid) == uid:
            return True
    except (TypeError, ValueError):
        pass
    try:
        tuid = apt.get("tenant_user_id")
        if tuid is not None and int(tuid) == uid:
            return True
    except (TypeError, ValueError):
        pass
    current_nid = current_user.get("national_id")
    variants = national_id_lookup_variants(current_nid)
    apt_nid = apt.get("tenant_national_id")
    if variants and apt_nid is not None:
        a = normalize_saudi_national_id(apt_nid)
        c = normalize_saudi_national_id(current_nid)
        if c and a == c:
            return True
        if str(apt_nid).strip() in variants:
            return True
    try:
        tres = (
            supabase.table("tenants")
            .select("id")
            .eq("user_id", uid)
            .eq("apartment_id", apt.get("id"))
            .limit(1)
            .execute()
        )
        if getattr(tres, "data", None):
            return True
    except Exception:
        logger.exception("documents: tenants fallback failed apartment_id=%s", apt.get("id"))
    return False


def _assert_apartment_access(current_user: dict, apartment_id: int) -> dict:
    apt = _apartment_row(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    if not _user_can_access_apartment(current_user, apt):
        raise HTTPException(status_code=403, detail="Not authorized for this apartment")
    return apt


def _row_to_response(row: dict) -> DocumentResponse:
    return DocumentResponse(
        id=int(row["id"]),
        user_id=int(row["user_id"]),
        apartment_id=int(row["apartment_id"]),
        contract_id=row.get("contract_id"),
        name=str(row.get("name") or ""),
        mime_type=row.get("mime_type"),
        doc_type=row.get("doc_type") or row.get("type"),
        url=str(row.get("url") or ""),
        generated_automatically=bool(row.get("generated_automatically")),
        uploaded_at=row.get("uploaded_at"),
    )


_MISSING_COLUMN_RE = re.compile(r"Could not find the '([^']+)' column")


def _missing_column_from_error(exc: Exception) -> str | None:
    msg = str(exc or "")
    m = _MISSING_COLUMN_RE.search(msg)
    return m.group(1) if m else None


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    apartment_id: int = Query(..., description="Scope documents to one apartment the viewer can access"),
    current_user: dict = Depends(get_current_user),
):
    _assert_apartment_access(current_user, apartment_id)
    try:
        res = (
            supabase.table("documents")
            .select("*")
            .eq("apartment_id", apartment_id)
            .order("uploaded_at", desc=True)
            .execute()
        )
    except Exception as exc:
        logger.exception("documents list failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(res, "data", None) or []
    return [_row_to_response(r) for r in rows]


@router.post("/documents", response_model=DocumentResponse)
async def create_document(body: DocumentCreate, current_user: dict = Depends(get_current_user)):
    _assert_apartment_access(current_user, body.apartment_id)
    uid = _viewer_id(current_user)
    payload: dict[str, Any] = {
        "user_id": uid,
        "apartment_id": body.apartment_id,
        "name": body.name,
        "url": body.url,
        # Legacy schema compatibility: old table may only have `type`.
        "type": body.doc_type or body.mime_type,
        "mime_type": body.mime_type,
        "doc_type": body.doc_type,
        "contract_id": body.contract_id,
        "generated_automatically": bool(body.generated_automatically),
    }
    payload = {k: v for k, v in payload.items() if v is not None and v != ""}
    # Retry by removing unknown columns for legacy Supabase documents schemas.
    ins = None
    attempt_payload = dict(payload)
    for _ in range(6):
        try:
            ins = supabase.table("documents").insert(attempt_payload).execute()
            break
        except Exception as exc:
            missing_col = _missing_column_from_error(exc)
            if missing_col and missing_col in attempt_payload:
                logger.warning("documents insert retry without missing column: %s", missing_col)
                attempt_payload.pop(missing_col, None)
                continue
            logger.exception("documents insert failed")
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    if ins is None:
        raise HTTPException(status_code=503, detail="documents insert failed")
    data = getattr(ins, "data", None) or []
    if not data:
        raise HTTPException(status_code=500, detail="Insert returned no row")
    return _row_to_response(data[0])


@router.delete("/documents/by-apartment/{apartment_id}")
async def delete_documents_for_apartment(
    apartment_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Owner-only: remove all document rows for an apartment (e.g. when deleting a unit)."""
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can bulk-delete apartment documents")
    apt = _apartment_row(apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Apartment not found")
    uid = _viewer_id(current_user)
    try:
        if apt.get("owner_id") is None or int(apt["owner_id"]) != uid:
            raise HTTPException(status_code=403, detail="Not authorized for this apartment")
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized for this apartment") from None
    try:
        supabase.table("documents").delete().eq("apartment_id", apartment_id).execute()
    except Exception as exc:
        logger.exception("documents bulk delete failed apartment_id=%s", apartment_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "apartment_id": apartment_id}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int, current_user: dict = Depends(get_current_user)):
    try:
        res = supabase.table("documents").select("*").eq("id", document_id).limit(1).execute()
    except Exception as exc:
        logger.exception("documents delete lookup failed id=%s", document_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(status_code=404, detail="Document not found")
    row = rows[0]
    aid = int(row["apartment_id"])
    apt = _assert_apartment_access(current_user, aid)
    uid = _viewer_id(current_user)
    try:
        oid = apt.get("owner_id")
        is_owner = oid is not None and int(oid) == uid
    except (TypeError, ValueError):
        is_owner = False
    doc_uid = int(row["user_id"])
    if not is_owner and doc_uid != uid:
        raise HTTPException(status_code=403, detail="Not authorized to delete this document")
    try:
        supabase.table("documents").delete().eq("id", document_id).execute()
    except Exception as exc:
        logger.exception("documents delete failed id=%s", document_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True, "id": document_id}
