/**
 * Tenant ↔ owner requests (Supabase table maintenance_requests). No localStorage.
 */
(function () {
  const TYPE_META = {
    maintenance: { color: "#f59e0b" },
    complaint: { color: "#facc15" },
    suggestion: { color: "#3b82f6" },
    request: { color: "#22c55e" },
  };

  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
      "http://127.0.0.1:8002"
    );
  }

  async function list(apartmentId) {
    const q =
      apartmentId != null && apartmentId !== ""
        ? `?apartment_id=${encodeURIComponent(apartmentId)}`
        : "";
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/maintenance${q}`, {
      method: "GET",
    });
    if (!res.ok) return [];
    return await res.json();
  }

  async function create(payload) {
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  async function patch(requestId, body) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/maintenance/${encodeURIComponent(requestId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  async function putStatus(requestId, status) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/maintenance/${encodeURIComponent(requestId)}?status=${encodeURIComponent(status)}`,
      { method: "PUT" }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  async function markOwnerSeenBuilding(buildingId) {
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/maintenance/mark-owner-seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ building_id: Number(buildingId) }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  function mapStatusToUi(st) {
    const x = String(st || "").toLowerCase();
    if (x === "resolved") return "resolved";
    if (x === "replied") return "replied";
    return "new";
  }

  /**
   * Map DB row + display context into the shape apartment-requests UI expects.
   */
  function mapRowToUi(row, ctx) {
    const typeId = row.request_type || "maintenance";
    const meta = TYPE_META[typeId] || TYPE_META.request;
    return {
      id: String(row.id),
      serverId: row.id != null ? Number(row.id) : null,
      apartmentId: String(row.apartment_id ?? ""),
      contractId: row.contract_id ?? null,
      typeId,
      typeTitle: row.title || typeId,
      typeColor: meta.color,
      message: row.description || "",
      createdAt: row.created_at || new Date().toISOString(),
      status: mapStatusToUi(row.status),
      ownerReply: row.owner_reply || "",
      ownerSeen: !!row.owner_seen,
      tenantReplySeenAt: row.tenant_reply_seen_at || null,
      repliedAt: row.replied_at || null,
      resolvedAt: row.resolved_at || null,
      senderName: ctx?.senderName || "—",
      receiverName: ctx?.receiverName || "—",
    };
  }

  window.WalajnaTenantRequests = {
    list,
    create,
    patch,
    putStatus,
    markOwnerSeenBuilding,
    mapRowToUi,
    mapStatusToUi,
    TYPE_META,
  };
})();
