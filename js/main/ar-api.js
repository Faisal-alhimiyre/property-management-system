/**
 * AR layout persistence — GET/PUT /api/apartments/:id/ar-layout
 * Temporarily unused on apartment pages (script not loaded). Keep for later.
 */
(function () {
  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) ||
      "http://127.0.0.1:8002"
    );
  }

  async function getForApartment(apartmentId) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/apartments/${encodeURIComponent(apartmentId)}/ar-layout`,
      { method: "GET" }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  async function saveForApartment(apartmentId, payload) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/apartments/${encodeURIComponent(apartmentId)}/ar-layout`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(t || String(res.status));
    }
    return await res.json();
  }

  window.WalajnaArApi = {
    getForApartment,
    saveForApartment,
  };
})();
