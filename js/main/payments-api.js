/**
 * Aggregates `payment_installments` across the user's contracts (`GET /api/contracts`
 * + per-contract installments). Used by owner-building / finance-summary fallbacks.
 */
(function () {
  function mapInstallmentRowToUi(row, idx) {
    const dueDate = (row.due_date || row.dueDate || "").toString().slice(0, 10);
    const amt = Number(row.amount ?? 0);
    const pm =
      row.period_months != null && row.period_months !== ""
        ? Number(row.period_months)
        : null;
    return {
      id: String(row.id != null ? row.id : `inst_${idx}_${Date.now()}`),
      tenantId: row.tenant_id != null ? String(row.tenant_id) : "",
      apartmentId: row.apartment_id != null ? String(row.apartment_id) : "",
      contractId: row.contract_id != null ? String(row.contract_id) : "",
      amount: amt,
      dueDate,
      status: String(row.status || "pending").toLowerCase(),
      monthlyRentAmount: amt,
      paymentCycle: "monthly",
      period_months: Number.isFinite(pm) ? pm : undefined,
    };
  }

  async function listMapped() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return [];
    }
    const base =
      (typeof WalajnaAuth.API_BASE === "string" && WalajnaAuth.API_BASE) ||
      "http://127.0.0.1:8002";

    const cRes = await WalajnaAuth.fetchWithAuth(`${base}/api/contracts`, {
      method: "GET",
    });
    if (!cRes.ok) return [];

    let contracts = [];
    try {
      const data = await cRes.json();
      contracts = Array.isArray(data) ? data : [];
    } catch {
      return [];
    }

    const out = [];
    let idx = 0;
    for (const c of contracts) {
      const cid = c.id;
      if (cid == null) continue;
      const iRes = await WalajnaAuth.fetchWithAuth(
        `${base}/api/contracts/${encodeURIComponent(String(cid))}/installments`,
        { method: "GET" }
      );
      if (!iRes.ok) continue;
      let rows = [];
      try {
        rows = await iRes.json();
      } catch {
        continue;
      }
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        out.push(mapInstallmentRowToUi(r, idx++));
      }
    }
    return out;
  }

  window.WalajnaPaymentsApi = {
    listMapped,
    mapPaymentRowToUi: mapInstallmentRowToUi,
  };
})();
