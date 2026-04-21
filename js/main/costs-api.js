/**
 * Server-backed costs: GET/POST/DELETE /api/costs (owner-only).
 */
(function () {
  let flatList = [];

  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002"
    );
  }

  function mergeApartmentSlice(apartmentId, rows) {
    const id = String(apartmentId);
    flatList = flatList.filter((c) => String(c.apartmentId) !== id);
    (Array.isArray(rows) ? rows : []).forEach((r) => flatList.push(r));
  }

  function getForApartment(apartmentId) {
    const id = String(apartmentId);
    return flatList.filter((c) => String(c.apartmentId) === id);
  }

  /**
   * @param {string|number} apartmentId - URL / UI id
   * @param {string|number} [serverApartmentId] - Supabase apartments.id when it differs
   */
  async function refreshForApartment(apartmentId, serverApartmentId) {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return [];
    }
    if (!WalajnaAuth.getCurrentUser || !WalajnaAuth.getCurrentUser()) {
      return [];
    }
    const qid =
      serverApartmentId != null && String(serverApartmentId).trim() !== ""
        ? serverApartmentId
        : apartmentId;
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/costs?apartment_id=${encodeURIComponent(String(qid))}`,
      { method: "GET" }
    );
    if (res.status === 403) {
      mergeApartmentSlice(apartmentId, []);
      return [];
    }
    if (!res.ok) {
      console.warn("[costs-api] list failed", res.status);
      return [];
    }
    let rows = [];
    try {
      rows = await res.json();
    } catch {
      return [];
    }
    const mapped = (Array.isArray(rows) ? rows : []).map((row) => mapRow(row, apartmentId));
    mergeApartmentSlice(apartmentId, mapped);
    return mapped;
  }

  function mapRow(row, apartmentIdForUi) {
    const expenseRaw = row.expense_date;
    const expenseDate =
      typeof expenseRaw === "string"
        ? expenseRaw.slice(0, 10)
        : expenseRaw && typeof expenseRaw === "object" && expenseRaw.toISOString
          ? expenseRaw.toISOString().slice(0, 10)
          : String(expenseRaw || "").slice(0, 10);
    let createdAt = "";
    if (row.created_at) {
      const c = row.created_at;
      createdAt = typeof c === "string" ? c.slice(0, 10) : new Date(c).toISOString().slice(0, 10);
    }
    return {
      id: String(row.id),
      serverId: row.id,
      apartmentId: String(apartmentIdForUi != null ? apartmentIdForUi : row.apartment_id ?? ""),
      contractId: row.contract_id != null ? String(row.contract_id) : null,
      type: row.cost_type,
      amount: Number(row.amount),
      status: row.status,
      expenseDate: expenseDate || "—",
      createdAt: createdAt || "—",
      notes: row.notes || "",
    };
  }

  async function createOnServer(payload) {
    const aid = Number(payload.apartmentId);
    let contractId = null;
    if (payload.contractId != null && payload.contractId !== "") {
      const n = Number(payload.contractId);
      if (Number.isFinite(n)) contractId = n;
    }
    const body = {
      apartment_id: aid,
      contract_id: contractId,
      cost_type: payload.type,
      amount: Number(payload.amount),
      status: payload.status,
      expense_date: payload.expenseDate,
      notes: payload.notes || null,
    };
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        if (err && err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch {
        /* ignore */
      }
      throw new Error(detail || "Failed to save cost");
    }
    return res.json();
  }

  async function deleteOnServer(serverId) {
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/costs/${encodeURIComponent(String(serverId))}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const err = await res.json();
        if (err && err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      } catch {
        /* ignore */
      }
      throw new Error(detail || "Failed to delete cost");
    }
    return res.json();
  }

  function isAvailable() {
    return (
      typeof WalajnaAuth !== "undefined" &&
      !!WalajnaAuth.fetchWithAuth &&
      !!WalajnaAuth.getCurrentUser &&
      !!WalajnaAuth.getCurrentUser()
    );
  }

  window.WalajnaCostsApi = {
    refreshForApartment,
    getForApartment,
    createOnServer,
    deleteOnServer,
    isAvailable,
  };
})();
