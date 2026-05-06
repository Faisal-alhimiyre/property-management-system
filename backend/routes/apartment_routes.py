import asyncio
import json
import logging
from collections import defaultdict
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from models import Apartment, ApartmentResponse
from config import supabase
from routes.auth_routes import get_current_user, normalize_saudi_national_id, national_id_lookup_variants
from user_roles import has_role

router = APIRouter()
logger = logging.getLogger(__name__)


def _normalize_assign_payload(payload: dict) -> dict:
    payload = payload or {}
    tenant_info = payload.get("tenant_info", payload.get("tenantInfo")) or {}
    if isinstance(tenant_info, str):
        try:
            tenant_info = json.loads(tenant_info)
        except json.JSONDecodeError:
            tenant_info = {}
    if not isinstance(tenant_info, dict):
        tenant_info = {}
    tenant_national_id = (
        payload.get("tenant_national_id")
        or payload.get("tenantNationalId")
        or payload.get("national_id")
        or payload.get("nationalId")
        or tenant_info.get("national_id")
        or tenant_info.get("nationalId")
    )
    if tenant_national_id is not None:
        tenant_national_id = str(tenant_national_id).strip() or None
        nn = normalize_saudi_national_id(tenant_national_id)
        if nn:
            tenant_national_id = nn

    broker_raw = payload.get("broker")
    if broker_raw is None:
        broker_raw = {
            "name": payload.get("broker_name", payload.get("brokerName")),
            "commercialRegister": payload.get("broker_commercial_register", payload.get("brokerCommercialRegister")),
            "phone": payload.get("broker_phone", payload.get("brokerPhone")),
        }
    if not isinstance(broker_raw, dict):
        broker_raw = {}

    services_raw = payload.get("services")
    if services_raw is None:
        services_raw = {
            "electricityIncluded": payload.get("electricity_included", payload.get("electricityIncluded")),
            "waterIncluded": payload.get("water_included", payload.get("waterIncluded")),
            "gasType": payload.get("gas_type", payload.get("gasType")),
            "acType": payload.get("ac_type", payload.get("acType")),
        }
    if not isinstance(services_raw, dict):
        services_raw = {}

    normalized = {
        "tenant_user_id": payload.get("tenant_user_id", payload.get("tenantUserId")),
        "tenant_national_id": tenant_national_id,
        "tenant_info": tenant_info,
        "start_date": payload.get("start_date", payload.get("startDate")),
        "end_date": payload.get("end_date", payload.get("endDate")),
        "rent": payload.get("rent"),
        "notes": payload.get("notes"),
        "meter_number": payload.get("meter_number", payload.get("meterNumber")),
        "bedrooms": payload.get("bedrooms"),
        "bathrooms": payload.get("bathrooms"),
        "living_rooms": payload.get("living_rooms", payload.get("livingRooms")),
        "payment_cycle": payload.get("payment_cycle", payload.get("paymentCycle")),
        "installments_count": payload.get("installments_count", payload.get("installmentsCount")),
        "insurance_paid": payload.get("insurance_paid", payload.get("insurancePaid")),
        "floor_number": payload.get("floor_number", payload.get("floorNumber")),
        "yearly_rent": payload.get("yearly_rent", payload.get("yearlyRent")),
        "broker": broker_raw,
        "services": services_raw,
    }
    return normalized


def _parse_terms_to_dict(existing_terms) -> dict | None:
    if existing_terms is None:
        return None
    s = str(existing_terms).strip()
    if not s:
        return None
    if s.startswith("{"):
        try:
            parsed = json.loads(s)
            return parsed if isinstance(parsed, dict) else {"notes": str(parsed)}
        except json.JSONDecodeError:
            return {"notes": s}
    return {"notes": s}


def _iso_date_fragment(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()[:10]
        except Exception:
            pass
    s = str(value).strip()
    return s[:10] if len(s) >= 10 else (s or None)


def _contract_link_columns_from_normalized(n: dict) -> dict:
    """Maps link-tenant payload to public.contracts columns.

    Rent: canonical value is `yearly_rent` only. If the client sends monthly `rent` without yearly,
    we derive yearly as rent×12 so the DB always stores annual SAR for the lease.
    """
    broker = n.get("broker") or {}
    if not isinstance(broker, dict):
        broker = {}
    svc_in = n.get("services") or {}
    if not isinstance(svc_in, dict):
        svc_in = {}

    ev = svc_in.get("electricityIncluded")
    wv = svc_in.get("waterIncluded")
    gt = svc_in.get("gasType", svc_in.get("gas_type", "none"))
    at = svc_in.get("acType", svc_in.get("ac_type", "none"))

    out: dict[str, object] = {
        "broker_name": str(broker.get("name") or "").strip(),
        "broker_commercial_register": str(
            broker.get("commercialRegister") or broker.get("commercial_register") or ""
        ).strip(),
        "broker_phone": str(broker.get("phone") or "").strip(),
        "electricity_included": (
            bool(ev) if isinstance(ev, bool) else str(ev).lower() in ("true", "1", "yes")
        )
        if ev is not None
        else False,
        "water_included": (
            bool(wv) if isinstance(wv, bool) else str(wv).lower() in ("true", "1", "yes")
        )
        if wv is not None
        else False,
        "gas_type": "central" if str(gt or "").lower() == "central" else "none",
        "ac_type": "central" if str(at or "").lower() == "central" else "none",
        "lease_notes": str(n.get("notes") or ""),
    }

    yr = n.get("yearly_rent")
    yearly_f: float | None = None
    if yr is not None and str(yr).strip() != "":
        try:
            yearly_f = float(yr)
        except (TypeError, ValueError):
            yearly_f = None

    if yearly_f is None or yearly_f <= 0:
        rent_m = n.get("rent")
        if rent_m is not None and str(rent_m).strip() != "":
            try:
                m = float(rent_m)
                if m > 0:
                    yearly_f = m * 12.0
            except (TypeError, ValueError):
                pass

    if yearly_f is not None and yearly_f > 0:
        out["yearly_rent"] = yearly_f

    pc = n.get("payment_cycle")
    if pc is not None and str(pc).strip() != "":
        out["payment_cycle"] = str(pc).strip()

    ic = n.get("installments_count")
    if ic is not None and str(ic).strip() != "":
        try:
            out["installments_count"] = int(float(ic))
        except (TypeError, ValueError):
            pass

    ins = n.get("insurance_paid")
    if ins is not None:
        out["insurance_paid"] = str(ins).strip()

    mn = n.get("meter_number")
    if mn is not None:
        out["meter_number"] = str(mn).strip()

    return out


def _lease_terms_view_from_contract_row(crow: dict) -> dict:
    """API `lease_terms` shape for the frontend; prefers real columns, falls back to legacy `terms` JSON."""
    lt: dict = {}
    sd = crow.get("start_date")
    ed = crow.get("end_date")
    if sd is not None:
        lt["startDate"] = _iso_date_fragment(sd)
    if ed is not None:
        lt["endDate"] = _iso_date_fragment(ed)

    has_cols = any(
        crow.get(k) is not None
        for k in (
            "broker_name",
            "broker_phone",
            "broker_commercial_register",
            "yearly_rent",
            "monthly_rent",
            "payment_cycle",
            "meter_number",
            "lease_notes",
        )
    ) or crow.get("electricity_included") is not None

    if has_cols or crow.get("gas_type") or crow.get("ac_type"):
        lt["brokerInfo"] = {
            "name": crow.get("broker_name") or "",
            "commercialRegister": crow.get("broker_commercial_register") or "",
            "phone": crow.get("broker_phone") or "",
        }
        lt["services"] = {
            "electricityIncluded": bool(crow.get("electricity_included")),
            "waterIncluded": bool(crow.get("water_included")),
            "gasType": crow.get("gas_type") or "none",
            "acType": crow.get("ac_type") or "none",
        }
        yr = crow.get("yearly_rent")
        yf: float | None = None
        if yr is not None:
            try:
                yf = float(yr)
            except (TypeError, ValueError):
                yf = None
        if yf is not None and yf > 0:
            lt["yearlyRent"] = yf
            lt["monthlyRent"] = yf / 12.0
        else:
            mr = crow.get("monthly_rent")
            if mr is not None:
                try:
                    mfv = float(mr)
                    if mfv > 0:
                        lt["yearlyRent"] = mfv * 12.0
                        lt["monthlyRent"] = mfv
                except (TypeError, ValueError):
                    pass
        if crow.get("payment_cycle"):
            lt["paymentCycle"] = str(crow.get("payment_cycle"))
        if crow.get("installments_count") is not None:
            try:
                lt["installmentsCount"] = int(crow.get("installments_count"))
            except (TypeError, ValueError):
                pass
        if crow.get("insurance_paid"):
            lt["insurancePaid"] = str(crow.get("insurance_paid"))
        if crow.get("meter_number"):
            lt["meterNumber"] = str(crow.get("meter_number"))
        if crow.get("lease_notes"):
            lt["notes"] = str(crow.get("lease_notes"))
        return lt

    legacy = _parse_terms_to_dict(crow.get("terms")) or {}
    for k, v in legacy.items():
        if k not in ("startDate", "endDate"):
            lt[k] = v
    try:
        yl = lt.get("yearlyRent")
        ml = lt.get("monthlyRent")
        if yl is not None and float(yl) > 0:
            yfv = float(yl)
            lt["yearlyRent"] = yfv
            lt["monthlyRent"] = yfv / 12.0
        elif ml is not None and float(ml) > 0:
            mfv = float(ml)
            lt["yearlyRent"] = mfv * 12.0
            lt["monthlyRent"] = mfv
    except (TypeError, ValueError):
        pass
    return lt


def _attach_lease_terms_rows(rows: list[dict]) -> None:
    """Mutates rows in place: lease_terms from contracts when current_contract_id is set."""
    if not rows:
        return
    cids: list[int] = []
    for r in rows:
        cid = r.get("current_contract_id")
        if cid is None:
            continue
        try:
            cids.append(int(cid))
        except (TypeError, ValueError):
            continue
    unique = list(dict.fromkeys(cids))
    if not unique:
        return
    try:
        cres = (
            supabase.table("contracts")
            .select("*")
            .in_("id", unique)
            .execute()
        )
    except Exception:
        logger.exception("attach_lease_terms_rows: contracts batch fetch failed")
        return
    by_id: dict[int, dict] = {}
    for crow in getattr(cres, "data", None) or []:
        cid = crow.get("id")
        if cid is None:
            continue
        try:
            icid = int(cid)
        except (TypeError, ValueError):
            continue
        by_id[icid] = _lease_terms_view_from_contract_row(crow)
    for r in rows:
        ccid = r.get("current_contract_id")
        if ccid is None:
            continue
        try:
            ic = int(ccid)
        except (TypeError, ValueError):
            continue
        if ic in by_id:
            r["lease_terms"] = by_id[ic]


def _resolve_tenant_user_id(assign_payload: dict) -> int | None:
    tenant_user_id = assign_payload.get("tenant_user_id")
    if tenant_user_id is not None:
        try:
            return int(tenant_user_id)
        except (TypeError, ValueError):
            return None

    tenant_national_id = assign_payload.get("tenant_national_id")
    if not tenant_national_id:
        return None

    nid_key = normalize_saudi_national_id(tenant_national_id) or str(tenant_national_id).strip()

    user_lookup = (
        supabase.table("users")
        .select("id")
        .eq("national_id", nid_key)
        .limit(1)
        .execute()
    )
    logger.info("tenant user lookup by national_id response: %s", getattr(user_lookup, "data", None))
    if not user_lookup.data:
        return None

    try:
        return int(user_lookup.data[0].get("id"))
    except (TypeError, ValueError):
        return None


def _parse_iso_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _derive_lease_status(_start_date_value, tenant_national_id: str | None) -> str:
    """Assign-tenant: overdue is derived later from payment_installments during reconcile."""
    if not tenant_national_id:
        return "vacant"
    return "occupied"


def _batch_contract_installment_lease_sets(contract_ids: list[int]) -> tuple[set[int], set[int]]:
    """
    Returns:
      contracts_with_any_installment_row — contract has a generated schedule in DB
      contracts_with_overdue_pending — at least one pending installment with due_date before today
    """
    with_rows: set[int] = set()
    overdue: set[int] = set()
    if not contract_ids:
        return with_rows, overdue
    try:
        res = (
            supabase.table("payment_installments")
            .select("contract_id, status, due_date")
            .in_("contract_id", contract_ids)
            .execute()
        )
    except Exception:
        logger.exception(
            "payment_installments batch read failed; lease_status reconcile falls back to occupied"
        )
        return with_rows, overdue

    today = date.today()
    for row in getattr(res, "data", None) or []:
        cid = row.get("contract_id")
        if cid is None:
            continue
        try:
            ic = int(cid)
        except (TypeError, ValueError):
            continue
        with_rows.add(ic)
        if str(row.get("status") or "").lower() != "pending":
            continue
        dd = _parse_iso_date(row.get("due_date"))
        if dd and dd < today:
            overdue.add(ic)

    return with_rows, overdue


def _derive_apartment_lease_status_for_existing_row(
    apartment_row: dict,
    contracts_with_installments: set[int],
    contracts_with_overdue_installments: set[int],
) -> str:
    tenant_user_id = apartment_row.get("tenant_user_id")
    tenant_national_id = apartment_row.get("tenant_national_id")
    tenant_info = apartment_row.get("tenant_info") or {}
    has_tenant = bool(
        tenant_user_id
        or tenant_national_id
        or tenant_info.get("fullName")
        or tenant_info.get("full_name")
    )

    if not has_tenant:
        return "vacant"

    current_contract_id = apartment_row.get("current_contract_id")
    if not current_contract_id:
        return "occupied"
    try:
        cid = int(current_contract_id)
    except (TypeError, ValueError):
        return "occupied"

    if cid in contracts_with_installments:
        return "overdue" if cid in contracts_with_overdue_installments else "occupied"

    # No installment schedule yet — do not mark red based on contract start date alone.
    return "occupied"


def _reconcile_owner_apartment_statuses(apartments_data: list[dict]) -> list[dict]:
    contract_ids: list[int] = []
    for apartment in apartments_data or []:
        cid = apartment.get("current_contract_id")
        if cid is None:
            continue
        try:
            contract_ids.append(int(cid))
        except (TypeError, ValueError):
            continue
    unique_cids = list(dict.fromkeys(contract_ids))
    with_inst, overdue_inst = _batch_contract_installment_lease_sets(unique_cids)

    reconciled = []

    for apartment in apartments_data or []:
        expected_lease_status = _derive_apartment_lease_status_for_existing_row(
            apartment,
            with_inst,
            overdue_inst,
        )

        if apartment.get("lease_status") != expected_lease_status:
            update_payload = {
                "lease_status": expected_lease_status,
            }
            try:
                update_result = (
                    supabase.table("apartments")
                    .update(update_payload)
                    .eq("id", apartment.get("id"))
                    .execute()
                )
                if getattr(update_result, "data", None):
                    apartment = update_result.data[0]
                else:
                    apartment = {**apartment, **update_payload}
            except Exception:
                logger.exception("Failed to reconcile apartment status for apartment_id=%s", apartment.get("id"))
                apartment = {**apartment, **update_payload}

        reconciled.append(apartment)

    return reconciled


def _maintenance_request_is_open(status_raw) -> bool:
    st = str(status_raw or "").lower()
    return st not in ("resolved", "closed")


def _reconcile_owner_apartment_maintenance_pointers(apartments_data: list[dict]) -> list[dict]:
    """
    Keep apartments.maintenance_id in sync with open maintenance_requests rows.
    Points to the lowest id among open requests for that apartment (stable primary ticket).
    """
    if not apartments_data:
        return apartments_data

    apt_ids: list[int] = []
    for apartment in apartments_data:
        aid = apartment.get("id")
        if aid is None:
            continue
        try:
            apt_ids.append(int(aid))
        except (TypeError, ValueError):
            continue
    if not apt_ids:
        return apartments_data

    try:
        res = (
            supabase.table("maintenance_requests")
            .select("id, apartment_id, status, request_type")
            .in_("apartment_id", apt_ids)
            .execute()
        )
    except Exception:
        logger.exception("maintenance_requests batch read failed; skipping maintenance_id reconcile")
        return apartments_data

    open_ids_by_apt: dict[int, list[int]] = defaultdict(list)
    for row in getattr(res, "data", None) or []:
        if not _maintenance_request_is_open(row.get("status")):
            continue
        # Include all request categories created via POST /api/maintenance (not only literal "maintenance").
        rt = str(row.get("request_type") or "maintenance").lower()
        if rt not in ("maintenance", "complaint", "suggestion", "request"):
            continue
        aid = row.get("apartment_id")
        rid = row.get("id")
        if aid is None or rid is None:
            continue
        try:
            open_ids_by_apt[int(aid)].append(int(rid))
        except (TypeError, ValueError):
            continue

    expected: dict[int, int | None] = {}
    for aid in apt_ids:
        rids = open_ids_by_apt.get(aid) or []
        expected[aid] = min(rids) if rids else None

    reconciled: list[dict] = []
    for apartment in apartments_data:
        aid = apartment.get("id")
        if aid is None:
            reconciled.append(apartment)
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            reconciled.append(apartment)
            continue

        exp = expected.get(iaid)
        cur = apartment.get("maintenance_id")
        try:
            cur_i = int(cur) if cur is not None else None
        except (TypeError, ValueError):
            cur_i = None

        if cur_i == exp:
            reconciled.append(apartment)
            continue

        update_payload = {"maintenance_id": exp}
        try:
            update_result = (
                supabase.table("apartments")
                .update(update_payload)
                .eq("id", iaid)
                .execute()
            )
            if getattr(update_result, "data", None):
                apartment = update_result.data[0]
            else:
                apartment = {**apartment, **update_payload}
        except Exception:
            logger.exception("Failed to reconcile maintenance_id for apartment_id=%s", iaid)
            apartment = {**apartment, **update_payload}

        reconciled.append(apartment)

    return reconciled


def _apply_lease_status_view_only(apartments_data: list[dict]) -> None:
    """
    Mutate rows in place: derived lease_status for API response without per-row UPDATEs.
    List reads stay fast; single-apartment GET still persists reconcile when needed.
    """
    if not apartments_data:
        return
    contract_ids: list[int] = []
    for apartment in apartments_data:
        cid = apartment.get("current_contract_id")
        if cid is None:
            continue
        try:
            contract_ids.append(int(cid))
        except (TypeError, ValueError):
            continue
    unique_cids = list(dict.fromkeys(contract_ids))
    with_inst, overdue_inst = _batch_contract_installment_lease_sets(unique_cids)
    for i, apartment in enumerate(apartments_data):
        expected = _derive_apartment_lease_status_for_existing_row(
            apartment,
            with_inst,
            overdue_inst,
        )
        if apartment.get("lease_status") != expected:
            apartments_data[i] = {**apartment, "lease_status": expected}


def _apply_maintenance_pointer_view_only(apartments_data: list[dict]) -> None:
    """Mutate rows in place: derived maintenance_id without per-row UPDATEs."""
    if not apartments_data:
        return
    apt_ids: list[int] = []
    for apartment in apartments_data:
        aid = apartment.get("id")
        if aid is None:
            continue
        try:
            apt_ids.append(int(aid))
        except (TypeError, ValueError):
            continue
    if not apt_ids:
        return
    try:
        res = (
            supabase.table("maintenance_requests")
            .select("id, apartment_id, status, request_type")
            .in_("apartment_id", apt_ids)
            .execute()
        )
    except Exception:
        logger.exception("maintenance_requests batch read failed; skipping maintenance_id view apply")
        return

    open_ids_by_apt: dict[int, list[int]] = defaultdict(list)
    for row in getattr(res, "data", None) or []:
        if not _maintenance_request_is_open(row.get("status")):
            continue
        rt = str(row.get("request_type") or "maintenance").lower()
        if rt not in ("maintenance", "complaint", "suggestion", "request"):
            continue
        aid = row.get("apartment_id")
        rid = row.get("id")
        if aid is None or rid is None:
            continue
        try:
            open_ids_by_apt[int(aid)].append(int(rid))
        except (TypeError, ValueError):
            continue

    expected: dict[int, int | None] = {}
    for aid in apt_ids:
        rids = open_ids_by_apt.get(aid) or []
        expected[aid] = min(rids) if rids else None

    for i, apartment in enumerate(apartments_data):
        aid = apartment.get("id")
        if aid is None:
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            continue
        exp = expected.get(iaid)
        cur = apartment.get("maintenance_id")
        try:
            cur_i = int(cur) if cur is not None else None
        except (TypeError, ValueError):
            cur_i = None
        if cur_i == exp:
            continue
        apartments_data[i] = {**apartment, "maintenance_id": exp}


def _denormalized_tenant_present(apt: dict) -> bool:
    if apt.get("tenant_user_id") is not None:
        return True
    if apt.get("tenant_national_id"):
        return True
    ti = apt.get("tenant_info") or {}
    if isinstance(ti, dict) and (ti.get("fullName") or ti.get("full_name")):
        return True
    return False


def _repair_stale_apartment_tenant_columns(rows: list[dict]) -> list[dict]:
    """
    Persist a fix when contracts were removed in SQL/Table Editor but apartments still hold tenant_*.
    Also clears when current_contract_id points at a missing contract id.
    """
    if not rows:
        return rows
    to_fix: set[int] = set()

    cids: list[int] = []
    for r in rows:
        aid = r.get("id")
        if aid is None:
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            continue
        cid = r.get("current_contract_id")
        if cid is None:
            if _denormalized_tenant_present(r):
                to_fix.add(iaid)
            continue
        try:
            icid = int(cid)
        except (TypeError, ValueError):
            to_fix.add(iaid)
            continue
        cids.append(icid)

    existing_contracts: set[int] = set()
    if cids:
        unique_cids = list(dict.fromkeys(cids))
        try:
            cr = supabase.table("contracts").select("id").in_("id", unique_cids).execute()
            for row in getattr(cr, "data", None) or []:
                if row.get("id") is not None:
                    existing_contracts.add(int(row["id"]))
        except Exception:
            logger.exception("repair: contract batch lookup failed")

    for r in rows:
        aid = r.get("id")
        if aid is None:
            continue
        try:
            iaid = int(aid)
        except (TypeError, ValueError):
            continue
        cid = r.get("current_contract_id")
        if cid is None:
            continue
        try:
            icid = int(cid)
        except (TypeError, ValueError):
            continue
        if icid not in existing_contracts:
            to_fix.add(iaid)

    if not to_fix:
        return rows

    fix_list = list(to_fix)
    clear_payload = {
        "tenant_user_id": None,
        "tenant_national_id": None,
        "tenant_info": None,
        "current_contract_id": None,
        "lease_status": "vacant",
        "maintenance_id": None,
    }
    try:
        try:
            supabase.table("tenants").update({"apartment_id": None}).in_("apartment_id", fix_list).execute()
        except Exception:
            logger.exception("repair: batch detach tenants for apartment_ids=%s", fix_list)
        supabase.table("apartments").update(clear_payload).in_("id", fix_list).execute()
        logger.info("repair stale apartment tenant columns: apartment_ids=%s", fix_list)
    except Exception:
        logger.exception("repair: batch clear apartment tenant columns failed")
        return rows

    try:
        refreshed = supabase.table("apartments").select("*").in_("id", fix_list).execute()
        fresh_by_id = {int(x["id"]): x for x in (getattr(refreshed, "data", None) or [])}
    except Exception:
        logger.exception("repair: re-fetch apartments failed")
        fresh_by_id = {}

    out: list[dict] = []
    for r in rows:
        rid = r.get("id")
        try:
            ir = int(rid)
        except (TypeError, ValueError):
            out.append(r)
            continue
        if ir in fresh_by_id:
            out.append(fresh_by_id[ir])
        else:
            out.append(r)
    return out


def _is_contract_row_active(row: dict) -> bool:
    return str(row.get("status") or "active").lower() == "active"


def _active_contract_rows_for_apartment(apartment_id: int) -> list[dict]:
    try:
        res = (
            supabase.table("contracts")
            .select("id, apartment_id, start_date, end_date")
            .eq("apartment_id", apartment_id)
            .execute()
        )
    except Exception:
        logger.exception("contracts list failed apartment_id=%s", apartment_id)
        return []
    return [r for r in (getattr(res, "data", None) or []) if _is_contract_row_active(r)]


def reconcile_apartment_maintenance_pointer(apartment_id: int) -> None:
    """Call after maintenance_requests create/update to refresh FK on apartments."""
    res = supabase.table("apartments").select("id, maintenance_id").eq("id", apartment_id).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        return
    _reconcile_owner_apartment_maintenance_pointers(rows)


def _get_or_create_tenant_row(
    tenant_user_id: int | None,
    tenant_national_id: str | None,
    apartment_id: int,
    start_date,
    end_date,
) -> dict:
    nid_value = normalize_saudi_national_id(tenant_national_id) if tenant_national_id else None
    if nid_value is None and tenant_national_id:
        tid = str(tenant_national_id).strip()
        nid_value = tid or None
    if nid_value is None and tenant_user_id is not None:
        try:
            ures = (
                supabase.table("users")
                .select("national_id")
                .eq("id", int(tenant_user_id))
                .limit(1)
                .execute()
            )
            urows = getattr(ures, "data", None) or []
            if urows:
                raw_nid = urows[0].get("national_id")
                nn = normalize_saudi_national_id(raw_nid) if raw_nid else None
                if nn:
                    nid_value = nn
                elif raw_nid is not None:
                    s = str(raw_nid).strip()
                    nid_value = s or None
        except Exception:
            logger.exception("tenant national_id lookup by user_id failed user_id=%s", tenant_user_id)

    existing_tenants = (
        supabase.table("tenants")
        .select("*")
        .eq("apartment_id", apartment_id)
        .order("id", desc=True)
        .execute()
    )
    tenant_rows = getattr(existing_tenants, "data", None) or []
    logger.info("tenant profile lookup response: %s", tenant_rows)

    tenant_row = None
    if tenant_user_id is not None:
        tenant_row = next(
            (row for row in tenant_rows if row.get("user_id") is not None and int(row.get("user_id")) == int(tenant_user_id)),
            None,
        )
    else:
        tenant_row = next((row for row in tenant_rows if row.get("user_id") is None), None)

    if tenant_row:
        update_payload = {
            "apartment_id": apartment_id,
            "lease_start": start_date,
            "lease_end": end_date,
        }
        if tenant_user_id is not None and tenant_row.get("user_id") is None:
            update_payload["user_id"] = tenant_user_id
        row_nid = tenant_row.get("national_id")
        row_nid_norm = normalize_saudi_national_id(row_nid) if row_nid else None
        if nid_value and (row_nid_norm is None or row_nid_norm != nid_value):
            update_payload["national_id"] = nid_value
        update_payload = {k: v for k, v in update_payload.items() if v is not None}

        if update_payload:
            tenant_update = (
                supabase.table("tenants")
                .update(update_payload)
                .eq("id", tenant_row["id"])
                .execute()
            )
            logger.info("tenant profile update payload: %s", update_payload)
            logger.info("tenant profile update response: %s", getattr(tenant_update, "data", None))
            if tenant_update.data:
                return tenant_update.data[0]
        return tenant_row

    insert_payload = {
        "apartment_id": apartment_id,
        "lease_start": start_date,
        "lease_end": end_date,
    }
    if tenant_user_id is not None:
        insert_payload["user_id"] = tenant_user_id
    if nid_value:
        insert_payload["national_id"] = nid_value
    insert_payload = {k: v for k, v in insert_payload.items() if v is not None}
    logger.info("tenant profile insert payload: %s", insert_payload)

    tenant_insert = supabase.table("tenants").insert(insert_payload).execute()
    logger.info("tenant profile insert response: %s", getattr(tenant_insert, "data", None))
    if not tenant_insert.data:
        raise HTTPException(status_code=500, detail="Failed to create tenant profile row")

    return tenant_insert.data[0]

@router.post("/apartments", response_model=ApartmentResponse)
async def create_apartment(apartment: Apartment, current_user: dict = Depends(get_current_user)):
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can create apartments")
    
    apartment_data = apartment.model_dump(exclude_none=True)
    # apartments.rent is deprecated; canonical rent is contracts.yearly_rent.
    apartment_data.pop("rent", None)
    apartment_data["owner_id"] = current_user["id"]
    response = supabase.table("apartments").insert(apartment_data).execute()
    row = dict(response.data[0])
    _attach_building_names([row])
    return ApartmentResponse(**row)

def _get_apartments_list_rows(
    current_user: dict,
    as_tenant_view: bool,
    building_id: int | None,
) -> list[dict]:
    """Sync Supabase work for GET /apartments (run in a thread pool so parallel requests do not queue)."""
    rows: list[dict] = []

    if has_role(current_user, "owner") and not as_tenant_view:
        q = supabase.table("apartments").select("*").eq("owner_id", current_user["id"])
        if building_id is not None:
            try:
                bid = int(building_id)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Invalid building_id") from None
            bcheck = (
                supabase.table("buildings")
                .select("id")
                .eq("id", bid)
                .eq("owner_id", current_user["id"])
                .limit(1)
                .execute()
            )
            if not getattr(bcheck, "data", None):
                raise HTTPException(status_code=404, detail="Building not found")
            q = q.eq("building_id", bid)
        owner_rows_result = q.execute()
        rows = getattr(owner_rows_result, "data", None) or []
        rows = _repair_stale_apartment_tenant_columns(rows)
        _apply_lease_status_view_only(rows)
        _apply_maintenance_pointer_view_only(rows)
    else:
        by_user_result = (
            supabase.table("apartments")
            .select("*")
            .eq("tenant_user_id", current_user["id"])
            .execute()
        )
        rows = getattr(by_user_result, "data", None) or []

        national_id_raw = current_user.get("national_id")
        variants = national_id_lookup_variants(national_id_raw)
        canon = normalize_saudi_national_id(national_id_raw)
        if variants:
            by_national_result = (
                supabase.table("apartments")
                .select("*")
                .in_("tenant_national_id", variants)
                .execute()
            )
            for apartment in getattr(by_national_result, "data", None) or []:
                apt_nid = normalize_saudi_national_id(apartment.get("tenant_national_id"))
                if canon and apt_nid != canon:
                    continue
                if not any(existing.get("id") == apartment.get("id") for existing in rows):
                    rows.append(apartment)

        tenant_rows_result = (
            supabase.table("tenants")
            .select("apartment_id")
            .eq("user_id", current_user["id"])
            .execute()
        )
        tenant_rows = getattr(tenant_rows_result, "data", None) or []
        tenant_apartment_ids = [row.get("apartment_id") for row in tenant_rows if row.get("apartment_id") is not None]
        tenant_apartment_ids = list(dict.fromkeys(tenant_apartment_ids))
        if tenant_apartment_ids:
            by_tenants_result = (
                supabase.table("apartments")
                .select("*")
                .in_("id", tenant_apartment_ids)
                .execute()
            )
            for apartment in getattr(by_tenants_result, "data", None) or []:
                if not any(existing.get("id") == apartment.get("id") for existing in rows):
                    rows.append(apartment)

    _attach_building_names(rows)
    _attach_lease_terms_rows(rows)
    return rows


@router.get("/apartments", response_model=list[ApartmentResponse])
async def get_apartments(
    view: str | None = Query(None),
    building_id: int | None = Query(
        None, description="Owner list: return only apartments in this building (must belong to you)"
    ),
    current_user: dict = Depends(get_current_user),
):
    as_tenant_view = (view or "").strip().lower() == "as_tenant"
    try:
        rows = await asyncio.to_thread(_get_apartments_list_rows, current_user, as_tenant_view, building_id)
        return [ApartmentResponse(**apt) for apt in rows]
    except Exception:
        logger.exception(
            "get_apartments failed user_id=%s as_tenant=%s building_id=%s",
            current_user.get("id"),
            as_tenant_view,
            building_id,
        )
        return []

def _get_apartment_detail_row(apartment_id: int, current_user: dict) -> dict:
    """Sync Supabase work for GET /apartments/{id} (run in thread pool). Returns row dict for ApartmentResponse."""
    apartment = supabase.table("apartments").select("*").eq("id", apartment_id).execute()
    if not apartment.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apt = apartment.data[0]

    try:
        viewer_id = int(current_user["id"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized")

    apt_owner_id = apt.get("owner_id")
    try:
        is_landlord = apt_owner_id is not None and int(apt_owner_id) == viewer_id
    except (TypeError, ValueError):
        is_landlord = False

    if not is_landlord:
        current_national_id = current_user.get("national_id")
        is_linked_tenant = (
            apt.get("tenant_user_id") == viewer_id
            or (current_national_id and apt.get("tenant_national_id") == current_national_id)
        )
        if not is_linked_tenant:
            tenant = (
                supabase.table("tenants")
                .select("id")
                .eq("user_id", viewer_id)
                .eq("apartment_id", apartment_id)
                .limit(1)
                .execute()
            )
            if not getattr(tenant, "data", None):
                raise HTTPException(status_code=403, detail="Not authorized")

    if is_landlord:
        tmp = _repair_stale_apartment_tenant_columns([dict(apt)])
        tmp = _reconcile_owner_apartment_statuses(tmp)
        tmp = _reconcile_owner_apartment_maintenance_pointers(tmp)
        apt = tmp[0]

    row = dict(apt)
    if row.get("owner_id") is not None:
        try:
            oid = int(row["owner_id"])
            ures = (
                supabase.table("users")
                .select("*")
                .eq("id", oid)
                .limit(1)
                .execute()
            )
            if getattr(ures, "data", None):
                ou = ures.data[0]
                row["owner_public_name"] = (
                    ou.get("name")
                    or ou.get("full_name")
                    or ou.get("fullName")
                )
                row["owner_public_national_id"] = (
                    ou.get("national_id") or ou.get("nationalId")
                )
        except Exception:
            logger.exception(
                "owner_public lookup failed for tenant apartment_id=%s", apartment_id
            )

    _attach_building_names([row])
    _attach_lease_terms_rows([row])
    return row


@router.get("/apartments/{apartment_id}", response_model=ApartmentResponse)
async def get_apartment(apartment_id: int, current_user: dict = Depends(get_current_user)):
    row = await asyncio.to_thread(_get_apartment_detail_row, apartment_id, current_user)
    return ApartmentResponse(**row)


def _contract_snapshot_for_history(contract_id) -> dict | None:
    if contract_id is None:
        return None
    try:
        cid = int(contract_id)
    except (TypeError, ValueError):
        return None
    try:
        cres = (
            supabase.table("contracts")
            .select("id, start_date, end_date")
            .eq("id", cid)
            .limit(1)
            .execute()
        )
        rows = getattr(cres, "data", None) or []
        if not rows:
            return None
        c = rows[0]
        return {
            "id": c.get("id"),
            "startDate": str(c["start_date"])[:10] if c.get("start_date") else None,
            "endDate": str(c["end_date"])[:10] if c.get("end_date") else None,
        }
    except Exception:
        logger.exception("contract snapshot for apartment_history")
        return None


def _building_name_from_id(building_id) -> str | None:
    if building_id is None:
        return None
    try:
        bid = int(building_id)
    except (TypeError, ValueError):
        return None
    try:
        bres = (
            supabase.table("buildings")
            .select("name")
            .eq("id", bid)
            .limit(1)
            .execute()
        )
        rows = getattr(bres, "data", None) or []
        if not rows:
            return None
        return rows[0].get("name")
    except Exception:
        logger.exception("buildings name lookup for apartment_history")
        return None


def _attach_building_names(rows: list[dict] | None) -> None:
    """Set building_name on each row from buildings.name (batch lookup)."""
    if not rows:
        return
    ids: list[int] = []
    for r in rows:
        bid = r.get("building_id")
        if bid is None:
            continue
        try:
            ids.append(int(bid))
        except (TypeError, ValueError):
            continue
    ids = list(dict.fromkeys(ids))
    if not ids:
        return
    bmap: dict[int, str | None] = {}
    try:
        bres = supabase.table("buildings").select("id,name").in_("id", ids).execute()
        for brow in getattr(bres, "data", None) or []:
            try:
                bid = int(brow.get("id"))
            except (TypeError, ValueError):
                continue
            bmap[bid] = brow.get("name")
    except Exception:
        logger.exception("batch building name lookup for apartment responses")
        return
    for r in rows:
        bid = r.get("building_id")
        if bid is None:
            continue
        try:
            bid_int = int(bid)
        except (TypeError, ValueError):
            continue
        name = bmap.get(bid_int)
        if name is not None:
            r["building_name"] = name


def _user_can_view_apartment_row(apt: dict, current_user: dict) -> bool:
    try:
        viewer_id = int(current_user["id"])
    except (TypeError, ValueError):
        return False
    apt_owner_id = apt.get("owner_id")
    try:
        if apt_owner_id is not None and int(apt_owner_id) == viewer_id:
            return True
    except (TypeError, ValueError):
        pass
    current_national_id = current_user.get("national_id")
    if (
        apt.get("tenant_user_id") == viewer_id
        or (current_national_id and apt.get("tenant_national_id") == current_national_id)
    ):
        return True
    try:
        tenant = (
            supabase.table("tenants")
            .select("id")
            .eq("user_id", viewer_id)
            .eq("apartment_id", apt.get("id"))
            .limit(1)
            .execute()
        )
        if getattr(tenant, "data", None):
            return True
    except Exception:
        logger.exception("tenant fallback auth for apartment_history")
    return False


@router.get("/apartments/{apartment_id}/tenant-history")
async def get_apartment_tenant_history(
    apartment_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Rows from public.apartment_history for this unit (e.g. vacate snapshots)."""
    try:
        aid = int(apartment_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid apartment_id")

    apt_res = supabase.table("apartments").select("*").eq("id", aid).limit(1).execute()
    if not apt_res.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apt = apt_res.data[0]
    if not _user_can_view_apartment_row(apt, current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        hres = (
            supabase.table("apartment_history")
            .select("*")
            .eq("apartment_id", aid)
            .order("changed_at", desc=True)
            .execute()
        )
    except Exception as exc:
        logger.exception("apartment_history select failed apartment_id=%s", aid)
        raise HTTPException(status_code=503, detail=f"apartment_history query failed: {exc!s}") from exc

    rows = getattr(hres, "data", None) or []
    default_building_name = _building_name_from_id(apt.get("building_id"))
    enriched: list[dict] = []
    for row in rows:
        r = dict(row)
        od = r.get("old_data")
        if isinstance(od, dict) and default_building_name and not od.get("buildingName"):
            r["old_data"] = {**od, "buildingName": default_building_name}
        enriched.append(r)
    return enriched


@router.patch("/apartments/{apartment_id}/assign-tenant")
async def assign_tenant_to_apartment(
    apartment_id: int,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    logger.info("assign-tenant route entered: apartment_id=%s current_user_id=%s", apartment_id, current_user.get("id"))
    try:
        if not has_role(current_user, "owner"):
            raise HTTPException(status_code=403, detail="Only owners can assign tenants")

        logger.info("assign-tenant incoming payload: apartment_id=%s payload=%s", apartment_id, payload)
        normalized_payload = _normalize_assign_payload(payload)
        logger.info("assign-tenant normalized payload: %s", normalized_payload)

        # Verify apartment exists and belongs to this owner
        apt_result = supabase.table("apartments").select("*").eq("id", apartment_id).execute()
        logger.info("assign-tenant apartment lookup response: %s", getattr(apt_result, "data", None))
        if not apt_result.data:
            raise HTTPException(status_code=404, detail="Apartment not found")
        apartment = apt_result.data[0]
        apt_owner = apartment.get("owner_id")
        if apt_owner is None or int(apt_owner) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")

        tenant_user_id = _resolve_tenant_user_id(normalized_payload)
        tenant_national_id = normalized_payload.get("tenant_national_id")
        if not tenant_national_id and tenant_user_id is None:
            raise HTTPException(
                status_code=400,
                detail="tenant_national_id is required when tenant_user_id is missing",
            )

        logger.info("assign-tenant resolved tenant_user_id=%s", tenant_user_id)
        logger.info("assign-tenant tenant data payload: national_id=%s tenant_info=%s", tenant_national_id, normalized_payload.get("tenant_info"))

        lease_start = normalized_payload.get("start_date")
        lease_end = normalized_payload.get("end_date")
        if not lease_start or not lease_end:
            raise HTTPException(
                status_code=400,
                detail="start_date and end_date are required (maps to tenants.lease_start / lease_end and contract dates).",
            )

        tenant_row = _get_or_create_tenant_row(
            tenant_user_id=tenant_user_id,
            tenant_national_id=tenant_national_id,
            apartment_id=apartment_id,
            start_date=lease_start,
            end_date=lease_end,
        )
        logger.info("assign-tenant tenant row used: %s", tenant_row)

        existing_ccid = apartment.get("current_contract_id")
        try:
            existing_ccid_int = int(existing_ccid) if existing_ccid is not None else None
        except (TypeError, ValueError):
            existing_ccid_int = None

        link_cols = _contract_link_columns_from_normalized(normalized_payload)

        contract_update_body = {
            "tenant_id": tenant_row.get("id"),
            "start_date": lease_start,
            "end_date": lease_end,
            **link_cols,
        }
        contract_update_body = {k: v for k, v in contract_update_body.items() if v is not None}

        contract_id: int | None = None

        if existing_ccid_int is not None:
            ver = (
                supabase.table("contracts")
                .select("id, apartment_id")
                .eq("id", existing_ccid_int)
                .limit(1)
                .execute()
            )
            vr = getattr(ver, "data", None) or []
            if not vr:
                raise HTTPException(status_code=400, detail="current_contract_id not found")
            try:
                if int(vr[0].get("apartment_id")) != int(apartment_id):
                    raise HTTPException(
                        status_code=400,
                        detail="current_contract_id does not belong to this apartment",
                    )
            except HTTPException:
                raise
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Invalid contract apartment reference") from None

            try:
                upd_c = (
                    supabase.table("contracts")
                    .update(contract_update_body)
                    .eq("id", existing_ccid_int)
                    .execute()
                )
            except Exception as exc:
                logger.exception("assign-tenant contract update failed contract_id=%s", existing_ccid_int)
                raise HTTPException(status_code=500, detail=f"Contract update failed: {str(exc)}") from exc
            if not getattr(upd_c, "data", None):
                raise HTTPException(status_code=500, detail="Contract update returned empty response")
            contract_id = existing_ccid_int
            logger.info("assign-tenant updated existing contract id=%s", contract_id)
        else:
            apt_race = (
                supabase.table("apartments")
                .select("id, current_contract_id")
                .eq("id", apartment_id)
                .limit(1)
                .execute()
            )
            ar = getattr(apt_race, "data", None) or []
            if ar and ar[0].get("current_contract_id"):
                raise HTTPException(
                    status_code=409,
                    detail="Tenant link was already saved for this apartment. Refresh the page.",
                )

            active_for_apt = _active_contract_rows_for_apartment(apartment_id)
            if active_for_apt:
                raise HTTPException(
                    status_code=409,
                    detail="This apartment already has an active contract. Refresh the page or end the current lease first.",
                )

            contract_data = {
                "apartment_id": apartment_id,
                "tenant_id": tenant_row.get("id"),
                "start_date": lease_start,
                "end_date": lease_end,
                **link_cols,
            }
            contract_data = {k: v for k, v in contract_data.items() if v is not None}
            logger.info("assign-tenant contract insert payload: %s", contract_data)

            contract_result = supabase.table("contracts").insert(contract_data).execute()
            logger.info("assign-tenant contract insert response: %s", getattr(contract_result, "data", None))
            if not contract_result.data:
                raise HTTPException(status_code=500, detail="Failed to create contract record: empty response from Supabase")

            created_contract = contract_result.data[0]
            contract_id = created_contract.get("id")
            logger.info("assign-tenant created contract id=%s", contract_id)

        tenant_info = normalized_payload.get("tenant_info") or {}
        full_name = tenant_info.get("fullName", tenant_info.get("full_name"))
        phone_number = tenant_info.get("phoneNumber", tenant_info.get("phone_number"))
        nationality = tenant_info.get("nationality")
        tenant_type = tenant_info.get("tenantType", tenant_info.get("tenant_type"))
        lease_status_value = _derive_lease_status(
            normalized_payload.get("start_date"),
            tenant_national_id,
        )

        update_payload = {
            "tenant_user_id": tenant_user_id,
            "tenant_national_id": tenant_national_id,
            "tenant_info": {
                "fullName": full_name,
                "phoneNumber": phone_number,
                "nationality": nationality,
                "tenantType": tenant_type,
            },
            "current_contract_id": contract_id,
            "lease_status": lease_status_value,
        }
        for db_key in ("bedrooms", "bathrooms", "living_rooms"):
            raw = normalized_payload.get(db_key)
            if raw is None or raw == "":
                continue
            try:
                update_payload[db_key] = int(raw)
            except (TypeError, ValueError):
                pass

        fn_raw = normalized_payload.get("floor_number")
        if fn_raw is not None and str(fn_raw).strip() != "":
            try:
                update_payload["floor_number"] = int(float(fn_raw))
            except (TypeError, ValueError):
                pass

        logger.info(
            "assign-tenant apartment update start: apartment_id=%s contract_id=%s tenant_user_id=%s payload=%s",
            apartment_id,
            contract_id,
            tenant_user_id,
            update_payload,
        )

        try:
            update_result = supabase.table("apartments").update(update_payload).eq("id", apartment_id).execute()
        except Exception as update_exc:
            logger.exception(
                "assign-tenant apartment update exception: apartment_id=%s contract_id=%s tenant_user_id=%s",
                apartment_id,
                contract_id,
                tenant_user_id,
            )
            raise HTTPException(status_code=500, detail=f"Apartment update failed: {str(update_exc)}")

        logger.info(
            "assign-tenant apartment update response: apartment_id=%s contract_id=%s tenant_user_id=%s response=%s",
            apartment_id,
            contract_id,
            tenant_user_id,
            getattr(update_result, "data", None),
        )

        if not update_result.data:
            logger.error("assign-tenant apartment update failed, rolling back contract_id=%s", contract_id)
            if existing_ccid_int is None and contract_id is not None:
                try:
                    supabase.table("contracts").delete().eq("id", contract_id).execute()
                except Exception:
                    logger.exception("assign-tenant rollback failed for contract_id=%s", contract_id)
            raise HTTPException(
                status_code=500,
                detail="Apartment update failed: empty response from Supabase. "
                       "Check that columns tenant_user_id, tenant_national_id, tenant_info, "
                      "current_contract_id, lease_status exist in apartments table.",
            )

        updated_apt = update_result.data[0]
        reconciled = _reconcile_owner_apartment_statuses([dict(updated_apt)])
        reconciled = _reconcile_owner_apartment_maintenance_pointers(reconciled)
        updated_apt = reconciled[0]
        _attach_building_names([updated_apt])
        updated_apt = dict(updated_apt)
        try:
            cref = (
                supabase.table("contracts")
                .select("*")
                .eq("id", int(contract_id))
                .limit(1)
                .execute()
            )
            cr = getattr(cref, "data", None) or []
            updated_apt["lease_terms"] = _lease_terms_view_from_contract_row(cr[0]) if cr else {}
        except Exception:
            logger.exception("assign-tenant: refetch contract for lease_terms failed")
            updated_apt["lease_terms"] = _lease_terms_view_from_contract_row(
                {"start_date": lease_start, "end_date": lease_end}
            )
        logger.info("assign-tenant final response apartment_id=%s response=%s", apartment_id, updated_apt)
        return updated_apt
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("assign-tenant unexpected exception apartment_id=%s", apartment_id)
        raise HTTPException(status_code=500, detail=f"assign-tenant internal error: {str(exc)}")


@router.patch("/apartments/{apartment_id}/vacate-tenant", response_model=ApartmentResponse)
async def vacate_tenant(apartment_id: int, current_user: dict = Depends(get_current_user)):
    """
    End the active tenancy on the apartment row. Does not delete the contract row (history);
    clears tenant links and current_contract_id on the apartment only.
    """
    if not has_role(current_user, "owner"):
        raise HTTPException(status_code=403, detail="Only owners can vacate tenants")

    try:
        apt_id_int = int(apartment_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid apartment_id")

    apt_result = supabase.table("apartments").select("*").eq("id", apt_id_int).execute()
    if not apt_result.data:
        raise HTTPException(status_code=404, detail="Apartment not found")
    apartment = apt_result.data[0]

    apt_owner = apartment.get("owner_id")
    try:
        if apt_owner is None or int(apt_owner) != int(current_user["id"]):
            raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")
    except HTTPException:
        raise
    except (TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Not authorized: apartment belongs to a different owner")

    tenant_info_pre = apartment.get("tenant_info") or {}
    had_tenancy = bool(
        apartment.get("tenant_user_id")
        or apartment.get("tenant_national_id")
        or tenant_info_pre.get("fullName")
        or tenant_info_pre.get("full_name")
        or apartment.get("current_contract_id")
    )
    if had_tenancy:
        old_data_hist: dict = {
            "tenantInfo": tenant_info_pre,
            "tenantNationalId": apartment.get("tenant_national_id"),
            "tenantUserId": apartment.get("tenant_user_id"),
            "currentContractId": apartment.get("current_contract_id"),
        }
        bn_hist = _building_name_from_id(apartment.get("building_id"))
        if bn_hist:
            old_data_hist["buildingName"] = bn_hist
        apt_num = apartment.get("apartment_number")
        if apt_num is not None and str(apt_num).strip() != "":
            old_data_hist["apartmentNumber"] = str(apt_num).strip()
        csnap = _contract_snapshot_for_history(apartment.get("current_contract_id"))
        if csnap:
            old_data_hist["contract"] = csnap
        try:
            supabase.table("apartment_history").insert(
                {
                    "apartment_id": apt_id_int,
                    "user_id": int(current_user["id"]),
                    "change_type": "tenant_vacated",
                    "old_data": old_data_hist,
                    "new_data": {"lease_status": "vacant", "current_contract_id": None},
                }
            ).execute()
        except Exception:
            logger.exception("apartment_history insert failed on vacate apartment_id=%s", apt_id_int)

    ccid_end = apartment.get("current_contract_id")
    if ccid_end is not None:
        try:
            supabase.table("contracts").update({"status": "terminated"}).eq("id", int(ccid_end)).execute()
        except Exception:
            logger.exception("vacate: could not mark contract terminated id=%s", ccid_end)

    # Clear tenant snapshot on the apartment row (vacant unit).
    update_payload = {
        "tenant_user_id": None,
        "tenant_national_id": None,
        "tenant_info": None,
        "current_contract_id": None,
        "lease_status": "vacant",
        "maintenance_id": None,
    }

    try:
        # Detach all tenant profile rows pointing at this unit (covers national-id-only links and stale user_id).
        supabase.table("tenants").update({"apartment_id": None}).eq("apartment_id", apt_id_int).execute()
    except Exception:
        logger.exception("vacate-tenant: failed to detach tenants rows for apartment_id=%s", apt_id_int)

    try:
        update_result = supabase.table("apartments").update(update_payload).eq("id", apt_id_int).execute()
    except Exception as exc:
        logger.exception("vacate-tenant apartment update failed apartment_id=%s", apt_id_int)
        raise HTTPException(status_code=500, detail=f"Apartment update failed: {str(exc)}") from exc

    if not update_result.data:
        raise HTTPException(status_code=500, detail="Apartment update failed: empty response")

    updated_apt = update_result.data[0]
    reconciled = _reconcile_owner_apartment_statuses([dict(updated_apt)])
    reconciled = _reconcile_owner_apartment_maintenance_pointers(reconciled)
    row = reconciled[0] if reconciled else updated_apt

    if row.get("owner_id") is not None:
        try:
            oid = int(row["owner_id"])
            ures = (
                supabase.table("users")
                .select("*")
                .eq("id", oid)
                .limit(1)
                .execute()
            )
            if getattr(ures, "data", None):
                ou = ures.data[0]
                row["owner_public_name"] = (
                    ou.get("name")
                    or ou.get("full_name")
                    or ou.get("fullName")
                )
                row["owner_public_national_id"] = (
                    ou.get("national_id") or ou.get("nationalId")
                )
        except Exception:
            logger.exception("vacate-tenant owner_public lookup failed apartment_id=%s", apt_id_int)

    _attach_building_names([row])
    return ApartmentResponse(**row)