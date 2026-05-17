/**
 * Canonical building data: GET /api/buildings. Session cache only (no localStorage mirror).
 */
(function () {
  const SESSION_KEY = "walajna_buildings_session";

  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002"
    );
  }

  function mapApiRowToClient(row) {
    if (!row) return null;
    return {
      ...row,
      id: row.id,
      ownerId: row.ownerId ?? row.owner_id ?? null,
      owner_id: row.owner_id ?? row.ownerId ?? null,
      createdAt: row.createdAt ?? row.created_at ?? null,
      created_at: row.created_at ?? row.createdAt ?? null,
      apartmentCount: Number(row.apartmentCount ?? row.apartments_count ?? 0),
      apartments_count: Number(row.apartments_count ?? row.apartmentCount ?? 0),
      totalFloors: row.totalFloors ?? row.total_floors ?? null,
      total_floors: row.total_floors ?? row.totalFloors ?? null,
      neighborhood: row.neighborhood ?? "",
      code: row.code ?? null,
    };
  }

  function persistSessionList(list) {
    const arr = Array.isArray(list) ? list : [];
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("[buildings-api] session persist failed", e);
    }
    try {
      window.__walajnaBuildingsCache = arr;
    } catch {
      /* ignore */
    }
  }

  function getSessionList() {
    try {
      if (window.__walajnaBuildingsCache && Array.isArray(window.__walajnaBuildingsCache)) {
        return window.__walajnaBuildingsCache;
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function clearLegacyMirror() {
    try {
      localStorage.removeItem("walajna_buildings");
      localStorage.removeItem("walajna_apartments");
    } catch {
      /* ignore */
    }
  }

  async function refreshForSession() {
    clearLegacyMirror();
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      persistSessionList([]);
      return [];
    }
    if (typeof WalajnaAuth.getCurrentUser === "function" && !WalajnaAuth.getCurrentUser()) {
      persistSessionList([]);
      return [];
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/buildings`, {
        method: "GET",
      });
      if (!res.ok) {
        return getSessionList();
      }
      const rows = await res.json();
      const mapped = (Array.isArray(rows) ? rows : [])
        .map(mapApiRowToClient)
        .filter(Boolean);
      persistSessionList(mapped);
      return mapped;
    } catch (e) {
      console.warn("[buildings-api] refresh failed", e);
      return getSessionList();
    }
  }

  function removeBuildingFromSession(buildingId) {
    const idStr = String(buildingId ?? "").trim();
    if (!idStr) return;

    const removedCodes = new Set([idStr]);
    const filtered = getSessionList().filter((b) => {
      const bid = String(b.id ?? "").trim();
      const code = String(b.code ?? "").trim();
      if (bid === idStr || (code && code === idStr)) {
        if (code) removedCodes.add(code);
        return false;
      }
      return true;
    });
    persistSessionList(filtered);

    if (
      typeof WalajnaApartmentsApi === "undefined" ||
      !WalajnaApartmentsApi.getSessionList ||
      !WalajnaApartmentsApi.persistSessionList
    ) {
      return;
    }

    const apts = WalajnaApartmentsApi.getSessionList().filter((a) => {
      const bld = String(a.buildingId ?? a.building_id ?? "").trim();
      return !removedCodes.has(bld);
    });
    WalajnaApartmentsApi.persistSessionList(apts);
  }

  window.WalajnaBuildingsApi = {
    SESSION_KEY,
    mapApiRowToClient,
    getSessionList,
    persistSessionList,
    refreshForSession,
    removeBuildingFromSession,
    clearLegacyMirror,
  };
})();
