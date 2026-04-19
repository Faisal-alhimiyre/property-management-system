import logging
import os
import re
import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from models import ContractPdfRenderCreate, DocumentCreate, DocumentResponse
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
_SAFE_FILE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _missing_column_from_error(exc: Exception) -> str | None:
    msg = str(exc or "")
    m = _MISSING_COLUMN_RE.search(msg)
    return m.group(1) if m else None


def _safe_file_name(value: str) -> str:
    name = _SAFE_FILE_RE.sub("_", str(value or "document").strip())
    name = name.strip("._")
    return name or "document"


def _insert_document_with_compat_retry(payload: dict[str, Any]) -> dict:
    payload = {k: v for k, v in payload.items() if v is not None and v != ""}
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
    return data[0]


def _upload_bytes_to_storage(
    *,
    bucket: str,
    object_path: str,
    content: bytes,
    mime_type: str,
) -> str:
    supabase.storage.from_(bucket).upload(
        object_path,
        content,
        {"content-type": mime_type, "upsert": "true"},
    )
    return supabase.storage.from_(bucket).get_public_url(object_path)


def _render_pdf_bytes_sync(html: str) -> bytes:
    # Use sync Playwright in a worker thread on Windows to avoid asyncio subprocess limitations.
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1240, "height": 1754})
            page.set_content(html, wait_until="networkidle")
            page.emulate_media(media="print")
            pdf_bytes = page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            return pdf_bytes or b""
        finally:
            browser.close()


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
    row = _insert_document_with_compat_retry(payload)
    return _row_to_response(row)


@router.post("/documents/upload-generated", response_model=DocumentResponse)
async def upload_generated_document(
    apartment_id: int = Form(...),
    name: str = Form(...),
    contract_id: int | None = Form(None),
    doc_type: str | None = Form(None),
    generated_automatically: bool = Form(False),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    _assert_apartment_access(current_user, apartment_id)
    uid = _viewer_id(current_user)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded file is too large (>20MB)")

    bucket = (os.getenv("SUPABASE_DOCS_BUCKET") or "documents").strip() or "documents"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    safe_name = _safe_file_name(name or file.filename or "document.pdf")
    object_path = f"user-{uid}/apartment-{int(apartment_id)}/{stamp}_{safe_name}"
    mime_type = (file.content_type or "application/octet-stream").strip()

    try:
        object_url = _upload_bytes_to_storage(
            bucket=bucket,
            object_path=object_path,
            content=content,
            mime_type=mime_type,
        )
    except Exception as exc:
        logger.exception("documents upload-generated storage failed bucket=%s path=%s", bucket, object_path)
        raise HTTPException(
            status_code=503,
            detail=f"Storage upload failed (bucket={bucket}). Ensure bucket exists/public. {str(exc)}",
        ) from exc

    payload: dict[str, Any] = {
        "user_id": uid,
        "apartment_id": int(apartment_id),
        "name": name,
        "url": object_url,
        "type": doc_type or mime_type,
        "mime_type": mime_type,
        "doc_type": doc_type,
        "contract_id": contract_id,
        "generated_automatically": bool(generated_automatically),
    }
    row = _insert_document_with_compat_retry(payload)
    return _row_to_response(row)


@router.post("/documents/render-upload-contract-pdf", response_model=DocumentResponse)
async def render_upload_contract_pdf(
    body: ContractPdfRenderCreate,
    current_user: dict = Depends(get_current_user),
):
    _assert_apartment_access(current_user, body.apartment_id)
    uid = _viewer_id(current_user)
    html = str(body.html or "").strip()
    if not html:
        raise HTTPException(status_code=400, detail="html is required")
    if len(html) > 2_000_000:
        raise HTTPException(status_code=413, detail="html payload too large")

    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Playwright is not installed. Install dependency and browser: "
                "`pip install playwright && playwright install chromium`."
            ),
        ) from exc

    try:
        pdf_bytes = await asyncio.to_thread(_render_pdf_bytes_sync, html)
    except Exception as exc:
        logger.exception("render-upload-contract-pdf playwright render failed apartment_id=%s", body.apartment_id)
        exc_name = type(exc).__name__
        exc_text = str(exc).strip() or repr(exc)
        raise HTTPException(
            status_code=503,
            detail=f"Server PDF render failed ({exc_name}): {exc_text}",
        ) from exc

    if not pdf_bytes or len(pdf_bytes) < 1024:
        raise HTTPException(status_code=503, detail="Server PDF render returned empty content")

    bucket = (os.getenv("SUPABASE_DOCS_BUCKET") or "documents").strip() or "documents"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    safe_name = _safe_file_name(body.name or "contract.pdf")
    object_path = f"user-{uid}/apartment-{int(body.apartment_id)}/{stamp}_{safe_name}"
    mime_type = "application/pdf"

    try:
        object_url = _upload_bytes_to_storage(
            bucket=bucket,
            object_path=object_path,
            content=pdf_bytes,
            mime_type=mime_type,
        )
    except Exception as exc:
        logger.exception("render-upload-contract-pdf storage failed bucket=%s path=%s", bucket, object_path)
        raise HTTPException(
            status_code=503,
            detail=f"Storage upload failed (bucket={bucket}). Ensure bucket exists/public. {str(exc)}",
        ) from exc

    payload: dict[str, Any] = {
        "user_id": uid,
        "apartment_id": int(body.apartment_id),
        "name": body.name,
        "url": object_url,
        "type": body.doc_type or mime_type,
        "mime_type": mime_type,
        "doc_type": body.doc_type or "auto_lease_contract",
        "contract_id": body.contract_id,
        "generated_automatically": bool(body.generated_automatically),
    }
    row = _insert_document_with_compat_retry(payload)
    return _row_to_response(row)


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
