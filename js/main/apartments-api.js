/**
 * Canonical apartment data: GET /api/apartments. Session mirror for UI (breadcrumbs, getApartments()).
 */
(function () {
  const SESSION_KEY = "walajna_apartments_session";

  function apiBase() {
    return (
      (typeof WalajnaAuth !== "undefined" && WalajnaAuth.API_BASE) || "http://127.0.0.1:8002"
    );
  }

  function mapApiRowToClient(apt) {
    if (!apt) return null;
    const id = apt.id;
    const rawTi = apt.tenant_info;
    const tenantInfo =
      rawTi &&
      typeof rawTi === "object" &&
      !Array.isArray(rawTi) &&
      Object.keys(rawTi).some((k) => {
        const v = rawTi[k];
        return v != null && String(v).trim() !== "";
      })
        ? rawTi
        : null;

    const lt = apt.lease_terms && typeof apt.lease_terms === "object" ? apt.lease_terms : null;
    const cid = apt.current_contract_id ?? null;
    const yrForMonthly =
      lt?.yearlyRent != null && String(lt.yearlyRent).trim() !== ""
        ? Number(lt.yearlyRent)
        : NaN;
    const rentAmountFromYearly =
      Number.isFinite(yrForMonthly) && yrForMonthly > 0 ? yrForMonthly / 12 : undefined;
    const contract =
      cid || lt
        ? {
            id: cid,
            startDate:
              lt?.startDate != null ? String(lt.startDate).slice(0, 10) : undefined,
            endDate: lt?.endDate != null ? String(lt.endDate).slice(0, 10) : undefined,
            yearlyRent: lt?.yearlyRent,
            rentAmount: rentAmountFromYearly ?? lt?.monthlyRent,
            paymentCycle: lt?.paymentCycle,
            installmentsCount: lt?.installmentsCount,
            insurancePaid: lt?.insurancePaid,
            meterNumber: lt?.meterNumber,
            notes: lt?.notes,
            brokerInfo: lt?.brokerInfo,
            services: lt?.services,
          }
        : null;

    return {
      id: String(id),
      apiId: id,
      buildingId: String(apt.building_id ?? ""),
      buildingName: apt.building_name ?? apt.buildingName ?? "",
      number: String(apt.apartment_number ?? ""),
      floorNumber: Number(apt.floor_number ?? 0),
      bedrooms: apt.bedrooms != null ? Number(apt.bedrooms) : null,
      bathrooms: apt.bathrooms != null ? Number(apt.bathrooms) : null,
      livingRooms: apt.living_rooms != null ? Number(apt.living_rooms) : null,
      leaseStatus: apt.lease_status || "vacant",
      rent: apt.rent,
      tenantUserId: apt.tenant_user_id ?? null,
      tenantNationalId: apt.tenant_national_id ?? null,
      tenantInfo,
      currentContractId: cid,
      contractId: cid,
      contract,
      leaseTerms: lt,
      maintenanceId: apt.maintenance_id ?? null,
      ownerPublicName: apt.owner_public_name ?? apt.ownerPublicName ?? null,
      owner_public_name: apt.owner_public_name ?? null,
      ownerPublicNationalId: apt.owner_public_national_id ?? apt.ownerPublicNationalId ?? null,
      owner_public_national_id: apt.owner_public_national_id ?? null,
    };
  }

  function persistSessionList(list) {
    const arr = Array.isArray(list) ? list : [];
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("[apartments-api] session persist failed", e);
    }
    try {
      window.__walajnaApartmentsCache = arr;
    } catch (e) {
      /* ignore */
    }
  }

  function getSessionList() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Merge or replace one apartment in the session list by id. */
  function mergeIntoSession(apartment) {
    if (!apartment || apartment.id == null) return;
    const cur = getSessionList();
    const id = String(apartment.id);
    const idx = cur.findIndex((a) => String(a.id) === id);
    const next =
      idx >= 0
        ? cur.map((a, i) => (i === idx ? { ...a, ...apartment } : a))
        : [...cur, apartment];
    persistSessionList(next);
  }

  /** Upsert many rows by id (e.g. after editing units on owner-building). */
  function mergeSessionApartments(partial) {
    const map = new Map(getSessionList().map((a) => [String(a.id), a]));
    (Array.isArray(partial) ? partial : []).forEach((a) => {
      if (a && a.id != null) map.set(String(a.id), a);
    });
    persistSessionList(Array.from(map.values()));
  }

  function removeFromSession(aptId) {
    const id = String(aptId ?? "");
    persistSessionList(getSessionList().filter((a) => String(a.id) !== id));
  }

  async function listAll() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) return [];
    const res = await WalajnaAuth.fetchWithAuth(`${apiBase()}/api/apartments`, { method: "GET" });
    if (!res.ok) return [];
    const rows = await res.json();
    const mapped = (Array.isArray(rows) ? rows : [])
      .map(mapApiRowToClient)
      .filter(Boolean);
    persistSessionList(mapped);
    return mapped;
  }

  /**
   * Owner: apartments in one building only (smaller payload). Merges into session so other
   * buildings cached in walajna_apartments_session are not wiped.
   */
  async function listForBuilding(buildingId) {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) return [];
    const bid = String(buildingId ?? "").trim();
    if (!bid) return listAll();
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/apartments?building_id=${encodeURIComponent(bid)}`,
      { method: "GET" }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    const mapped = (Array.isArray(rows) ? rows : [])
      .map(mapApiRowToClient)
      .filter(Boolean);
    mergeSessionApartments(mapped);
    return mapped;
  }

  async function listAsTenant() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) return [];
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/apartments?view=as_tenant`,
      { method: "GET" }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    const mapped = (Array.isArray(rows) ? rows : [])
      .map(mapApiRowToClient)
      .filter(Boolean);
    persistSessionList(mapped);
    return mapped;
  }

  async function refreshForSession() {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.getCurrentUser) return [];
    const user = WalajnaAuth.getCurrentUser();
    if (!user) return [];
    const role = String(user.role || "").toLowerCase();
    if (role === "tenant") return listAsTenant();
    return listAll();
  }

  /** Owner-only: clear tenant on server; keeps contract row for history. Updates session mirror. */
  async function vacateTenant(apartmentId) {
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      throw new Error("Auth not available");
    }
    const id = Number(apartmentId);
    if (!Number.isFinite(id)) {
      throw new Error("Invalid apartment id");
    }
    const res = await WalajnaAuth.fetchWithAuth(
      `${apiBase()}/api/apartments/${id}/vacate-tenant`,
      { method: "PATCH" }
    );
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.detail || msg;
      } catch {
        /* ignore */
      }
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    const row = await res.json();
    mergeIntoSession(mapApiRowToClient(row));
    return row;
  }

  window.WalajnaApartmentsApi = {
    SESSION_KEY,
    mapApiRowToClient,
    persistSessionList,
    getSessionList,
    mergeIntoSession,
    mergeSessionApartments,
    removeFromSession,
    listAll,
    listForBuilding,
    listAsTenant,
    refreshForSession,
    vacateTenant,
  };
})();
