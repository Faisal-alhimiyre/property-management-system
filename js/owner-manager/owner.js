document.addEventListener("DOMContentLoaded", async () => {
  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole('owner');
  ensureRoleSetup();

  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");
  const globalRequestsAlert = document.getElementById("globalRequestsAlert");

  const PINS_KEY = "walajna_owner_building_pins";

  function readPins() {
    try {
      return JSON.parse(sessionStorage.getItem(PINS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writePins(map) {
    sessionStorage.setItem(PINS_KEY, JSON.stringify(map || {}));
  }

  async function getServerBuildings() {
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings`,
        { method: "GET" }
      );
      if (response.ok) {
        const serverBuildings = await response.json();
        const pins = readPins();

        return serverBuildings.map((building) => ({
          ...building,
          ownerId: building.ownerId ?? building.owner_id ?? null,
          createdAt: building.createdAt ?? building.created_at ?? null,
          apartmentCount:
            building.apartmentCount ?? building.apartments_count ?? 0,
          totalFloors: building.totalFloors ?? building.total_floors ?? null,
          id: building.id,
          name: building.name,
          city: building.city,
          code: building.code ?? null,
          isPinned: !!(pins[String(building.id)] && pins[String(building.id)].pinned),
          pinnedAt: pins[String(building.id)]?.pinnedAt ?? null,
        }));
      }
    } catch (e) {
      console.warn("Could not fetch server buildings", e);
    }
    return [];
  }

  async function fetchOwnerMaintenance() {
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/maintenance`,
        { method: "GET" }
      );
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async function fetchOwnerApartments() {
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments`,
        { method: "GET" }
      );
      if (!res.ok) return [];
      const rows = await res.json();
      return rows.map(mapApiApartmentToDashboard);
    } catch {
      return [];
    }
  }

  function mapApiApartmentToDashboard(apt) {
    const id = apt.id;
    return {
      id: String(id),
      apiId: id,
      buildingId: String(apt.building_id ?? ""),
      number: String(apt.apartment_number ?? ""),
      floorNumber: Number(apt.floor_number ?? 0),
      leaseStatus: apt.lease_status || "vacant",
      rent: apt.rent,
      tenantUserId: apt.tenant_user_id ?? null,
      tenantNationalId: apt.tenant_national_id ?? null,
      tenantInfo: apt.tenant_info || null,
      currentContractId: apt.current_contract_id ?? null,
      contractId: apt.current_contract_id ?? null,
      contract: apt.current_contract_id
        ? { id: apt.current_contract_id }
        : null,
      status: apt.status || null,
    };
  }

  function expectedApartmentSlots(b) {
    return Number(b.apartments_count ?? b.apartmentCount ?? 0);
  }

  function countApartmentsOnServer(apartmentRows, buildingId) {
    const target = String(buildingId);
    return apartmentRows.filter((a) => String(a.buildingId) === target).length;
  }

  /** Seed only when metadata says units exist but DB has none — avoids POST on every visit. */
  async function seedBuildingsMissingApartments(buildings, apartmentRows) {
    const need = (buildings || []).filter((b) => {
      if (expectedApartmentSlots(b) < 1) return false;
      return countApartmentsOnServer(apartmentRows, b.id) === 0;
    });
    if (!need.length) return false;
    await Promise.all(
      need.map((b) =>
        WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/buildings/${b.id}/seed-apartments`,
          { method: "POST" }
        ).catch((error) => {
          console.warn("Could not seed apartments for building", b.id, error);
        })
      )
    );
    return true;
  }


  if (!container) return;

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function setLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function syncApartmentsToServer(apartmentsToSync, buildingInfo, ownerId) {
    if (!Number.isFinite(Number(ownerId))) return;

    try {
      const listRes = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments`,
        { method: "GET" }
      );

      const existing = listRes.ok ? await listRes.json() : [];
      const existingKeys = new Set();

      existing.forEach((apt) => {
        const description = String(apt.description || "");
        if (!description.startsWith("WALAJNA_META:")) return;

        const metaRaw = description.replace("WALAJNA_META:", "");
        try {
          const meta = JSON.parse(metaRaw);
          existingKeys.add(`${String(meta.buildingId)}:${String(meta.apartmentNumber)}`);
        } catch {
          // Ignore malformed records.
        }
      });

      for (const apartment of apartmentsToSync) {
        const apartmentNumber = String(apartment.number || apartment.id || "");
        const dedupeKey = `${String(buildingInfo.id)}:${apartmentNumber}`;
        if (existingKeys.has(dedupeKey)) continue;

        const meta = {
          buildingId: String(buildingInfo.id),
          buildingCode: buildingInfo.code || null,
          apartmentNumber,
          floorNumber: Number(apartment.floorNumber || 1),
        };

        const payload = {
          owner_id: Number(ownerId),
          address: `${buildingInfo.name} - شقة ${apartmentNumber}`,
          description: `WALAJNA_META:${JSON.stringify(meta)}`,
          rent: Number(apartment.rent || 0),
        };

        const createRes = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/apartments`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          }
        );

        if (createRes.ok) {
          existingKeys.add(dedupeKey);
        }
      }
    } catch (error) {
      console.warn("Could not sync backfilled apartments to server", error);
    }
  }

  async function syncAllLocalApartmentsToServer(buildings, allApartments, ownerId) {
    for (const building of buildings) {
      const buildingApartments = getApartmentsForBuilding(building.id, allApartments);
      if (!buildingApartments.length) continue;
      await syncApartmentsToServer(buildingApartments, building, ownerId);
    }
  }

  const REQUEST_STORAGE_CANDIDATES = [
    "walajna_requests",
    "walajna_apartment_requests",
    "apartment_requests",
    "requests",
  ];

  function detectRequestStorageKey() {
    for (const key of REQUEST_STORAGE_CANDIDATES) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || "null");
        if (Array.isArray(data)) return key;
      } catch {
        /* ignore */
      }
    }
    return REQUEST_STORAGE_CANDIDATES[0];
  }

  function loadStoredTenantRequests() {
    try {
      const key = detectRequestStorageKey();
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  const SEEN_MAINT_BUILDINGS_KEY = "walajna_owner_cleared_maint_buildings";

  function readClearedMaintBuildingIds() {
    try {
      const raw = sessionStorage.getItem(SEEN_MAINT_BUILDINGS_KEY) || "[]";
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function addClearedMaintBuildingId(buildingId) {
    const s = readClearedMaintBuildingIds();
    s.add(String(buildingId));
    sessionStorage.setItem(SEEN_MAINT_BUILDINGS_KEY, JSON.stringify([...s]));
  }

  function saveStoredTenantRequests(rows) {
    try {
      localStorage.setItem(detectRequestStorageKey(), JSON.stringify(rows || []));
    } catch {
      /* ignore */
    }
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
      apartment.contractId ||
      apartment.contract?.id ||
      null
    );
  }

  function isApartmentOccupied(apartment) {
    return !!(
      apartment?.tenantUserId ||
      apartment?.tenantNationalId ||
      apartment?.tenantInfo?.fullName ||
      apartment?.tenantInfo?.phoneNumber ||
      apartment?.tenantInfo?.nationality ||
      apartment?.tenantInfo?.tenantType ||
      apartment?.currentContractId ||
      apartment?.contractId ||
      apartment?.contract?.id ||
      apartment?.contract?.startDate ||
      apartment?.contract?.endDate ||
      apartment?.contract?.rentAmount ||
      apartment?.contract?.paymentCycle ||
      apartment?.contract?.meterNumber
    );
  }

  function getOpenMaintenanceForApartment(apartment, maintenanceRows) {
    const aid = String(apartment.apiId ?? apartment.id ?? "");
    if (!aid) return [];
    return (maintenanceRows || []).filter((m) => {
      if (String(m.apartment_id) !== aid) return false;
      const st = String(m.status || "").toLowerCase();
      return st !== "resolved" && st !== "closed";
    });
  }

  function isStoredTenantRequestOpen(req) {
    const st = String(req.status || "new").toLowerCase();
    return st !== "resolved" && st !== "closed";
  }

  function apartmentMatchesStoredRequest(apartment, req) {
    const bid = String(apartment.buildingId ?? "");
    const ids = new Set(
      [String(apartment.id), String(apartment.apiId)].filter(
        (x) => x && x !== "undefined"
      )
    );
    if (req.apartmentId != null && req.apartmentId !== "" && ids.has(String(req.apartmentId))) {
      return true;
    }
    if (String(req.buildingId ?? "") === bid) {
      const n1 = String(req.apartmentNumber ?? "").trim();
      const n2 = String(apartment.number ?? "").trim();
      if (n1 && n2 && n1 === n2) return true;
    }
    return false;
  }

  function getHighestPriorityRequest(apartment, maintenanceRows, tenantRequests) {
    const open = [];
    if (getOpenMaintenanceForApartment(apartment, maintenanceRows).length) {
      open.push({ typeId: "maintenance" });
    }
    (tenantRequests || []).forEach((req) => {
      if (!isStoredTenantRequestOpen(req)) return;
      if (!apartmentMatchesStoredRequest(apartment, req)) return;
      open.push({ typeId: req.typeId || "request" });
    });
    if (!open.length) return null;
    return [...open].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartment, allPayments) {
    const ls = String(
      apartment.leaseStatus ?? apartment.lease_status ?? ""
    ).toLowerCase();
    if (ls === "overdue") {
      return true;
    }
    const currentContractId = getApartmentCurrentContractId(apartment);
    if (!currentContractId || !allPayments || !allPayments.length) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allPayments.some((payment) => {
      if (payment.contractId !== currentContractId) return false;
      if (payment.status === "paid" || payment.status === "cancelled") return false;
      if (!payment.dueDate) return false;
      const dueDate = new Date(payment.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });
  }

  function getApartmentStatusClass(apartment, maintenanceRows, allPayments, tenantRequests) {
    if (!isApartmentOccupied(apartment)) {
      return "none";
    }

    if (isApartmentRentOverdue(apartment, allPayments)) {
      return "rent-overdue";
    }

    const highestPriorityRequest = getHighestPriorityRequest(
      apartment,
      maintenanceRows,
      tenantRequests
    );

    if (!highestPriorityRequest) {
      return "none";
    }

    return highestPriorityRequest.typeId;
  }

  function isApartmentRented(apartment) {
    return isApartmentOccupied(apartment);
  }

  function editBuilding(buildingId) {
    window.location.href = `owner_edit.html?buildingId=${encodeURIComponent(
      buildingId
    )}&mode=edit`;
  }

  async function deleteBuilding(buildingId) {
    const confirmed = confirm(
      "هل أنت متأكد من حذف العمارة؟ سيتم حذف جميع الشقق والبيانات المرتبطة بها."
    );
    if (!confirmed) return;

    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const t = await res.text();
        alert("تعذر حذف العمارة من الخادم: " + (t || res.status));
        return;
      }
    } catch (e) {
      console.warn(e);
      alert("تعذر الاتصال بالخادم لحذف العمارة.");
      return;
    }

    const pins = readPins();
    delete pins[String(buildingId)];
    writePins(pins);

    alert("تم حذف العمارة بنجاح");
    window.location.reload();
  }

  function isBuildingPinned(building) {
    return !!building?.isPinned;
  }

  function toggleBuildingPin(buildingId) {
    const pins = readPins();
    const key = String(buildingId);
    const cur = pins[key];
    if (cur && cur.pinned) {
      delete pins[key];
    } else {
      pins[key] = { pinned: true, pinnedAt: new Date().toISOString() };
    }
    writePins(pins);
    window.location.reload();
  }

  function closeAllBuildingMenus() {
    document.querySelectorAll(".building-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });
  }

  /** One building may have rows keyed by DB id and by legacy `code` — same units twice. */
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

  function getApartmentsForBuilding(buildingId, allApartments) {
    const target = String(buildingId);
    const building = allBuildings.find((item) => String(item.id) === target);
    const buildingCode = building?.code ? String(building.code) : null;

    // Support both old local linkage (building code) and new linkage (building numeric id).
    const filtered = allApartments.filter((apartment) => {
      const apartmentBuildingId = String(apartment.buildingId ?? "");
      return apartmentBuildingId === target || (buildingCode && apartmentBuildingId === buildingCode);
    });
    return dedupeApartmentsByUnit(filtered, target);
  }

  function buildGeneratedApartment(building, apartmentNumber, floorNumber) {
    return {
      id: `${building.id}-A${apartmentNumber}`,
      buildingId: String(building.id),
      buildingName: building.name,
      number: String(apartmentNumber),
      floorNumber: Number(floorNumber) || 1,
      leaseStatus: "vacant",
      status: "فارغة",
      rent: "",
      tenantUserId: null,
      tenantNationalId: null,
      tenantInfo: null,
      contract: null,
      tenantHistory: [],
      createdAt: new Date().toISOString(),
    };
  }

  async function backfillMissingApartmentsFromBuildings(buildings, allApartments, ownerId) {
    const generated = [];

    buildings.forEach((building) => {
      const existing = getApartmentsForBuilding(building.id, allApartments);
      if (existing.length > 0) return;

      const apartmentCount = Number(building.apartmentCount ?? building.apartments_count ?? 0);
      const totalFloors = Number(building.totalFloors ?? building.total_floors ?? 0);

      if (!apartmentCount || apartmentCount < 1 || !totalFloors || totalFloors < 1) return;

      const apartmentsPerFloor = Math.ceil(apartmentCount / totalFloors);
      let currentApartment = 1;

      for (let floor = 1; floor <= totalFloors; floor++) {
        for (let unit = 1; unit <= apartmentsPerFloor; unit++) {
          if (currentApartment > apartmentCount) break;
          generated.push(buildGeneratedApartment(building, currentApartment, floor));
          currentApartment += 1;
        }
      }
    });

    if (generated.length > 0) {
      return [...allApartments, ...generated];
    }

    return allApartments;
  }

  function getMaintNewCountForBuilding(
    buildingId,
    allApartments,
    maintenanceRows
  ) {
    if (readClearedMaintBuildingIds().has(String(buildingId))) {
      return 0;
    }
    const buildingApartments = getApartmentsForBuilding(buildingId, allApartments);
    const aptIds = new Set(
      buildingApartments.map((a) => String(a.apiId ?? a.id))
    );
    return (maintenanceRows || []).filter((m) => {
      if (!aptIds.has(String(m.apartment_id))) return false;
      const st = String(m.status || "").toLowerCase();
      return st === "pending" || st === "new" || st === "open";
    }).length;
  }

  function getStoredNewCountForBuilding(buildingId, allApartments, tenantRequests) {
    const buildingApartments = getApartmentsForBuilding(buildingId, allApartments);
    return (tenantRequests || []).filter((req) => {
      if (String(req.status || "").toLowerCase() === "resolved") return false;
      if (req.ownerSeen) return false;
      return buildingApartments.some((apt) => apartmentMatchesStoredRequest(apt, req));
    }).length;
  }

  function getNewRequestsForBuilding(
    buildingId,
    allApartments,
    maintenanceRows,
    tenantRequests
  ) {
    return (
      getMaintNewCountForBuilding(buildingId, allApartments, maintenanceRows) +
      getStoredNewCountForBuilding(buildingId, allApartments, tenantRequests)
    );
  }

  function getNewRequestsCountForBuilding(
    buildingId,
    allApartments,
    maintenanceRows,
    tenantRequests
  ) {
    return getNewRequestsForBuilding(
      buildingId,
      allApartments,
      maintenanceRows,
      tenantRequests
    );
  }

  function markBuildingRequestsAsSeen(buildingId) {
    if (buildingId == null || buildingId === "") return;
    addClearedMaintBuildingId(buildingId);

    const buildingApts = getApartmentsForBuilding(buildingId, apartments);
    const reqs = loadStoredTenantRequests();
    let changed = false;
    const next = reqs.map((req) => {
      const match =
        String(req.buildingId) === String(buildingId) ||
        buildingApts.some((apt) => apartmentMatchesStoredRequest(apt, req));
      if (!match || req.ownerSeen) return req;
      changed = true;
      return {
        ...req,
        ownerSeen: true,
        ownerSeenAt: new Date().toISOString(),
      };
    });
    if (changed) saveStoredTenantRequests(next);
  }

  function getBuildingSizeClass(apartmentCount) {
    if (apartmentCount > 16) return "size-large";
    if (apartmentCount > 8) return "size-medium";
    return "size-small";
  }

  const currentUser = WalajnaAuth.getCurrentUser();
  const payments = [];

  if (!currentUser) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لم يتم العثور على المستخدم الحالي";
    }
    return;
  }

  const [allBuildings, fetchedApartments, maintenanceRows] = await Promise.all([
    getServerBuildings(),
    fetchOwnerApartments(),
    fetchOwnerMaintenance(),
  ]);
  let apartments = fetchedApartments;
  const tenantRequests = loadStoredTenantRequests();

  const ownerBuildingsList = allBuildings.filter(
    (building) =>
      String(building.ownerId ?? building.owner_id ?? "") === String(currentUser.id)
  );

  const didSeed = await seedBuildingsMissingApartments(
    ownerBuildingsList,
    apartments
  );
  if (didSeed) {
    apartments = await fetchOwnerApartments();
  }

  const buildings = ownerBuildingsList.slice().sort((a, b) => {
      const aPinned = !!a.isPinned;
      const bPinned = !!b.isPinned;

      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      if (aPinned && bPinned) {
        const pinnedCompare = (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
        if (pinnedCompare !== 0) return pinnedCompare;
      }

      const aNewCount = getNewRequestsCountForBuilding(
        a.id,
        apartments,
        maintenanceRows,
        tenantRequests
      );
      const bNewCount = getNewRequestsCountForBuilding(
        b.id,
        apartments,
        maintenanceRows,
        tenantRequests
      );

      if (bNewCount !== aNewCount) {
        return bNewCount - aNewCount;
      }

      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  apartments = await backfillMissingApartmentsFromBuildings(
    buildings,
    apartments,
    currentUser.id
  );

  if (!buildings.length) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لا توجد عمائر مرتبطة بهذا المالك";
    }
    return;
  }

  const totalNewRequests = buildings.reduce((sum, building) => {
    return (
      sum +
      getNewRequestsCountForBuilding(
        building.id,
        apartments,
        maintenanceRows,
        tenantRequests
      )
    );
  }, 0);

  if (globalRequestsAlert) {
    if (totalNewRequests > 0) {
      globalRequestsAlert.innerHTML = `يوجد ${totalNewRequests} طلبات جديدة`;
      globalRequestsAlert.style.display = "flex";
    } else {
      globalRequestsAlert.style.display = "none";
    }
  }

  container.innerHTML = buildings
    .map((building) => {
      const buildingApartments = getApartmentsForBuilding(building.id, apartments);

      const newRequestsCount = getNewRequestsCountForBuilding(
        building.id,
        apartments,
        maintenanceRows,
        tenantRequests
      );

      const sizeClass = getBuildingSizeClass(buildingApartments.length);

      const floorsMap = new Map();

      buildingApartments.forEach((apartment) => {
        const floorNumber = Number(apartment.floorNumber || 0);

        if (!floorsMap.has(floorNumber)) {
          floorsMap.set(floorNumber, []);
        }

        floorsMap.get(floorNumber).push(apartment);
      });

      const sortedFloorNumbers = [...floorsMap.keys()].sort((a, b) => b - a);

      const squaresHtml = sortedFloorNumbers
        .map((floorNumber) => {
          const floorApartments = floorsMap.get(floorNumber) || [];

          const sortedFloorApartments = floorApartments.sort((a, b) => {
            const aNum = Number(a.number || 0);
            const bNum = Number(b.number || 0);
            return aNum - bNum;
          });
           const isWide = sortedFloorApartments.length >= 6;
          const floorSquares = sortedFloorApartments
            .map((apartment) => {
              const typeClass = getApartmentStatusClass(
                apartment,
                maintenanceRows,
                payments,
                tenantRequests
              );

              const rentedClass =
                isApartmentRented(apartment) && typeClass === "none"
                  ? "rented"
                  : "";

              return `
                <div
                  class="apartment-square ${typeClass} ${rentedClass}"
                  title="شقة ${apartment.number} - الدور ${floorNumber}">
                </div>
              `;
            })
            .join("");
return `
  <div class="apartment-floor ${isWide ? "wide-floor" : ""}" data-floor="${floorNumber}">
    ${floorSquares}
  </div>
`;
        })
        .join("");

      return `
        <article
          class="building-card ${sizeClass} ${newRequestsCount > 0 ? "has-notifications" : ""} ${isBuildingPinned(building) ? "is-pinned" : ""}"
          data-building-id="${building.id}"
        >
          ${
            newRequestsCount > 0
              ? `<span class="building-notification-badge">${newRequestsCount}</span>`
              : ""
          }

          <div class="building-menu-wrap">
            <button
              type="button"
              class="building-more-btn"
              data-menu-btn="true"
              data-building-id="${building.id}"
              aria-label="خيارات العمارة"
            >
              ⋮
            </button>

            <div class="building-card-menu" data-menu="${building.id}">
              <button
                type="button"
                data-action="toggle-pin-building"
                data-building-id="${building.id}"
              >
                ${building.isPinned ? "إلغاء التثبيت" : "تثبيت العمارة"}
              </button>

              <button
                type="button"
                data-action="edit-building"
                data-building-id="${building.id}"
              >
                تعديل
              </button>

              <button
                type="button"
                class="danger"
                data-action="delete-building"
                data-building-id="${building.id}"
              >
                حذف
              </button>
            </div>
          </div>

          <div class="building-card__head">
            <h3 class="building-title">${building.isPinned ? "📌 " : ""}${building.name}</h3>
            <span class="building-count">${buildingApartments.length} شقة</span>
          </div>

          <div class="apartments-grid">
            ${squaresHtml}
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-menu-btn]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      const menu = document.querySelector(`[data-menu="${buildingId}"]`);
      const isOpen = menu?.classList.contains("is-open");

      closeAllBuildingMenus();

      if (menu && !isOpen) {
        menu.classList.add("is-open");
      }
    });
  });

  document.querySelectorAll('[data-action="toggle-pin-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      toggleBuildingPin(buildingId);
    });
  });

  document.querySelectorAll('[data-action="edit-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      editBuilding(buildingId);
    });
  });

  document.querySelectorAll('[data-action="delete-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      deleteBuilding(buildingId);
    });
  });

  document.querySelectorAll(".building-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".building-menu-wrap")) return;

      const buildingId = card.dataset.buildingId;

      markBuildingRequestsAsSeen(buildingId);

      window.location.href = `owner_building.html?buildingId=${encodeURIComponent(
        buildingId
      )}`;
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".building-menu-wrap")) {
      closeAllBuildingMenus();
    }
  });
});