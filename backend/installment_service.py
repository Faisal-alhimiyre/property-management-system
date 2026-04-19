"""Generate payment installment rows for a contract (server-side; mirrors frontend schedule logic, simplified)."""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import Any


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def cycle_months(payment_cycle: str | int | None) -> int:
    """Months between installment due dates (1=monthly, 3=quarterly, …)."""
    if isinstance(payment_cycle, bool):
        c = str(payment_cycle).lower()
    elif isinstance(payment_cycle, (int, float)):
        c = str(int(payment_cycle))
    else:
        c = str(payment_cycle or "monthly").lower().strip()
    # Some clients send payment "mode" as 1=monthly, 4=quarterly (payments per year).
    if c in ("4", "quarterly", "quarter"):
        return 3
    if c in ("1", "monthly", "month"):
        return 1
    if c in ("semi_annual", "semi", "semi-annual", "2"):
        return 6
    if c in ("annual", "yearly", "12"):
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
    yearly_rent: Decimal | None = None,
    payment_cycle: str = "monthly",
) -> list[dict[str, Any]]:
    if end_date < start_date or monthly_rent <= 0:
        return []

    cm = cycle_months(payment_cycle)
    rows: list[dict[str, Any]] = []
    idx = 0
    current = start_date

    # end_date is exclusive (e.g. lease Mar 1 2026 → Mar 1 2027 = 12 monthly dues, last due Feb 1 2027).
    exact_rows: list[dict[str, Any]] = []

    while current < end_date:
        next_due = _add_months(current, cm)
        if next_due > end_date:
            next_due = end_date
        months_span = max(1, (next_due.year - current.year) * 12 + (next_due.month - current.month))
        exact_rows.append(
            {
                "contract_id": contract_id,
                "apartment_id": apartment_id,
                "tenant_id": tenant_id,
                "installment_index": idx,
                "due_date": current.isoformat(),
                "status": "pending",
                "months_span": months_span,
            }
        )
        idx += 1
        current = _add_months(current, cm)

    if not exact_rows:
        return []

    monthly_exact = monthly_rent
    if yearly_rent is not None and yearly_rent > 0:
        monthly_exact = yearly_rent / Decimal("12")

    exact_cents: list[Decimal] = []
    base_cents: list[int] = []
    total_exact = Decimal("0")
    for item in exact_rows:
        exact_amount = monthly_exact * Decimal(item["months_span"])
        total_exact += exact_amount
        cents = exact_amount * Decimal("100")
        down_cents = int(cents.to_integral_value(rounding=ROUND_DOWN))
        base_cents.append(down_cents)
        exact_cents.append(cents - Decimal(down_cents))

    target_total_cents = int((total_exact * Decimal("100")).to_integral_value(rounding=ROUND_HALF_UP))
    remainder = target_total_cents - sum(base_cents)
    if remainder > 0:
        order = sorted(range(len(exact_rows)), key=lambda i: (exact_cents[i], -i), reverse=True)
        for i in order[:remainder]:
            base_cents[i] += 1

    for i, item in enumerate(exact_rows):
        inst_amount = (Decimal(base_cents[i]) / Decimal("100")).quantize(Decimal("0.01"))
        rows.append(
            {
                "contract_id": item["contract_id"],
                "apartment_id": item["apartment_id"],
                "tenant_id": item["tenant_id"],
                "installment_index": item["installment_index"],
                "due_date": item["due_date"],
                "amount": float(inst_amount),
                "original_amount": float(inst_amount),
                "status": item["status"],
            }
        )

    return rows
