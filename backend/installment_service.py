"""Generate payment installment rows for a contract (server-side; mirrors frontend schedule logic, simplified)."""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def cycle_months(payment_cycle: str) -> int:
    c = (payment_cycle or "monthly").lower()
    if c in ("quarterly", "quarter"):
        return 3
    if c in ("semi_annual", "semi", "semi-annual"):
        return 6
    if c in ("annual", "yearly"):
        return 12
    return 1


def generate_installment_rows(
    *,
    contract_id: int,
    apartment_id: int | None,
    tenant_id: int | None,
    start_date: date,
    end_date: date,
    monthly_rent: Decimal,
    payment_cycle: str = "monthly",
) -> list[dict[str, Any]]:
    if end_date < start_date or monthly_rent <= 0:
        return []

    cm = cycle_months(payment_cycle)
    rows: list[dict[str, Any]] = []
    idx = 0
    current = start_date

    while current <= end_date:
        inst_amount = monthly_rent * Decimal(cm)
        rows.append(
            {
                "contract_id": contract_id,
                "apartment_id": apartment_id,
                "tenant_id": tenant_id,
                "installment_index": idx,
                "due_date": current.isoformat(),
                "amount": float(inst_amount),
                "original_amount": float(inst_amount),
                "status": "pending",
            }
        )
        idx += 1
        current = _add_months(current, cm)

    return rows
