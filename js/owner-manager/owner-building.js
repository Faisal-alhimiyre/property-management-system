document.addEventListener("DOMContentLoaded", async () => {
  if (typeof WalajnaNumericInput !== "undefined" && WalajnaNumericInput.initLinkTenantForm) {
    WalajnaNumericInput.initLinkTenantForm(document);
  }
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  const TAr = (k, p) =>
    window.walajna_language && window.walajna_language.tAr
      ? window.walajna_language.tAr(k, p)
      : T(k, p);

  const title = document.getElementById("buildingTitle");
  const grid = document.getElementById("apartmentsGrid");
  const financeBtn = document.getElementById("financeSummaryBtn");

  if (!grid) return;

  function setOwnerBuildingLoading(isLoading) {
    document.body.classList.toggle("owner-building--loading", !!isLoading);
    const loadingEl = document.getElementById("ownerBuildingLoading");
    if (loadingEl) {
      loadingEl.hidden = !isLoading;
      if (!isLoading) loadingEl.remove();
    }
    grid.setAttribute("aria-busy", isLoading ? "true" : "false");
    const financeSummary = document.querySelector(".building-finance-summary");
    if (financeSummary) {
      financeSummary.setAttribute("aria-busy", isLoading ? "true" : "false");
    }
    document
      .querySelectorAll(
        "#buildingIncome, #buildingCosts, #buildingProfit, #buildingOccupiedUnits, #buildingLateUnits"
      )
      .forEach((el) => {
        if (isLoading) {
          el.classList.add("is-pending");
          el.textContent = "—";
        } else {
          el.classList.remove("is-pending");
        }
      });
  }

  setOwnerBuildingLoading(true);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function populateLinkTenantTypeSelect() {
    const sel = document.getElementById("linkTenantType");
    if (!sel) return;
    const previous = sel.value;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = T("apt.link.pick");
    sel.appendChild(o0);
    const indAr = TAr("lease.tenantIndividuals");
    const famAr = TAr("lease.tenantFamilies");
    const o1 = document.createElement("option");
    o1.value = indAr;
    o1.textContent = T("lease.tenantIndividuals");
    sel.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = famAr;
    o2.textContent = T("lease.tenantFamilies");
    sel.appendChild(o2);
    if (previous && [...sel.options].some((o) => o.value === previous)) {
      sel.value = previous;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const buildingId = params.get("buildingId");

  if (!buildingId) {
    setOwnerBuildingLoading(false);
    if (title) title.textContent = T("building.notFound");
    return;
  }

  let building = null;
  let apartments = [];
  let maintenanceRows = [];
  let apartmentsFromApi = false;

  let payments = [];
  let apiLoadError = null;
  let costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  function mapApiApartmentToLocal(apt) {
    if (!apt) return null;
    const id = apt.id ?? apt.apiId;
    if (id == null) return null;
    const br = apt.bedrooms ?? apt.Bedrooms;
    const ba = apt.bathrooms ?? apt.Bathrooms;
    const lv = apt.living_rooms ?? apt.livingRooms;
    const toNumOrNull = (v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      id: String(id),
      apiId: apt.apiId ?? apt.id,
      buildingId: String(apt.building_id ?? apt.buildingId ?? ""),
      number: String(apt.apartment_number ?? apt.apartmentNumber ?? ""),
      floorNumber: Number(apt.floor_number ?? apt.floorNumber ?? 0),
      bedrooms: toNumOrNull(br),
      bathrooms: toNumOrNull(ba),
      livingRooms: toNumOrNull(lv),
      leaseStatus: apt.lease_status || "vacant",
      rent: apt.rent,
      tenantUserId: apt.tenant_user_id ?? null,
      tenantNationalId: apt.tenant_national_id ?? null,
      tenantInfo: apt.tenant_info || null,
      currentContractId: apt.current_contract_id ?? null,
      contractId: apt.current_contract_id ?? null,
      contract: apt.current_contract_id ? { id: apt.current_contract_id } : null,
      maintenanceId: apt.maintenance_id ?? null,
      openRequests: Array.isArray(apt.open_requests)
        ? apt.open_requests
        : Array.isArray(apt.openRequests)
          ? apt.openRequests
          : [],
    };
  }

  function maintenanceRowsFromApartmentOpenRequests(apartmentRows) {
    const out = [];
    for (const apt of apartmentRows || []) {
      const aid = apt.apiId ?? apt.id;
      if (aid == null) continue;
      for (const row of apt.openRequests || apt.open_requests || []) {
        if (!row || row.id == null) continue;
        out.push({
          id: row.id,
          apartment_id: aid,
          request_type: row.request_type || row.requestType || "maintenance",
          status: row.status || "open",
          owner_seen: row.owner_seen ?? row.ownerSeen ?? false,
        });
      }
    }
    return out;
  }

  function mergeMaintenanceRows(primary, secondary) {
    const byId = new Map();
    for (const row of [...(secondary || []), ...(primary || [])]) {
      if (!row || row.id == null) continue;
      byId.set(String(row.id), row);
    }
    return Array.from(byId.values());
  }

  function apartmentsHintOpenRequests(apartmentRows) {
    return (apartmentRows || []).some((apt) => {
      const open = apt.openRequests || apt.open_requests || [];
      if (Array.isArray(open) && open.length) return true;
      return apt.maintenanceId != null || apt.maintenance_id != null;
    });
  }

  async function fetchBuildingMaintenanceRows(bid) {
    const url = `${WalajnaAuth.API_BASE}/api/maintenance?building_id=${encodeURIComponent(bid)}`;
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const result = await WalajnaAuth.fetchJsonWithAuthRetry(url, { method: "GET" }, {
        retries: 4,
        delayMs: 350,
      });
      return result.ok && Array.isArray(result.data) ? result.data : [];
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(url, { method: "GET" });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function mapFetchedApartmentRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map((row) =>
        typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mapApiRowToClient
          ? WalajnaApartmentsApi.mapApiRowToClient(row)
          : mapApiApartmentToLocal(row)
      )
      .filter(Boolean);
  }

  async function fetchApartmentsForBuildingPage(bid) {
    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.listForBuilding) {
      return WalajnaApartmentsApi.listForBuilding(bid);
    }
    const url = `${WalajnaAuth.API_BASE}/api/apartments?building_id=${encodeURIComponent(bid)}`;
    if (WalajnaAuth.fetchJsonWithAuthRetry) {
      const result = await WalajnaAuth.fetchJsonWithAuthRetry(url, { method: "GET" }, {
        retries: 3,
        delayMs: 350,
      });
      if (!result.ok || !Array.isArray(result.data)) return [];
      const mappedAll = mapFetchedApartmentRows(result.data);
      if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mergeSessionApartments) {
        WalajnaApartmentsApi.mergeSessionApartments(mappedAll);
      }
      return mappedAll;
    }
    const aRes = await WalajnaAuth.fetchWithAuth(url, { method: "GET" });
    if (!aRes.ok) return [];
    const all = await aRes.json();
    const mappedAll = mapFetchedApartmentRows(all);
    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mergeSessionApartments) {
      WalajnaApartmentsApi.mergeSessionApartments(mappedAll);
    }
    return mappedAll;
  }

  function applyMaintenanceRowsFromApartments() {
    maintenanceRows = mergeMaintenanceRows(
      maintenanceRows,
      maintenanceRowsFromApartmentOpenRequests(apartments)
    );
  }

  const hadCachedUser =
    typeof WalajnaAuth !== "undefined" && !!WalajnaAuth.getCurrentUser?.();
  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (hadCachedUser && typeof WalajnaAuth !== "undefined" && WalajnaAuth.ensureSessionValid) {
    await WalajnaAuth.ensureSessionValid();
  }
  if (typeof requireAuth === "function") requireAuth();
  if (typeof requireRole === "function") requireRole("owner");

  function expectedSlotsFromBuilding(b) {
    if (!b) return 0;
    return Number(b.apartments_count ?? b.apartmentCount ?? 0);
  }

  function pickBuildingRowFromApiList(rows, urlBuildingId) {
    if (!Array.isArray(rows) || urlBuildingId == null || String(urlBuildingId).trim() === "") {
      return null;
    }
    const p = String(urlBuildingId).trim();
    return (
      rows.find((b) => String(b.id) === p) ||
      rows.find((b) => String(b.code ?? "").trim() === p) ||
      null
    );
  }

  function apartmentRowMatchesBuildingRef(a, urlParam, bld) {
    const ab = String(a.buildingId ?? "");
    const urlP = String(urlParam ?? "");
    if (!bld) return ab === urlP;
    const pk = String(bld.id ?? "");
    const bc = bld.code != null ? String(bld.code).trim() : "";
    return ab === urlP || ab === pk || (!!bc && ab === bc);
  }

  /** Numeric / canonical id for /api/buildings/:id/... (not the display code). */
  function pathBuildingIdForApi(bld, urlParam) {
    if (bld && bld.id != null && String(bld.id).trim() !== "") return bld.id;
    return urlParam;
  }

  try {
    const [bRes, mappedSlice] = await Promise.all([
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/buildings`, { method: "GET" }),
      fetchApartmentsForBuildingPage(buildingId),
    ]);

    let serverBuildingsList = [];

    if (bRes.ok) {
      serverBuildingsList = await bRes.json();
      const raw = pickBuildingRowFromApiList(serverBuildingsList, buildingId);
      if (raw) {
        building = {
          ...raw,
          apartmentCount: raw.apartmentCount ?? raw.apartments_count ?? 0,
          totalFloors: raw.totalFloors ?? raw.total_floors ?? null,
        };
      }
    }

    if (Array.isArray(mappedSlice)) {
      apartments = mappedSlice.filter((a) => apartmentRowMatchesBuildingRef(a, buildingId, building));
      apartmentsFromApi = true;
    }

    maintenanceRows = maintenanceRowsFromApartmentOpenRequests(apartments);
    const maintenanceFromApi = await fetchBuildingMaintenanceRows(buildingId);
    maintenanceRows = mergeMaintenanceRows(maintenanceFromApi, maintenanceRows);
    if (!maintenanceFromApi.length && apartmentsHintOpenRequests(apartments)) {
      await new Promise((r) => setTimeout(r, 600));
      maintenanceRows = mergeMaintenanceRows(
        await fetchBuildingMaintenanceRows(buildingId),
        maintenanceRows
      );
    }

    const expectedUnits = expectedSlotsFromBuilding(building);
    const seedPathId = pathBuildingIdForApi(building, buildingId);
    if (apartments.length === 0 && building && expectedUnits > 0) {
      await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(seedPathId)}/seed-apartments`,
        { method: "POST" }
      );
      const again = await fetchApartmentsForBuildingPage(buildingId);
      apartments = again.filter((a) => apartmentRowMatchesBuildingRef(a, buildingId, building));
      applyMaintenanceRowsFromApartments();
      maintenanceRows = mergeMaintenanceRows(
        await fetchBuildingMaintenanceRows(buildingId),
        maintenanceRows
      );
      apartmentsFromApi = true;
    }
  } catch (e) {
    apiLoadError = e;
    apartmentsFromApi = false;
    building = null;
    apartments = [];
    maintenanceRows = [];
    console.warn("owner-building API load failed (no local fallback)", e);
  }

  const apiPathBuildingId = pathBuildingIdForApi(building, buildingId);

  if (building && title) {
    title.textContent = building.name;
  } else if (title) {
    title.textContent = T("building.notFound");
  }

  // Avoid WalajnaPaymentsApi.listMapped() (N HTTP calls per contract). API path uses
  // GET /api/buildings/:id/installments via loadInstallmentsForBuildingSummary().
  if (
    !apartmentsFromApi &&
    typeof WalajnaPaymentsApi !== "undefined" &&
    WalajnaPaymentsApi.listMapped
  ) {
    void (async () => {
      try {
        payments = await WalajnaPaymentsApi.listMapped();
        if (typeof refreshAll === "function") {
          refreshAll();
        }
      } catch (e) {
        console.warn("owner-building: payments API failed", e);
      }
    })();
  }

  function openFinanceSummary() {
    if (!buildingId) return;
    window.location.href = `finance_summary.html?buildingId=${encodeURIComponent(String(apiPathBuildingId))}`;
  }

  if (financeBtn) {
    financeBtn.addEventListener("click", openFinanceSummary);
  }

  /** Building details+ wizard: per-floor apartment counts → room mix per unit (POST /api/buildings/:id/unit-layout). */


  /**
   * Same building can have apartments linked twice: numeric DB id and legacy `code`.
   * That doubles the list; keep one row per physical unit (floor + number).
   */
  function dedupeApartmentsByUnit(apartmentList, canonicalBuildingId) {
    const canonical = canonicalBuildingId != null ? String(canonicalBuildingId) : "";
    const byKey = new Map();

    const score = (apt) => {
      let s = 0;
      const idStr = String(apt.id ?? "");
      if (apt.apiId != null || /^\d+$/.test(idStr)) s += 5;
      if (canonical && String(apt.buildingId ?? "") === canonical) s += 3;
      if (apt.tenantUserId || apt.tenantNationalId) s += 2;
      if (apt.currentContractId || apt.contract?.id) s += 1;
      return s;
    };

    for (const apt of apartmentList) {
      const num = String(apt.number ?? apt.apartment_number ?? "").trim();
      const floor = String(apt.floorNumber ?? apt.floor_number ?? "").trim() || "0";
      const key = num ? `${floor}::${num}` : `id:${String(apt.id ?? apt.apiId ?? "")}`;
      if (!num && !apt.id && apt.apiId == null) continue;

      const prev = byKey.get(key);
      if (!prev || score(apt) > score(prev)) {
        byKey.set(key, apt);
      }
    }
    return Array.from(byKey.values());
  }

  function getBuildingApartments() {
    const filtered = apartments.filter((a) =>
      apartmentRowMatchesBuildingRef(a, buildingId, building)
    );
    const canonical =
      building?.id != null && String(building.id).trim() !== ""
        ? String(building.id)
        : String(buildingId);
    return dedupeApartmentsByUnit(filtered, canonical);
  }

  function buildGeneratedApartment(apartmentNumber, floorNumber) {
    const canonBid =
      building?.id != null && String(building.id).trim() !== ""
        ? String(building.id)
        : String(buildingId);
    return {
      id: `${canonBid}-A${apartmentNumber}`,
      buildingId: canonBid,
      buildingName: building?.name || "",
      number: String(apartmentNumber),
      floorNumber: Number(floorNumber) || 1,
      leaseStatus: "vacant",
      status: TAr("finance.vacant"),
      rent: "",
      tenantUserId: null,
      tenantNationalId: null,
      tenantInfo: null,
      contract: null,
      tenantHistory: [],
      createdAt: new Date().toISOString(),
    };
  }

  function ensureApartmentsExist() {
    let current = getBuildingApartments();
    if (current.length > 0) return current;

    const apartmentCount = Number(building?.apartmentCount ?? building?.apartments_count ?? 0);
    const totalFloors = Number(building?.totalFloors ?? building?.total_floors ?? 0);
    if (!apartmentCount || !totalFloors) return current;

    const apartmentsPerFloor = Math.ceil(apartmentCount / totalFloors);
    const generated = [];
    let currentApartment = 1;

    for (let floor = 1; floor <= totalFloors; floor++) {
      for (let unit = 1; unit <= apartmentsPerFloor; unit++) {
        if (currentApartment > apartmentCount) break;
        generated.push(buildGeneratedApartment(currentApartment, floor));
        currentApartment += 1;
      }
    }

    if (generated.length) {
      apartments = [...apartments, ...generated];
      current = getBuildingApartments();
    }

    return current;
  }

  ensureApartmentsExist();

  function isCurrentBuildingUnitLayoutComplete() {
    if (!building) return true;
    if (typeof WalajnaApartmentsApi === "undefined" || !WalajnaApartmentsApi.isBuildingUnitLayoutComplete) {
      return true;
    }
    return WalajnaApartmentsApi.isBuildingUnitLayoutComplete(building, getBuildingApartments());
  }

  /** Floor count for empty floor rows before the owner finishes «Building details+». */
  function resolveSkeletonFloorCount() {
    const fromBuilding = Number(building?.totalFloors ?? building?.total_floors ?? 0);
    if (fromBuilding >= 1) return Math.min(200, Math.floor(fromBuilding));
    let maxF = 0;
    for (const a of getBuildingApartments()) {
      const f = Number(a.floorNumber ?? a.floor_number ?? 0);
      if (Number.isFinite(f) && f > maxF) maxF = f;
    }
    if (maxF >= 1) return Math.min(200, maxF);
    return 1;
  }

  /** Paid schedule rows for all contracts on this building's apartments (includes vacated units; see GET /api/buildings/:id/installments). */
  let serverInstallmentsForBuilding = [];

  let selectedApartmentId = null;

  function formatMoney(value) {
    const n = Number(value || 0);
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA-u-nu-latn"
          : "ar-SA-u-nu-latn";
    if (!n) return T("common.sarZero");
    return `${n.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function getRequestPriority(typeId) {
    const priorities = {
      maintenance: 2,
      complaint: 3,
      suggestion: 4,
      request: 5,
    };

    return priorities[typeId] || 99;
  }

  function getApartmentCurrentContractId(apartment) {
    if (!apartment) return null;

    return (
      apartment.currentContractId ||
      apartment.contract?.id ||
      apartment.contractId ||
      null
    );
  }

  function isApartmentOccupied(apartment) {
    if (!apartment) return false;
    const ti = apartment.tenantInfo;
    return !!(
      apartment.tenantUserId ||
      apartment.tenantNationalId ||
      String(ti?.fullName || ti?.full_name || "").trim() ||
      String(ti?.phoneNumber || ti?.phone_number || "").trim()
    );
  }

  function getOpenMaintenanceForApartment(apartment) {
    const aid = String(apartment.apiId ?? apartment.id ?? "");
    if (!aid) return [];
    return (maintenanceRows || []).filter((m) => {
      if (String(m.apartment_id) !== aid) return false;
      const rt = String(m.request_type || "maintenance").toLowerCase();
      if (rt !== "maintenance") return false;
      const st = String(m.status || "").toLowerCase();
      return st !== "resolved" && st !== "closed";
    });
  }

  function tenantRequestTypeTitle(req) {
    if (req.typeTitle) return req.typeTitle;
    const map = {
      maintenance: "صيانة",
      complaint: "شكوى",
      suggestion: "اقتراح",
      request: "طلب",
    };
    return map[req.typeId] || "طلب";
  }

  /** Keeps badge CSS class (`badge-${typeId}`) aligned with label — use DB `request_type`, not free `title`. */
  function canonicalBadgeLabel(typeId) {
    const id = String(typeId || "request").trim().toLowerCase();
    const map = {
      maintenance: "صيانة",
      complaint: "شكوى",
      suggestion: "اقتراح",
      request: "طلب",
    };
    return map[id] || map.request;
  }

  function normalizeRequestTypeId(raw) {
    const x = String(raw || "request").trim().toLowerCase();
    if (["maintenance", "complaint", "suggestion", "request"].includes(x)) return x;
    return "request";
  }

  const TYPE_COLOR = {
    complaint: "#facc15",
    suggestion: "#3b82f6",
    request: "#22c55e",
  };

  function getOpenNonMaintenanceRequestsForApartment(apartment) {
    const aid = String(apartment.apiId ?? apartment.id ?? "");
    if (!aid) return [];
    return (maintenanceRows || [])
      .filter((m) => {
        if (String(m.apartment_id) !== aid) return false;
        const rt = String(m.request_type || "maintenance").toLowerCase();
        if (rt === "maintenance") return false;
        const st = String(m.status || "").toLowerCase();
        return st !== "resolved" && st !== "closed";
      })
      .map((m) => {
        const rt = normalizeRequestTypeId(m.request_type || "request");
        return {
          typeId: rt,
          typeTitle: canonicalBadgeLabel(rt),
          typeColor: TYPE_COLOR[rt] || "#94a3b8",
          status: m.status,
        };
      });
  }

  async function markOwnerAcknowledgedBuildingOnHome() {
    try {
      if (
        typeof WalajnaTenantRequests !== "undefined" &&
        WalajnaTenantRequests.markOwnerSeenBuilding
      ) {
        await WalajnaTenantRequests.markOwnerSeenBuilding(apiPathBuildingId);
      }
    } catch (e) {
      console.warn("[owner-building] mark owner seen", e);
    }
  }

  void markOwnerAcknowledgedBuildingOnHome();

  function getOpenRequestsFromApartmentEmbedded(apartment) {
    const open = apartment.openRequests || apartment.open_requests || [];
    return (Array.isArray(open) ? open : [])
      .map((row) => {
        const rt = normalizeRequestTypeId(row.request_type || row.requestType);
        return {
          typeId: rt,
          typeTitle: canonicalBadgeLabel(rt),
          typeColor: rt === "maintenance" ? "#f59e0b" : TYPE_COLOR[rt] || "#94a3b8",
          status: row.status,
        };
      })
      .filter((r) => {
        const st = String(r.status || "").toLowerCase();
        return st !== "resolved" && st !== "closed";
      });
  }

  function getOpenRequests(apartment) {
    const fromMaint = getOpenMaintenanceForApartment(apartment).map((m) => ({
      typeId: "maintenance",
      typeTitle: canonicalBadgeLabel("maintenance"),
      typeColor: "#f59e0b",
      status: m.status,
    }));
    const fromStored = getOpenNonMaintenanceRequestsForApartment(apartment);
    const merged = [...fromMaint, ...fromStored];
    const source = merged.length ? merged : getOpenRequestsFromApartmentEmbedded(apartment);
    const byType = new Map();
    source.forEach((r) => {
      if (!byType.has(r.typeId)) byType.set(r.typeId, r);
    });
    return Array.from(byType.values()).sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    );
  }

  function getHighestPriorityRequest(apartment) {
    const open = getOpenRequests(apartment);
    if (!open.length) return null;
    return [...open].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function installmentUnpaidRemaining(row) {
    const status = String(row?.status || "").toLowerCase();
    if (status === "paid" || status === "cancelled") return 0;
    const amount = Number(row?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const paidRaw =
      row.amount_paid ?? row.paid_amount ?? row.paidAmount ?? row.amountPaid;
    if (paidRaw != null && paidRaw !== "") {
      const paid = Number(paidRaw);
      if (Number.isFinite(paid)) {
        const remaining = amount - paid;
        return remaining > 0.009 ? remaining : 0;
      }
    }
    return amount;
  }

  function isApartmentRentOverdue(apartment) {
    const currentContractId = getApartmentCurrentContractId(apartment);
    if (!currentContractId) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const apiAptId = String(apartment.apiId ?? apartment.id ?? "");
    const localAptId = String(apartment.id ?? "");

    // Source of truth: payment_installments for the current contract.
    if (Array.isArray(serverInstallmentsForBuilding) && serverInstallmentsForBuilding.length) {
      return serverInstallmentsForBuilding.some((row) => {
        const cid =
          row.contract_id != null && String(row.contract_id) !== ""
            ? String(row.contract_id)
            : "";
        if (cid && cid !== String(currentContractId)) return false;

        const rowApt =
          row.apartment_id != null && String(row.apartment_id) !== ""
            ? String(row.apartment_id)
            : "";
        if (rowApt && rowApt !== apiAptId && rowApt !== localAptId) return false;

        if (installmentUnpaidRemaining(row) <= 0) return false;

        const dueRaw = row.due_date || row.dueDate;
        if (!dueRaw) return false;
        const dueDate = new Date(dueRaw);
        if (Number.isNaN(dueDate.getTime())) return false;
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() <= today.getTime();
      });
    }

    // Fallback when installments are not loaded yet: local payments list.
    if (Array.isArray(payments) && payments.length) {
      return payments.some((payment) => {
        if (
          payment.apartmentId != null &&
          String(payment.apartmentId) !== "" &&
          String(payment.apartmentId) !== localAptId &&
          String(payment.apartmentId) !== apiAptId
        ) {
          return false;
        }
        const pc =
          payment.contractId != null && String(payment.contractId) !== ""
            ? String(payment.contractId)
            : "";
        if (pc && pc !== String(currentContractId)) return false;
        if (payment.status === "paid" || payment.status === "cancelled") return false;
        if (!payment.dueDate) return false;
        const dueDate = new Date(payment.dueDate);
        if (Number.isNaN(dueDate.getTime())) return false;
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() <= today.getTime();
      });
    }

    // Last resort only (stale until installments load): API lease_status hint.
    const ls = String(
      apartment.leaseStatus ?? apartment.lease_status ?? ""
    ).toLowerCase();
    return ls === "overdue";
  }

  function closeAllApartmentMenus() {
    document.querySelectorAll(".apartment-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });

    document.querySelectorAll(".apartment-card").forEach((card) => {
      card.classList.remove("menu-open");
    });
  }

  function showError(message) {
    const errorBox = document.getElementById("linkTenantError");
    if (errorBox) {
      errorBox.textContent = message || "";
    }
  }

  function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field) {
      field.value = value ?? "";
    }
  }

  function openEditModal(apartmentId) {
    const apartment = apartments.find(
      (item) => String(item.id) === String(apartmentId)
    );

    if (!apartment) return;

    if (!isApartmentOccupied(apartment)) {
      if (!isCurrentBuildingUnitLayoutComplete()) {
        alert(T("building.completeLayoutAlert"));
        return;
      }
    }

    selectedApartmentId = apartmentId;

    const tenantInfo = apartment.tenantInfo || {};
    const contract = apartment.contract || {};

    const titleEl = document.getElementById("editApartmentModalTitle");
    const modal = document.getElementById("editApartmentModal");

    if (titleEl) {
      titleEl.textContent = T("building.editApt", { n: apartment.number });
    }

    setFieldValue("linkFullName", tenantInfo.fullName);
    setFieldValue("linkNationalId", apartment.tenantNationalId);
    setFieldValue("linkNationality", tenantInfo.nationality);
    setFieldValue("linkTenantType", tenantInfo.tenantType);
    setFieldValue("linkPhoneNumber", tenantInfo.phoneNumber);
    const contractYearly = Number(contract.yearlyRent ?? contract.yearly_rent);
    const fallbackMonthly = Number(contract.rentAmount || 0);
    const rentFieldValue =
      Number.isFinite(contractYearly) && contractYearly > 0
        ? contractYearly
        : fallbackMonthly > 0
          ? fallbackMonthly * 12
          : "";
    setFieldValue("linkRent", rentFieldValue);

    setFieldValue("linkFloorNumber", apartment.floorNumber);
    setFieldValue("linkRoomsCount", apartment.roomsCount);
    setFieldValue("linkBathroomsCount", apartment.bathroomsCount);
    setFieldValue("linkLivingRoomsCount", apartment.livingRoomsCount);

    setFieldValue("linkPaymentCycle", contract.paymentCycle || apartment.paymentDefaults?.paymentCycle || "monthly");
    setFieldValue("linkInstallmentsCount", contract.installmentsCount || "");
    setFieldValue("linkInsurancePaid", contract.insurancePaid);
    setFieldValue("linkStartDate", contract.startDate);
    setFieldValue("linkEndDate", contract.endDate);
    setFieldValue("linkMeterNumber", contract.meterNumber);
    setFieldValue("linkNotes", contract.notes);

    showError("");

    if (modal) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeEditModal() {
    selectedApartmentId = null;

    const modal = document.getElementById("editApartmentModal");
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    showError("");
  }

  function readEditFormData() {
    const getValue = (id) => {
      return (document.getElementById(id)?.value || "").trim();
    };

    return {
      fullName: getValue("linkFullName"),
      nationalId: getValue("linkNationalId"),
      nationality: getValue("linkNationality"),
      tenantType: getValue("linkTenantType"),
      phone: getValue("linkPhoneNumber"),
      rent: getValue("linkRent"),

      floorNumber: getValue("linkFloorNumber"),
      roomsCount: getValue("linkRoomsCount"),
      bathroomsCount: getValue("linkBathroomsCount"),
      livingRoomsCount: getValue("linkLivingRoomsCount"),

      paymentCycle: getValue("linkPaymentCycle"),
      installmentsCount: getValue("linkInstallmentsCount"),
      insurancePaid: getValue("linkInsurancePaid"),
      startDate: getValue("linkStartDate"),
      endDate: getValue("linkEndDate"),
      meterNumber: getValue("linkMeterNumber"),
      notes: getValue("linkNotes"),
    };
  }

  function validateEditFormData(data) {
    if (data.nationalId) {
      const nidOk =
        typeof isSaudiNationalOrIqamaFormat === "function"
          ? isSaudiNationalOrIqamaFormat(data.nationalId)
          : /^[12]\d{9}$/.test(String(data.nationalId || "").trim());
      if (!nidOk) {
        return T("building.idInvalid");
      }
    }

    if (data.phone && !/^05\d{8}$/.test(data.phone)) {
      return T("building.phoneInvalid");
    }

    if (data.endDate && data.startDate && data.endDate < data.startDate) {
      return T("building.endAfterStart");
    }

    if (data.installmentsCount && Number(data.installmentsCount) < 1) {
      return T("building.installmentsInvalid");
    }

    return "";
  }

  async function saveApartmentEdit() {
    if (!selectedApartmentId) return;

    const formData = readEditFormData();
    const validationMessage = validateEditFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    const aptForSave = apartments.find((x) => String(x.id) === String(selectedApartmentId));
    const formHasTenant =
      formData.fullName ||
      formData.nationalId ||
      formData.nationality ||
      formData.tenantType ||
      formData.phone;

    if (aptForSave && !isApartmentOccupied(aptForSave)) {
      if (!isCurrentBuildingUnitLayoutComplete()) {
        if (formHasTenant) {
          showError(T("building.completeLayoutAlert"));
          return;
        }
      }
    }

    const clearingTenant =
      aptForSave &&
      isApartmentOccupied(aptForSave) &&
      !formHasTenant;

    const authed =
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser?.();
    if (
      clearingTenant &&
      authed &&
      typeof WalajnaApartmentsApi !== "undefined" &&
      WalajnaApartmentsApi.vacateTenant
    ) {
      const apiId =
        aptForSave.apiId != null
          ? Number(aptForSave.apiId)
          : Number(aptForSave.id);
      if (Number.isFinite(apiId)) {
        try {
          let refundAmount = 0;
          if (
            window.WalajnaInsuranceSettle &&
            typeof WalajnaInsuranceSettle.confirmEvictionRefund === "function"
          ) {
            const cid =
              aptForSave.currentContractId || aptForSave.contract?.id || null;
            const result = await WalajnaInsuranceSettle.confirmEvictionRefund(cid, {
              confirmKey: "building.confirmVacate",
              skipConfirmIfZero: true,
            });
            if (!result.proceed) return;
            refundAmount = Number(result.refundAmount || 0);
          }
          await WalajnaApartmentsApi.vacateTenant(apiId, { refundAmount });
          closeEditModal();
          window.location.reload();
          return;
        } catch (e) {
          alert(e?.message || String(e));
          return;
        }
      }
    }

    const updatedApartments = apartments.map((apt) => {
      if (String(apt.id) !== String(selectedApartmentId)) return apt;

      const oldContract = apt.contract || {};

      if (!formHasTenant) {
        return {
          ...apt,
          rent: formData.rent ? Number(formData.rent) : "",
          floorNumber: formData.floorNumber ? Number(formData.floorNumber) : null,
          roomsCount: formData.roomsCount ? Number(formData.roomsCount) : null,
          bathroomsCount: formData.bathroomsCount ? Number(formData.bathroomsCount) : null,
          livingRoomsCount: formData.livingRoomsCount
            ? Number(formData.livingRoomsCount)
            : null,
          tenantUserId: null,
          tenantNationalId: null,
          tenantInfo: {},
          currentContractId: null,
          contractId: null,
          contract: {},
          leaseStatus: "vacant",
          status: TAr("finance.vacant"),
        };
      }

      return {
        ...apt,
        rent: formData.rent ? Number(formData.rent) : "",
        floorNumber: formData.floorNumber ? Number(formData.floorNumber) : null,
        roomsCount: formData.roomsCount ? Number(formData.roomsCount) : null,
        bathroomsCount: formData.bathroomsCount ? Number(formData.bathroomsCount) : null,
        livingRoomsCount: formData.livingRoomsCount ? Number(formData.livingRoomsCount) : null,

        tenantNationalId: formData.nationalId || null,

        tenantInfo: {
          fullName: formData.fullName || "",
          phoneNumber: formData.phone || "",
          nationality: formData.nationality || "",
          tenantType: formData.tenantType || "",
        },

        contract: {
          ...oldContract,
          startDate: formData.startDate || "",
          endDate: formData.endDate || "",
          rentAmount: formData.rent
            ? Number(formData.rent)
            : Number(oldContract.rentAmount || 0),
          paymentCycle:
            formData.paymentCycle || apt.paymentDefaults?.paymentCycle || "monthly",
          installmentsCount: formData.installmentsCount
            ? Number(formData.installmentsCount)
            : Number(oldContract.installmentsCount || 0),
          insurancePaid: formData.insurancePaid || "",
          meterNumber: formData.meterNumber || "",
          notes: formData.notes || "",
        },
      };
    });

    apartments = updatedApartments;
    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mergeSessionApartments) {
      WalajnaApartmentsApi.mergeSessionApartments(updatedApartments);
    }
    if (!WalajnaAuth?.getCurrentUser?.()) {
      try {
        const rest = JSON.parse(
          localStorage.getItem("walajna_apartments") || "[]"
        ).filter((a) => !updatedApartments.some((x) => String(x.id) === String(a.id)));
        localStorage.setItem(
          "walajna_apartments",
          JSON.stringify([...rest, ...updatedApartments])
        );
      } catch {
        /* ignore */
      }
    }
    closeEditModal();
    window.location.reload();
  }
async function evictApartment(apartmentId) {
  const apartment = apartments.find(
    (item) => String(item.id) === String(apartmentId)
  );
  if (!apartment) return;

  const evictionCheck = canEvictApartment(apartment);
  if (!evictionCheck.allowed) {
    alert(evictionCheck.message);
    return;
  }

  const openRequests = getOpenRequests(apartment);

  if (openRequests.length > 0) {
    alert(T("building.openRequestsFirst"));
    return;
  }

  let refundAmount = 0;
  if (
    window.WalajnaInsuranceSettle &&
    typeof WalajnaInsuranceSettle.confirmEvictionRefund === "function"
  ) {
    const cid = apartment.currentContractId || apartment.contract?.id || null;
    const result = await WalajnaInsuranceSettle.confirmEvictionRefund(cid, {
      confirmKey: "building.confirmVacate",
    });
    if (!result.proceed) return;
    refundAmount = Number(result.refundAmount || 0);
  } else {
    const confirmed = await WalajnaDialog.confirm(T("building.confirmVacate"), {
      danger: true,
    });
    if (!confirmed) return;
  }

  const authed =
    typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser?.();
  if (authed && typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.vacateTenant) {
    const apiId =
      apartment.apiId != null ? Number(apartment.apiId) : Number(apartment.id);
    if (Number.isFinite(apiId)) {
      try {
        await WalajnaApartmentsApi.vacateTenant(apiId, { refundAmount });
        window.location.reload();
        return;
      } catch (e) {
        alert(e?.message || String(e));
        return;
      }
    }
  }

  const updatedApartments = apartments.map((item) => {
    if (String(item.id) !== String(apartmentId)) return item;

    return {
      ...item,
      rent: "",
      tenantUserId: null,
      tenantNationalId: null,
      tenantInfo: {},
      contract: {},
      currentContractId: null,
      leaseStatus: "vacant",
      status: TAr("finance.vacant"),
    };
  });

  apartments = updatedApartments;
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mergeSessionApartments) {
    WalajnaApartmentsApi.mergeSessionApartments(updatedApartments);
  }
  if (!WalajnaAuth?.getCurrentUser?.()) {
    try {
      const rest = JSON.parse(
        localStorage.getItem("walajna_apartments") || "[]"
      ).filter((a) => !updatedApartments.some((x) => String(x.id) === String(a.id)));
      localStorage.setItem(
        "walajna_apartments",
        JSON.stringify([...rest, ...updatedApartments])
      );
    } catch {
      /* ignore */
    }
  }
  window.location.reload();
}
    function getCycleMonths(paymentCycle) {
    switch (paymentCycle) {
      case "quarterly":
        return 3;
      case "semi_annual":
      case "semi":
        return 6;
      case "annual":
        return 12;
      case "monthly":
      default:
        return 1;
    }
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  function addMonths(date, monthsToAdd) {
    const d = new Date(date);
    const originalDay = d.getDate();

    d.setDate(1);
    d.setMonth(d.getMonth() + monthsToAdd);

    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDay));

    return d;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && endA >= startB;
  }

  /**
   * Installment `amount` is the full billing period (e.g. 6× monthly rent for semi-annual).
   * Attribute `amount / period_months` to each calendar month from due_date (same as legacy WalajnaPayments spread).
   */
  function installmentCoverageMonths(row) {
    const n = Number(row.period_months);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(12, Math.max(1, Math.floor(n)));
    }
    return 1;
  }

  function paidInstallmentIncomeAttributedToRange(row, rangeStart, rangeEnd) {
    if (String(row.status || "").toLowerCase() !== "paid") {
      return 0;
    }
    const cycleMonths = installmentCoverageMonths(row);
    const total = Number(row.amount || 0);
    if (!cycleMonths || !Number.isFinite(total)) {
      return 0;
    }
    const monthlyAmount = total / cycleMonths;
    const rawDue = row.due_date || row.dueDate;
    if (!rawDue) return 0;
    const coverageStartDate = new Date(rawDue);
    if (Number.isNaN(coverageStartDate.getTime())) return 0;
    let income = 0;
    for (let i = 0; i < cycleMonths; i++) {
      const coveredMonthDate = addMonths(coverageStartDate, i);
      const coveredStart = startOfMonth(coveredMonthDate);
      const coveredEnd = endOfMonth(coveredMonthDate);
      if (rangesOverlap(coveredStart, coveredEnd, rangeStart, rangeEnd)) {
        income += monthlyAmount;
      }
    }
    return income;
  }

  function getPaymentCoverageStart(payment) {
    const rawDate =
      payment.coverageStartDate ||
      payment.contractStartDate ||
      payment.dueDate ||
      payment.paidAt;

    const date = rawDate ? new Date(rawDate) : null;

    if (!date || Number.isNaN(date.getTime())) return null;

    return date;
  }
  function canEvictApartment(apartment) {
  if (!apartment) {
    return {
      allowed: false,
      message: T("building.aptDataMissing"),
    };
  }

  const currentContractId =
    apartment.currentContractId ||
    apartment.contract?.id ||
    apartment.contractId ||
    null;

  if (!currentContractId) {
    return {
      allowed: false,
      message: T("building.noContractVacate"),
    };
  }

  const contractStartValue = apartment.contract?.startDate || null;

  if (!contractStartValue) {
    return {
      allowed: true,
      message: "",
    };
  }

  const contractStartDate = new Date(contractStartValue);
  if (Number.isNaN(contractStartDate.getTime())) {
    return {
      allowed: true,
      message: "",
    };
  }

  contractStartDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - contractStartDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) {
    return {
      allowed: false,
      message: T("building.vacateTooSoon"),
    };
  }

  return {
    allowed: true,
    message: "",
  };
}

  function getApartmentRealizedIncomeForRange(apartment, rangeStart, rangeEnd) {
    if (!apartment) return 0;

    const apartmentId = apartment.id;
    const apiAptId =
      apartment.apiId != null ? String(apartment.apiId) : String(apartmentId);
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!apartmentId) {
      return 0;
    }

    /* API path: income from building-wide installment list (vacated units have no current_contract_id). */
    if (apartmentsFromApi) {
      const rows = serverInstallmentsForBuilding || [];
      let apiIncome = 0;
      rows.forEach((row) => {
        const rowApt =
          row.apartment_id != null ? String(row.apartment_id) : "";
        if (rowApt !== String(apiAptId)) return;
        apiIncome += paidInstallmentIncomeAttributedToRange(row, rangeStart, rangeEnd);
      });
      return apiIncome;
    }

    if (!currentContractId) {
      return 0;
    }

    const apartmentPayments = payments.filter((payment) => {
      if (String(payment.apartmentId) !== String(apartmentId)) return false;
      const pc = String(payment.contractId || "");
      const cc = String(currentContractId || "");
      if (pc && cc && pc !== cc) return false;
      if (payment.status !== "paid") return false;
      return true;
    });

    let income = 0;

    apartmentPayments.forEach((payment) => {
      const coverageStartDate = getPaymentCoverageStart(payment);
      if (!coverageStartDate) return;

      const cycleMonths = getCycleMonths(payment.paymentCycle || apartment.contract?.paymentCycle);
      const monthlyAmount =
        Number(payment.monthlyRentAmount || 0) ||
        (cycleMonths > 0 ? Number(payment.amount || 0) / cycleMonths : 0);

      if (!monthlyAmount) return;

      for (let i = 0; i < cycleMonths; i += 1) {
        const coveredMonthDate = addMonths(coverageStartDate, i);
        const coveredStart = startOfMonth(coveredMonthDate);
        const coveredEnd = endOfMonth(coveredMonthDate);

        if (rangesOverlap(coveredStart, coveredEnd, rangeStart, rangeEnd)) {
          income += monthlyAmount;
        }
      }
    });

    return income;
  }

  function getApartmentExpensesForRange(apartment, rangeStart, rangeEnd) {
    if (!apartment) return { total: 0, depositCovered: 0, ownerBorne: 0 };

    const apartmentId = apartment.id;
    const currentContractId = getApartmentCurrentContractId(apartment);
    let total = 0;
    let depositCovered = 0;

    costs.forEach((cost) => {
      if (String(cost.apartmentId) !== String(apartmentId)) return;
      if (String(cost.status || "").toLowerCase() === "cancelled") return;

      // Contract-linked costs must match current contract when both present.
      if (cost.contractId && currentContractId) {
        if (String(cost.contractId) !== String(currentContractId)) {
          return;
        }
      }

      const rawDate = cost.date || cost.createdAt || cost.expenseDate;
      if (!rawDate) return;

      const costDate = new Date(rawDate);
      if (Number.isNaN(costDate.getTime())) return;

      if (costDate >= rangeStart && costDate <= rangeEnd) {
        total += Number(cost.amount || 0);
        depositCovered += Number(cost.depositCoveredAmount || 0);
      }
    });

    depositCovered = Math.min(depositCovered, total);
    return {
      total,
      depositCovered,
      ownerBorne: Math.max(0, total - depositCovered),
    };
  }

  function getBuildingFinancialSummary() {
    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    const monthlyIncome = getBuildingApartments().reduce((sum, apartment) => {
      return sum + getApartmentRealizedIncomeForRange(
        apartment,
        currentMonthStart,
        currentMonthEnd
      );
    }, 0);

    const costTotals = getBuildingApartments().reduce(
      (acc, apartment) => {
        const b = getApartmentExpensesForRange(
          apartment,
          currentMonthStart,
          currentMonthEnd
        );
        acc.total += b.total;
        acc.depositCovered += b.depositCovered;
        acc.ownerBorne += b.ownerBorne;
        return acc;
      },
      { total: 0, depositCovered: 0, ownerBorne: 0 }
    );

    const expenses = costTotals.ownerBorne;
    const profit = monthlyIncome - expenses;

    const occupiedUnits = getBuildingApartments().filter((apartment) => {
      return isApartmentOccupied(apartment);
    }).length;

    const lateUnits = getBuildingApartments().filter((apartment) => {
      return isApartmentRentOverdue(apartment);
    }).length;

    const rentReceivables = (serverInstallmentsForBuilding || []).reduce((sum, row) => {
      const st = String(row.status || "").toLowerCase();
      if (st === "paid" || st === "cancelled") return sum;
      const due = row.due_date || row.dueDate;
      if (!due) return sum;
      const dueDate = new Date(due);
      if (Number.isNaN(dueDate.getTime())) return sum;
      dueDate.setHours(0, 0, 0, 0);
      const asOf = new Date(currentMonthEnd);
      asOf.setHours(23, 59, 59, 999);
      if (dueDate > asOf) return sum;
      return sum + Number(row.amount || 0);
    }, 0);

    return {
      monthlyIncome,
      expenses,
      profit,
      occupiedUnits,
      totalUnits: getBuildingApartments().length,
      lateUnits,
      rentReceivables,
    };
  }

  function renderBuildingFinancialSummary() {
    const incomeEl = document.getElementById("buildingIncome");
    const costsEl = document.getElementById("buildingCosts");
    const profitEl = document.getElementById("buildingProfit");
    const receivablesEl = document.getElementById("buildingReceivables");
    const occupiedEl = document.getElementById("buildingOccupiedUnits");
    const lateEl = document.getElementById("buildingLateUnits");

    const summary = getBuildingFinancialSummary();

    if (incomeEl) {
      incomeEl.classList.remove("is-pending");
      incomeEl.textContent = formatMoney(summary.monthlyIncome);
    }

    if (costsEl) {
      costsEl.classList.remove("is-pending");
      costsEl.textContent = formatMoney(summary.expenses);
    }

    if (profitEl) {
      profitEl.classList.remove("is-pending");
      profitEl.textContent = formatMoney(summary.profit);
      profitEl.classList.remove("profit-positive", "profit-negative");

      if (summary.profit > 0) {
        profitEl.classList.add("profit-positive");
      } else if (summary.profit < 0) {
        profitEl.classList.add("profit-negative");
      }
    }

    if (receivablesEl) {
      receivablesEl.classList.remove("is-pending");
      receivablesEl.textContent = formatMoney(summary.rentReceivables);
    }

    if (occupiedEl) {
      occupiedEl.classList.remove("is-pending");
      occupiedEl.textContent = `${summary.occupiedUnits} / ${summary.totalUnits}`;
    }

    if (lateEl) {
      lateEl.classList.remove("is-pending");
      lateEl.textContent = String(summary.lateUnits);
    }
  }

  async function loadInstallmentsForBuildingSummary() {
    serverInstallmentsForBuilding = [];
    if (
      !apartmentsFromApi ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(String(apiPathBuildingId))}/installments`,
        { method: "GET" }
      );
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      serverInstallmentsForBuilding = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("owner-building: building installments fetch failed", e);
    }
  }

  async function loadCostsForBuildingSummary() {
    if (
      !apartmentsFromApi ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !WalajnaAuth.getCurrentUser ||
      !WalajnaAuth.getCurrentUser()
    ) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}/costs`,
        { method: "GET" }
      );
      if (!res.ok) return;
      const rows = await res.json();
      const aggregated = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        const sid = row.apartment_id;
        const apartment = getBuildingApartments().find(
          (a) =>
            String(a.apiId ?? "") === String(sid) || String(a.id) === String(sid)
        );
        if (!apartment) continue;
        aggregated.push({
          id: String(row.id ?? ""),
          apartmentId: String(apartment.id),
          contractId:
            row.contract_id != null && String(row.contract_id) !== ""
              ? String(row.contract_id)
              : null,
          amount: Number(row.amount || 0),
          status: String(row.status || "approved"),
          depositCoveredAmount: Number(row.deposit_covered_amount || 0),
          fundingSource: String(row.funding_source || "owner"),
          date: String(row.expense_date || "").slice(0, 10),
          createdAt: String(row.created_at || "").slice(0, 10),
        });
      }
      costs = aggregated;
    } catch (e) {
      console.warn("owner-building: building costs fetch failed", e);
    }
  }

  async function deleteApartment(apartmentId) {
    const confirmed = await WalajnaDialog.confirm(T("building.confirmDeleteApt"), {
      danger: true,
    });
    if (!confirmed) return;

    const updatedApartments = apartments.filter((apartment) => apartment.id !== apartmentId);
    const updatedCosts = costs.filter((cost) => cost.apartmentId !== apartmentId);

    if (
      WalajnaAuth?.getCurrentUser?.() &&
      typeof WalajnaDocumentsApi !== "undefined" &&
      typeof WalajnaDocumentsApi.deleteByApartment === "function"
    ) {
      try {
        await WalajnaDocumentsApi.deleteByApartment(apartmentId);
      } catch (e) {
        console.warn("owner-building: delete documents API failed", e);
      }
    } else {
      const documents = JSON.parse(localStorage.getItem("walajna_documents") || "[]");
      const updatedDocuments = documents.filter((document) => document.apartmentId !== apartmentId);
      localStorage.setItem("walajna_documents", JSON.stringify(updatedDocuments));
    }

    apartments = updatedApartments;
    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.removeFromSession) {
      WalajnaApartmentsApi.removeFromSession(apartmentId);
    }
    if (!WalajnaAuth?.getCurrentUser?.()) {
      localStorage.setItem("walajna_apartments", JSON.stringify(updatedApartments));
    }
    localStorage.setItem("walajna_costs", JSON.stringify(updatedCosts));

    alert(T("building.aptDeleted"));
    window.location.reload();
  }

  function renderApartmentGrid() {
  if (!building && apiLoadError) {
    grid.innerHTML = `
      <div class="finance-empty">
        ${escapeHtml(T("building.notFound"))}
      </div>
      <div style="margin-top:10px;">
        <button id="ownerBuildingRetryBtn" class="btn-primary" type="button">Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById("ownerBuildingRetryBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => window.location.reload());
    }
    return;
  }

  if (building && !isCurrentBuildingUnitLayoutComplete()) {
    const layoutId = encodeURIComponent(String(apiPathBuildingId || buildingId));
    window.location.replace(
      `owner_building_layout.html?buildingId=${layoutId}&from=building`
    );
    return;
  }

  const floors = {};

  getBuildingApartments().forEach((apartment) => {
    const floor = Number(apartment.floorNumber || 1);

    if (!floors[floor]) {
      floors[floor] = [];
    }

    floors[floor].push(apartment);
  });

  const sortedFloors = Object.keys(floors)
    .map(Number)
    .sort((a, b) => a - b);

  grid.innerHTML = sortedFloors
    .map((floorNumber) => {
      const floorApartments = floors[floorNumber].sort((a, b) => {
        const aNum = Number(a.number || 0);
        const bNum = Number(b.number || 0);
        return aNum - bNum;
      });

      const apartmentsHtml = floorApartments
        .map((apartment) => {
          const openRequests = getOpenRequests(apartment);
          const highestPriorityRequest = getHighestPriorityRequest(apartment);
          const isOverdue = isApartmentRentOverdue(apartment);

          let typeClass = "none";

          const isRented = isApartmentOccupied(apartment);

          const rentedBadge = isRented
            ? `<span class="apartment-badge rented-badge">${escapeHtml(
                T("building.rentedBadge")
              )}</span>`
            : "";

          if (isOverdue) {
            typeClass = "rent-overdue";
          } else if (highestPriorityRequest) {
            typeClass = highestPriorityRequest.typeId;
          }

          let badgesHtml = "";

          if (openRequests.length) {
            badgesHtml = `
              <div class="apartment-badges">
                ${openRequests
                  .map(
                    (req) => `
                      <span class="apartment-badge badge-${req.typeId}">
                        <span class="badge-dot"></span>
                        ${escapeHtml(req.typeTitle)}
                      </span>
                    `
                  )
                  .join("")}
              </div>
            `;
          }

          return `
            <div class="apartment-card ${typeClass}" data-id="${apartment.id}">
              <div class="apartment-card-menu-wrap">
                <button
                  type="button"
                  class="apartment-more-btn"
                  data-menu-btn="true"
                  data-id="${apartment.id}"
                  aria-label="${escapeHtml(T("building.aptMenu"))}"
                >
                  ⋮
                </button>

                <div class="apartment-card-menu" data-menu="${apartment.id}">
                  <button
                    type="button"
                    data-action="edit-apartment"
                    data-id="${apartment.id}"
                  >
                    ${escapeHtml(T("common.edit"))}
                  </button>

                  <button
                    type="button"
                    class="danger"
                    data-action="evict-apartment"
                    data-id="${apartment.id}"
                  >
                    ${escapeHtml(T("building.vacate"))}
                  </button>
                </div>
              </div>

              <div class="apartment-number-row">
                <div class="apartment-number">
                  ${escapeHtml(T("building.aptLabel", { n: apartment.number }))}
                </div>
                ${rentedBadge}
              </div>

              <div class="apartment-tenant">
                ${escapeHtml(
                  apartment.tenantInfo?.fullName || T("finance.noTenant")
                )}
              </div>

              ${badgesHtml}
            </div>
          `;
        })
        .join("");

      return `
        <div class="floor-section">
          <div class="floor-title">${escapeHtml(
            T("building.floorTitle", { n: floorNumber })
          )}</div>
          <div class="floor-apartments">
            ${apartmentsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".apartment-more-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      const card = button.closest(".apartment-card");
      const targetMenu = document.querySelector(`[data-menu="${apartmentId}"]`);
      const isOpen = targetMenu?.classList.contains("is-open");

      closeAllApartmentMenus();

      if (targetMenu && !isOpen) {
        targetMenu.classList.add("is-open");
        if (card) {
          card.classList.add("menu-open");
        }
      }
    });
  });

  document.querySelectorAll('[data-action="edit-apartment"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      closeAllApartmentMenus();
      openEditModal(apartmentId);
    });
  });

  document.querySelectorAll('[data-action="evict-apartment"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const apartmentId = button.dataset.id;
      closeAllApartmentMenus();
      await evictApartment(apartmentId);
    });
  });

  document.querySelectorAll(".apartment-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".apartment-card-menu-wrap")) return;

      const aptId = card.dataset.id;
      window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(aptId)}`;
    });
  });
  }

  function refreshAll() {
    renderBuildingFinancialSummary();
    renderApartmentGrid();
  }

  populateLinkTenantTypeSelect();
  await Promise.all([
    loadInstallmentsForBuildingSummary(),
    loadCostsForBuildingSummary(),
  ]);
  setOwnerBuildingLoading(false);
  refreshAll();
  document.addEventListener("walajna:i18n-applied", () => {
    populateLinkTenantTypeSelect();
    refreshAll();
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
  });

  const closeBtn = document.getElementById("closeEditApartmentModal");
  const cancelBtn = document.getElementById("cancelEditApartmentModal");
  const backdrop = document.querySelector('[data-close-edit-modal="true"]');
  const saveBtn = document.getElementById("saveLinkedTenantBtn");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeEditModal);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeEditModal);
  }

  if (backdrop) {
    backdrop.addEventListener("click", closeEditModal);
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", saveApartmentEdit);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".apartment-card-menu-wrap")) {
      closeAllApartmentMenus();
    }
  });
});