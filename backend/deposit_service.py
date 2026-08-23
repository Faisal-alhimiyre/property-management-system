"""Security deposit ledger helpers (remaining balance, seed received, deductions)."""
from __future__ import annotations

import logging
from typing import Any

from config import supabase

logger = logging.getLogger(__name__)

DEPOSIT_TYPES = frozenset(
    {"received", "deduction", "replenishment", "refund", "adjustment"}
)


def _signed_amount(tx_type: str, amount: float) -> float:
    t = str(tx_type or "").lower()
    a = float(amount or 0)
    if t in ("received", "replenishment"):
        return abs(a)
    if t in ("deduction", "refund"):
        return -abs(a)
    # adjustment: respect sign
    return a


def remaining_deposit_for_contract(contract_id: int) -> float:
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("type, amount")
            .eq("contract_id", int(contract_id))
            .execute()
        )
    except Exception:
        logger.exception("deposit remaining lookup failed contract_id=%s", contract_id)
        return 0.0
    total = 0.0
    for row in getattr(res, "data", None) or []:
        total += _signed_amount(row.get("type"), row.get("amount"))
    return round(total, 2)


def original_deposit_for_contract(contract_id: int, insurance_paid=None) -> float:
    """Prefer contracts.insurance_paid; else sum of received ledger rows."""
    try:
        if insurance_paid is None:
            cres = (
                supabase.table("contracts")
                .select("insurance_paid")
                .eq("id", int(contract_id))
                .limit(1)
                .execute()
            )
            rows = getattr(cres, "data", None) or []
            if rows:
                insurance_paid = rows[0].get("insurance_paid")
        if insurance_paid is not None and str(insurance_paid).strip() != "":
            return round(float(insurance_paid), 2)
    except Exception:
        logger.exception("original deposit from insurance_paid failed contract_id=%s", contract_id)
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("amount")
            .eq("contract_id", int(contract_id))
            .eq("type", "received")
            .execute()
        )
        total = sum(float(r.get("amount") or 0) for r in (getattr(res, "data", None) or []))
        return round(total, 2)
    except Exception:
        logger.exception("original deposit from received txs failed contract_id=%s", contract_id)
        return 0.0


def deposit_summary_for_contract(contract_id: int, insurance_paid=None) -> dict[str, Any]:
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("type, amount")
            .eq("contract_id", int(contract_id))
            .execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception:
        logger.exception("deposit summary failed contract_id=%s", contract_id)
        rows = []

    used = 0.0
    replenished = 0.0
    refunded = 0.0
    received = 0.0
    for row in rows:
        t = str(row.get("type") or "").lower()
        a = abs(float(row.get("amount") or 0))
        if t == "received":
            received += a
        elif t == "deduction":
            used += a
        elif t == "replenishment":
            replenished += a
        elif t == "refund":
            refunded += a

    original = original_deposit_for_contract(contract_id, insurance_paid)
    if original <= 0 and received > 0:
        original = round(received, 2)
    remaining = remaining_deposit_for_contract(contract_id)
    return {
        "contract_id": int(contract_id),
        "original": original,
        "received": round(received, 2),
        "used": round(used, 2),
        "replenished": round(replenished, 2),
        "refunded": round(refunded, 2),
        "remaining": remaining,
        "is_settled": remaining <= 0.009,
    }


def ensure_received_seed(contract_id: int, apartment_id: int, amount) -> None:
    """Insert a received row when insurance_paid is set and no received exists yet."""
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return
    if amt <= 0:
        return
    try:
        existing = (
            supabase.table("security_deposit_transactions")
            .select("id")
            .eq("contract_id", int(contract_id))
            .eq("type", "received")
            .limit(1)
            .execute()
        )
        if getattr(existing, "data", None):
            return
        supabase.table("security_deposit_transactions").insert(
            {
                "contract_id": int(contract_id),
                "apartment_id": int(apartment_id),
                "type": "received",
                "amount": amt,
                "notes": "Received security deposit",
            }
        ).execute()
    except Exception:
        logger.exception(
            "ensure_received_seed failed contract_id=%s apartment_id=%s",
            contract_id,
            apartment_id,
        )


def insert_deposit_transaction(
    *,
    contract_id: int,
    apartment_id: int,
    tx_type: str,
    amount: float,
    cost_id: int | None = None,
    notes: str | None = None,
) -> dict:
    t = str(tx_type or "").strip().lower()
    if t not in DEPOSIT_TYPES:
        raise ValueError(f"Invalid deposit transaction type: {tx_type}")
    amt = float(amount)
    if t != "adjustment" and amt <= 0:
        raise ValueError("amount must be > 0")
    if t == "deduction":
        bal = remaining_deposit_for_contract(contract_id)
        if amt > bal + 0.009:
            raise ValueError(
                f"Insufficient security deposit balance ({bal}) for deduction ({amt})"
            )
    if t == "refund":
        bal = remaining_deposit_for_contract(contract_id)
        if amt > bal + 0.009:
            raise ValueError(
                f"Refund ({amt}) exceeds available insurance balance ({bal})"
            )
    payload: dict[str, Any] = {
        "contract_id": int(contract_id),
        "apartment_id": int(apartment_id),
        "type": t,
        "amount": abs(amt) if t != "adjustment" else amt,
        "notes": (notes or "").strip() or None,
    }
    if cost_id is not None:
        payload["cost_id"] = int(cost_id)
    res = supabase.table("security_deposit_transactions").insert(payload).execute()
    data = getattr(res, "data", None) or []
    if not data:
        raise RuntimeError("deposit transaction insert returned empty")
    return data[0]


def sum_held_deposits_for_apartments(apartment_ids: list[int]) -> float:
    """Sum remaining > 0 across all contracts that have ledger activity for these apartments."""
    if not apartment_ids:
        return 0.0
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("contract_id, type, amount")
            .in_("apartment_id", [int(a) for a in apartment_ids])
            .execute()
        )
    except Exception:
        logger.exception("sum_held_deposits_for_apartments failed")
        return 0.0
    by_c: dict[int, float] = {}
    for row in getattr(res, "data", None) or []:
        try:
            cid = int(row["contract_id"])
        except (TypeError, ValueError, KeyError):
            continue
        by_c[cid] = by_c.get(cid, 0.0) + _signed_amount(row.get("type"), row.get("amount"))
    return round(sum(v for v in by_c.values() if v > 0.009), 2)


def deposit_covered_for_cost_ids(cost_ids: list[int]) -> float:
    """Only amounts with a successful deduction transaction linked to the cost."""
    if not cost_ids:
        return 0.0
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("amount, cost_id")
            .eq("type", "deduction")
            .in_("cost_id", [int(c) for c in cost_ids])
            .execute()
        )
    except Exception:
        logger.exception("deposit_covered_for_cost_ids failed")
        return 0.0
    total = 0.0
    for row in getattr(res, "data", None) or []:
        total += abs(float(row.get("amount") or 0))
    return round(total, 2)


def transfer_remaining_deposit(
    *,
    from_contract_id: int,
    to_contract_id: int,
    apartment_id: int,
) -> float:
    """Move unsettled remaining from one contract ledger to another (amend/renew)."""
    rem = remaining_deposit_for_contract(int(from_contract_id))
    if rem <= 0.009:
        return 0.0
    insert_deposit_transaction(
        contract_id=int(from_contract_id),
        apartment_id=int(apartment_id),
        tx_type="refund",
        amount=rem,
        notes=f"Transferred to contract {to_contract_id}",
    )
    insert_deposit_transaction(
        contract_id=int(to_contract_id),
        apartment_id=int(apartment_id),
        tx_type="received",
        amount=rem,
        notes=f"Transferred from contract {from_contract_id}",
    )
    return rem


def ledger_totals_for_apartments(
    apartment_ids: list[int],
    *,
    as_of: str | None = None,
) -> dict[str, Any]:
    """
    Current building insurance summary (as of optional date).

    Only UNSETTLED contracts (remaining > 0) contribute to original / used / held / refunded.
    Settled historical contracts stay in the ledger but are excluded from these totals.

    unsettled = remaining of ENDED contracts that still have balance > 0.
    held includes both current-contract remaining and ended-contract unsettled remaining.
    Do not add held + unsettled.
    """
    empty = {
        "original": 0.0,
        "used": 0.0,
        "replenished": 0.0,
        "refunded": 0.0,
        "held": 0.0,
        "unsettled": 0.0,
        "by_contract": {},
        "unsettled_items": [],
        "scope": "unsettled_current",
    }
    if not apartment_ids:
        return empty
    try:
        res = (
            supabase.table("security_deposit_transactions")
            .select("contract_id, type, amount, created_at")
            .in_("apartment_id", [int(a) for a in apartment_ids])
            .execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception:
        logger.exception("ledger_totals_for_apartments failed")
        rows = []

    as_of_end = None
    if as_of:
        try:
            as_of_end = f"{str(as_of).strip()[:10]}T23:59:59.999999"
        except Exception:
            as_of_end = None

    by_c: dict[int, float] = {}
    received_by_c: dict[int, float] = {}
    used_by_c: dict[int, float] = {}
    refunded_by_c: dict[int, float] = {}
    replenished_by_c: dict[int, float] = {}

    for row in rows:
        if as_of_end:
            created = str(row.get("created_at") or "")
            if created and created[:19] > as_of_end[:19]:
                continue
        t = str(row.get("type") or "").lower()
        a = abs(float(row.get("amount") or 0))
        try:
            cid = int(row["contract_id"])
        except (TypeError, ValueError, KeyError):
            continue
        by_c[cid] = by_c.get(cid, 0.0) + _signed_amount(row.get("type"), row.get("amount"))
        if t == "received":
            received_by_c[cid] = received_by_c.get(cid, 0.0) + a
        elif t == "deduction":
            used_by_c[cid] = used_by_c.get(cid, 0.0) + a
        elif t == "replenishment":
            replenished_by_c[cid] = replenished_by_c.get(cid, 0.0) + a
        elif t == "refund":
            refunded_by_c[cid] = refunded_by_c.get(cid, 0.0) + a

    remaining_open = {cid: rem for cid, rem in by_c.items() if rem > 0.009}
    if not remaining_open:
        return {
            **empty,
            "as_of": str(as_of).strip()[:10] if as_of else None,
        }

    open_ids = list(remaining_open.keys())
    insurance_paid_map: dict[int, float] = {}
    status_map: dict[int, str] = {}
    contract_apt: dict[int, int] = {}
    try:
        cres = (
            supabase.table("contracts")
            .select("id, apartment_id, status, insurance_paid")
            .in_("id", open_ids)
            .execute()
        )
        for crow in getattr(cres, "data", None) or []:
            try:
                cid = int(crow["id"])
            except (TypeError, ValueError, KeyError):
                continue
            status_map[cid] = str(crow.get("status") or "").lower()
            try:
                if crow.get("apartment_id") is not None:
                    contract_apt[cid] = int(crow["apartment_id"])
            except (TypeError, ValueError):
                pass
            raw = crow.get("insurance_paid")
            if raw is None or str(raw).strip() == "":
                continue
            try:
                insurance_paid_map[cid] = float(raw)
            except (TypeError, ValueError):
                continue
    except Exception:
        logger.exception("ledger_totals: contracts lookup failed")

    current_contract_ids: set[int] = set()
    apt_meta: dict[int, dict[str, Any]] = {}
    try:
        ares = (
            supabase.table("apartments")
            .select("id, apartment_number, current_contract_id")
            .in_("id", [int(a) for a in apartment_ids])
            .execute()
        )
        for arow in getattr(ares, "data", None) or []:
            try:
                aid = int(arow["id"])
            except (TypeError, ValueError, KeyError):
                continue
            apt_meta[aid] = {
                "apartment_number": arow.get("apartment_number"),
            }
            ccid = arow.get("current_contract_id")
            if ccid is None or str(ccid).strip() == "":
                continue
            try:
                current_contract_ids.add(int(ccid))
            except (TypeError, ValueError):
                continue
    except Exception:
        logger.exception("ledger_totals: apartments lookup failed")

    original = 0.0
    used = 0.0
    held = 0.0
    refunded = 0.0
    replenished = 0.0
    unsettled = 0.0
    unsettled_items: list[dict[str, Any]] = []

    for cid, rem in remaining_open.items():
        held += rem
        used += used_by_c.get(cid, 0.0)
        refunded += refunded_by_c.get(cid, 0.0)
        replenished += replenished_by_c.get(cid, 0.0)
        orig = insurance_paid_map.get(cid)
        if orig is None or orig <= 0:
            orig = received_by_c.get(cid, 0.0)
        original += max(0.0, float(orig or 0))

        is_current = cid in current_contract_ids
        if not is_current:
            rem_r = round(max(0.0, rem), 2)
            unsettled += rem_r
            aid = contract_apt.get(cid)
            meta = apt_meta.get(aid or -1) or {}
            unsettled_items.append(
                {
                    "contract_id": cid,
                    "apartment_id": aid,
                    "apartment_number": meta.get("apartment_number"),
                    "remaining": rem_r,
                }
            )

    by_contract = {
        str(cid): round(max(0.0, rem), 2) for cid, rem in remaining_open.items()
    }
    return {
        "original": round(original, 2),
        "used": round(used, 2),
        "replenished": round(replenished, 2),
        "refunded": round(refunded, 2),
        "held": round(held, 2),
        "unsettled": round(unsettled, 2),
        "by_contract": by_contract,
        "unsettled_items": unsettled_items,
        "scope": "unsettled_current",
        "as_of": str(as_of).strip()[:10] if as_of else None,
    }
