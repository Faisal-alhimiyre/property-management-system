function wlT(key, params) {
  return window.walajna_language && window.walajna_language.t
    ? window.walajna_language.t(key, params)
    : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await WalajnaAuth.hydrateSession();
  requireAuth();
  requireRole('owner');
  ensureRoleSetup();

  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");
  const globalRequestsAlert = document.getElementById("globalRequestsAlert");
  const portfolioFinanceHomeBtn = document.getElementById("portfolioFinanceHomeBtn");
  const buildingsArchiveBtn = document.getElementById("buildingsArchiveBtn");

  if (portfolioFinanceHomeBtn) {
    portfolioFinanceHomeBtn.addEventListener("click", () => {
      window.location.href = "portfolio_finance.html";
    });
  }
  if (buildingsArchiveBtn) {
    buildingsArchiveBtn.addEventListener("click", () => {
      window.location.href = "owner_archive.html";
    });
  }

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

  const ARCHIVE_KEY = "walajna_buildings_archive";
  const ARCHIVE_LIMIT = 100;

  function readBuildingArchive() {
    try {
      const rows = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function writeBuildingArchive(rows) {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  }

  function toMonthKey(rawDate) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function buildIncomeHistoryFromInstallments(installments) {
    const byMonth = new Map();
    (installments || []).forEach((item) => {
      if (String(item.status || "").toLowerCase() !== "paid") return;
      const k = toMonthKey(item.paid_at || item.paidAt || item.due_date || item.dueDate);
      if (!k) return;
      const amount = Number(item.amount || 0);
      if (!Number.isFinite(amount)) return;
      byMonth.set(k, (byMonth.get(k) || 0) + amount);
    });
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));
  }

  function buildIncomeHistoryByApartment(installments, buildingApartments) {
    const numberByApiId = new Map();
    (buildingApartments || []).forEach((apt) => {
      const aid = apt.apiId ?? apt.id;
      if (aid == null) return;
      numberByApiId.set(String(aid), String(apt.number ?? apt.apartment_number ?? ""));
    });

    const byApartment = new Map();
    (installments || []).forEach((item) => {
      if (String(item.status || "").toLowerCase() !== "paid") return;
      const aptId = item.apartment_id != null ? String(item.apartment_id) : "";
      if (!aptId) return;
      const aptNum = numberByApiId.get(aptId) || aptId;
      const month = toMonthKey(item.paid_at || item.paidAt || item.due_date || item.dueDate);
      if (!month) return;
      const amount = Number(item.amount || 0);
      if (!Number.isFinite(amount)) return;
      if (!byApartment.has(aptNum)) byApartment.set(aptNum, new Map());
      const byMonth = byApartment.get(aptNum);
      byMonth.set(month, (byMonth.get(month) || 0) + amount);
    });

    return Array.from(byApartment.entries()).map(([apartmentNumber, monthMap]) => ({
      apartmentNumber,
      rows: Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, amount]) => ({ month, amount })),
    }));
  }

  async function fetchCostsForApartments(buildingApartments) {
    const out = [];
    const aptIds = [
      ...new Set(
        (buildingApartments || [])
          .map((a) => a.apiId ?? a.id)
          .filter((x) => Number.isFinite(Number(x)))
          .map((x) => Number(x))
      ),
    ];
    if (
      !aptIds.length ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return out;
    }
    for (const apartmentId of aptIds) {
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/costs?apartment_id=${encodeURIComponent(apartmentId)}`,
          { method: "GET" }
        );
        if (!res.ok) continue;
        const rows = await res.json();
        if (Array.isArray(rows)) out.push(...rows);
      } catch {
        // ignore per-apartment fetch errors
      }
    }
    return out;
  }

  function buildMaintenanceHistoryRows(buildingId, buildingApartments, maintenanceRows, costRows) {
    const aptIds = new Set(
      (buildingApartments || [])
        .map((a) => String(a.apiId ?? a.id ?? ""))
        .filter(Boolean)
    );
    const aptNumbersById = new Map(
      (buildingApartments || [])
        .map((a) => [String(a.apiId ?? a.id ?? ""), String(a.number ?? a.apartment_number ?? "")])
        .filter(([id]) => id)
    );

    const maintenanceApiRows = (maintenanceRows || [])
      .filter((item) => {
        const aid = String(item.apartment_id ?? "");
        const bid = String(item.building_id ?? "");
        return (aid && aptIds.has(aid)) || (bid && String(buildingId) === bid);
      })
      .map((item) => ({
        id: item.id ?? null,
        apartmentId: item.apartment_id ?? null,
        apartmentNumber: item.apartment_number ?? aptNumbersById.get(String(item.apartment_id ?? "")) ?? null,
        title: item.title || "",
        description: item.description || "",
        requestType: item.request_type || "maintenance",
        status: item.status || "",
        priority: item.priority || "",
        amount: item.amount ?? item.cost ?? null,
        ownerReply: item.owner_reply || "",
        createdAt: item.created_at || null,
        resolvedAt: item.resolved_at || null,
        source: "maintenance_api",
      }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const costsApiRows = (costRows || []).map((c) => ({
      id: c.id ?? null,
      apartmentId: c.apartment_id ?? null,
      apartmentNumber: aptNumbersById.get(String(c.apartment_id ?? "")) ?? null,
      title: c.cost_type || "maintenance",
      description: c.notes || "",
      requestType: c.cost_type || "maintenance",
      status: c.status || "recorded",
      priority: "",
      amount: c.amount ?? null,
      ownerReply: "",
      createdAt: c.expense_date || c.created_at || null,
      resolvedAt: null,
      source: "costs_api",
    }));

    const localCostsRows = (() => {
      let rows = [];
      try {
        const parsed = JSON.parse(localStorage.getItem("walajna_costs") || "[]");
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        rows = [];
      }
      return rows
        .filter((c) => {
          const aid = String(c.apartmentId ?? "");
          const bid = String(c.buildingId ?? "");
          return (aid && aptIds.has(aid)) || (bid && String(buildingId) === bid);
        })
        .map((c) => ({
          id: c.id ?? null,
          apartmentId: c.apartmentId ?? null,
          apartmentNumber: c.apartmentNumber ?? aptNumbersById.get(String(c.apartmentId ?? "")) ?? null,
          title: c.title || c.category || c.type || "maintenance",
          description: c.description || c.notes || "",
          requestType: c.category || c.type || "maintenance",
          status: "recorded",
          priority: "",
          amount: c.amount ?? null,
          ownerReply: "",
          createdAt: c.date || c.createdAt || null,
          resolvedAt: null,
          source: "costs_local",
        }));
    })();

    return [...maintenanceApiRows, ...costsApiRows, ...localCostsRows];
  }

  async function fetchBuildingInstallments(buildingId) {
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}/installments`,
        { method: "GET" }
      );
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  async function archiveBuildingBeforeDelete(buildingId) {
    const building = buildings.find((b) => String(b.id) === String(buildingId));
    if (!building) return;

    const buildingApartments = getApartmentsForBuilding(buildingId, apartments);
    const costRows = await fetchCostsForApartments(buildingApartments);
    const maintenanceHistory = buildMaintenanceHistoryRows(
      buildingId,
      buildingApartments,
      maintenanceRows,
      costRows
    );
    const installments = await fetchBuildingInstallments(buildingId);
    const incomeHistory = buildIncomeHistoryFromInstallments(installments);
    const incomeHistoryByApartment = buildIncomeHistoryByApartment(installments, buildingApartments);

    const snapshot = {
      archiveId: `b-${buildingId}-${Date.now()}`,
      buildingId: String(building.id),
      archivedAt: new Date().toISOString(),
      building: {
        id: building.id,
        name: building.name,
        city: building.city,
        neighborhood: building.neighborhood || null,
        code: building.code || null,
        apartmentCount: Number(building.apartmentCount ?? building.apartments_count ?? 0),
        totalFloors: Number(building.totalFloors ?? building.total_floors ?? 0),
      },
      apartments: buildingApartments,
      maintenanceHistory,
      incomeHistory,
      incomeHistoryByApartment,
      incomeInstallments: installments,
      totalIncome: incomeHistory.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };

    const archive = readBuildingArchive().filter((x) => String(x.buildingId) !== String(buildingId));
    archive.unshift(snapshot);
    writeBuildingArchive(archive.slice(0, ARCHIVE_LIMIT));
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
          neighborhood: building.neighborhood ?? "",
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

  /** Drop browser copies of server buildings that no longer exist (after DELETE on another tab/session). */
  function pruneStaleLocalBuildingsForOwner(serverRows, ownerId) {
    const ownerStr = String(ownerId ?? "");
    if (!ownerStr) return;

    const serverIds = new Set(
      (Array.isArray(serverRows) ? serverRows : []).map((b) => String(b.id))
    );

    let raw = [];
    try {
      raw = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
    } catch {
      return;
    }
    if (!Array.isArray(raw) || !raw.length) return;

    const removedIds = new Set();
    const kept = raw.filter((b) => {
      const oid = String(b.ownerId ?? b.owner_id ?? "");
      if (oid !== ownerStr) return true;

      const lid = String(b.id ?? "").trim();
      if (!lid || !/^\d+$/.test(lid)) return true;
      if (serverIds.has(lid)) return true;

      removedIds.add(lid);
      const code = String(b.code ?? "").trim();
      if (code) removedIds.add(code);
      return false;
    });

    if (kept.length === raw.length) return;

    localStorage.setItem("walajna_buildings", JSON.stringify(kept));

    if (!removedIds.size) return;

    let apts = [];
    try {
      apts = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
    } catch {
      apts = [];
    }
    if (!Array.isArray(apts) || !apts.length) return;

    const keptApts = apts.filter((a) => {
      const bld = String(a.buildingId ?? a.building_id ?? "").trim();
      return !removedIds.has(bld);
    });
    if (keptApts.length !== apts.length) {
      localStorage.setItem("walajna_apartments", JSON.stringify(keptApts));
    }

    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.getSessionList) {
      const session = WalajnaApartmentsApi.getSessionList();
      const filtered = session.filter((a) => {
        const bld = String(a.buildingId ?? a.building_id ?? "").trim();
        return !removedIds.has(bld);
      });
      if (filtered.length !== session.length && WalajnaApartmentsApi.persistSessionList) {
        WalajnaApartmentsApi.persistSessionList(filtered);
      }
    }
  }

  function removeBuildingFromLocalCache(buildingId) {
    const idStr = String(buildingId ?? "").trim();
    if (!idStr) return;

    let buildings = [];
    try {
      buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
    } catch {
      buildings = [];
    }
    if (Array.isArray(buildings)) {
      const removedCodes = new Set();
      const filtered = buildings.filter((b) => {
        const bid = String(b.id ?? "").trim();
        const code = String(b.code ?? "").trim();
        if (bid === idStr || (code && code === idStr)) {
          if (code) removedCodes.add(code);
          return false;
        }
        return true;
      });
      localStorage.setItem("walajna_buildings", JSON.stringify(filtered));

      let apts = [];
      try {
        apts = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
      } catch {
        apts = [];
      }
      if (Array.isArray(apts)) {
        const idsToDrop = new Set([idStr, ...removedCodes]);
        const filteredApts = apts.filter((a) => {
          const bld = String(a.buildingId ?? a.building_id ?? "").trim();
          return !idsToDrop.has(bld);
        });
        localStorage.setItem("walajna_apartments", JSON.stringify(filteredApts));

        if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.getSessionList) {
          const session = WalajnaApartmentsApi.getSessionList();
          const filteredSession = session.filter((a) => {
            const bld = String(a.buildingId ?? a.building_id ?? "").trim();
            return !idsToDrop.has(bld);
          });
          if (
            filteredSession.length !== session.length &&
            WalajnaApartmentsApi.persistSessionList
          ) {
            WalajnaApartmentsApi.persistSessionList(filteredSession);
          }
        }
      }
    }
  }

  /**
   * The home page lists GET /api/buildings only. If create failed (schema/network) the form still
   * saves to walajna_buildings and redirects — merge those rows so the owner still sees them.
   * ownerId must match session user (see owner-edit using WalajnaAuth.getCurrentUser).
   */
  function mergeLocalBuildingsForOwner(serverRows, ownerId) {
    const ownerStr = String(ownerId ?? "");
    if (!ownerStr) return serverRows;

    let raw = [];
    try {
      raw = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
    } catch {
      raw = [];
    }
    if (!Array.isArray(raw) || !raw.length) return serverRows;

    const pins = readPins();
    const serverIds = new Set(serverRows.map((b) => String(b.id)));
    const serverCodes = new Set(
      serverRows
        .map((b) => String((b.code ?? "") || "").trim())
        .filter(Boolean)
    );

    const extras = [];
    for (const b of raw) {
      const oid = String(b.ownerId ?? b.owner_id ?? "");
      if (oid !== ownerStr) continue;

      const lid = String(b.id ?? "").trim();
      const lcode = String(b.code ?? "").trim();

      if (lid && serverIds.has(lid)) continue;
      if (lcode && serverCodes.has(lcode)) continue;
      if (lid && serverCodes.has(lid)) continue;

      extras.push({
        ...b,
        id: b.id,
        owner_id: b.ownerId ?? b.owner_id ?? ownerId,
        ownerId: b.ownerId ?? b.owner_id ?? ownerId,
        name: b.name,
        city: b.city ?? "",
        neighborhood: b.neighborhood ?? "",
        code: b.code ?? null,
        apartmentCount: Number(b.apartmentCount ?? b.apartments_count ?? 0),
        apartments_count: Number(b.apartments_count ?? b.apartmentCount ?? 0),
        totalFloors: b.totalFloors ?? b.total_floors ?? null,
        total_floors: b.total_floors ?? b.totalFloors ?? null,
        createdAt: b.createdAt ?? b.created_at ?? null,
        created_at: b.created_at ?? b.createdAt ?? null,
        isPinned: !!(pins[String(b.id)] && pins[String(b.id)].pinned),
        pinnedAt: pins[String(b.id)]?.pinnedAt ?? null,
      });
    }

    if (!extras.length) return serverRows;
    return [...serverRows, ...extras];
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

  /** After unit-layout, session may hold room counts before the next list GET reflects them. */
  function overlaySessionRoomCountsOntoOwnerApartments(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (
      typeof WalajnaApartmentsApi === "undefined" ||
      typeof WalajnaApartmentsApi.getSessionList !== "function"
    ) {
      return list;
    }
    const session = WalajnaApartmentsApi.getSessionList();
    if (!Array.isArray(session) || !session.length) return list;

    const sessionById = new Map(
      session.filter((s) => s && s.id != null).map((s) => [String(s.id), s])
    );

    const roomSum = (o) =>
      (Number(o?.bedrooms) || 0) +
      (Number(o?.bathrooms) || 0) +
      (Number(o?.livingRooms ?? o?.living_rooms) || 0);

    return list.map((row) => {
      const s = sessionById.get(String(row.id));
      if (!s) return row;
      if (roomSum(s) <= roomSum(row)) return row;
      return {
        ...row,
        bedrooms: s.bedrooms != null ? Number(s.bedrooms) : row.bedrooms,
        bathrooms: s.bathrooms != null ? Number(s.bathrooms) : row.bathrooms,
        livingRooms:
          s.livingRooms != null
            ? Number(s.livingRooms)
            : s.living_rooms != null
              ? Number(s.living_rooms)
              : row.livingRooms,
      };
    });
  }

  async function fetchOwnerApartments() {
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments`,
        { method: "GET" }
      );
      if (!res.ok) return [];
      const rows = await res.json();
      const mapped = (Array.isArray(rows) ? rows : [])
        .map(mapApiApartmentToDashboard)
        .filter(Boolean);
      return overlaySessionRoomCountsOntoOwnerApartments(mapped);
    } catch {
      return [];
    }
  }

  function mapApiApartmentToDashboard(apt) {
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
      leaseStatus: apt.lease_status || apt.leaseStatus || "vacant",
      rent: apt.rent,
      tenantUserId: apt.tenant_user_id ?? null,
      tenantNationalId: apt.tenant_national_id ?? null,
      tenantInfo: apt.tenant_info || null,
      currentContractId: apt.current_contract_id ?? null,
      contractId: apt.current_contract_id ?? null,
      contract: apt.current_contract_id
        ? { id: apt.current_contract_id }
        : null,
      maintenanceId: apt.maintenance_id ?? null,
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
          address: wlT("tenant.home.aptLine", { name: buildingInfo.name, num: apartmentNumber }),
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
      const rt = String(m.request_type || "maintenance").toLowerCase();
      if (rt !== "maintenance") return false;
      const st = String(m.status || "").toLowerCase();
      return st !== "resolved" && st !== "closed";
    });
  }

  function getOpenNonMaintenanceRequestsForApartment(apartment, maintenanceRows) {
    const aid = String(apartment.apiId ?? apartment.id ?? "");
    if (!aid) return [];
    return (maintenanceRows || []).filter((m) => {
      if (String(m.apartment_id) !== aid) return false;
      const rt = String(m.request_type || "maintenance").toLowerCase();
      if (rt === "maintenance") return false;
      const st = String(m.status || "").toLowerCase();
      return st !== "resolved" && st !== "closed";
    });
  }

  function getHighestPriorityRequest(apartment, maintenanceRows) {
    const open = [];
    if (getOpenMaintenanceForApartment(apartment, maintenanceRows).length) {
      open.push({ typeId: "maintenance" });
    }
    getOpenNonMaintenanceRequestsForApartment(apartment, maintenanceRows).forEach((m) => {
      const rt = String(m.request_type || "request").toLowerCase();
      open.push({ typeId: rt || "request" });
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

  function getApartmentStatusClass(apartment, maintenanceRows, allPayments) {
    if (!isApartmentOccupied(apartment)) {
      return "none";
    }

    if (isApartmentRentOverdue(apartment, allPayments)) {
      return "rent-overdue";
    }

    const highestPriorityRequest = getHighestPriorityRequest(apartment, maintenanceRows);

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
    const confirmed = confirm(wlT("owner.confirmDeleteBuilding"));
    if (!confirmed) return;

    await archiveBuildingBeforeDelete(buildingId);

    const idStr = String(buildingId ?? "").trim();
    const isNumericServerId = /^\d+$/.test(idStr);

    if (isNumericServerId) {
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}`,
          { method: "DELETE" }
        );
        if (!res.ok && res.status !== 404) {
          const t = await res.text();
          alert("تعذر حذف العمارة من الخادم: " + (t || res.status));
          return;
        }
      } catch (e) {
        console.warn(e);
        alert("تعذر الاتصال بالخادم لحذف العمارة.");
        return;
      }
    }

    removeBuildingFromLocalCache(buildingId);

    const pins = readPins();
    delete pins[String(buildingId)];
    writePins(pins);

    alert(wlT("owner.buildingArchived"));
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
    const building = ownerBuildingsList.find((item) => String(item.id) === target);
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
      status: wlT("lease.status.vacant"),
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

  function getNewRequestsCountForBuilding(buildingId, allApartments, maintenanceRows) {
    const buildingApartments = getApartmentsForBuilding(buildingId, allApartments);
    const aptIds = new Set(
      buildingApartments
        .map((a) => String(a.apiId ?? a.id))
        .filter((x) => x && x !== "undefined")
    );
    if (!aptIds.size) return 0;
    return (maintenanceRows || []).filter((m) => {
      if (!aptIds.has(String(m.apartment_id))) return false;
      if (m.owner_seen) return false;
      const st = String(m.status || "").toLowerCase();
      if (st === "resolved" || st === "closed") return false;
      return true;
    }).length;
  }

  async function markBuildingRequestsAsSeen(buildingId) {
    if (buildingId == null || buildingId === "") return;
    try {
      if (
        typeof WalajnaTenantRequests !== "undefined" &&
        WalajnaTenantRequests.markOwnerSeenBuilding
      ) {
        await WalajnaTenantRequests.markOwnerSeenBuilding(buildingId);
      }
    } catch (e) {
      console.warn("[owner] mark owner seen", e);
    }
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
      emptyState.textContent = wlT("owner.userNotFound");
    }
    return;
  }

  const [allBuildingsRaw, fetchedApartments, maintenanceRows] = await Promise.all([
    getServerBuildings(),
    fetchOwnerApartments(),
    fetchOwnerMaintenance(),
  ]);
  pruneStaleLocalBuildingsForOwner(allBuildingsRaw, currentUser.id);
  const allBuildings = mergeLocalBuildingsForOwner(allBuildingsRaw, currentUser.id);
  let apartments = fetchedApartments;

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
        maintenanceRows
      );
      const bNewCount = getNewRequestsCountForBuilding(
        b.id,
        apartments,
        maintenanceRows
      );

      if (bNewCount !== aNewCount) {
        return bNewCount - aNewCount;
      }

      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  apartments = overlaySessionRoomCountsOntoOwnerApartments(
    await backfillMissingApartmentsFromBuildings(buildings, apartments, currentUser.id)
  );

  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.persistSessionList) {
    WalajnaApartmentsApi.persistSessionList(apartments);
  }

  if (!buildings.length) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = wlT("owner.noBuildingsForOwner");
    }
    return;
  }

  const totalNewRequests = buildings.reduce((sum, building) => {
    return (
      sum +
      getNewRequestsCountForBuilding(
        building.id,
        apartments,
        maintenanceRows
      )
    );
  }, 0);

  if (globalRequestsAlert) {
    if (totalNewRequests > 0) {
      globalRequestsAlert.innerHTML = wlT("owner.newRequests", { n: totalNewRequests });
      globalRequestsAlert.style.display = "flex";
    } else {
      globalRequestsAlert.style.display = "none";
    }
  }

  const selectedBuildingIds = new Set();
  let showOnlySelectedMode = false;

  function normalizeArabicSearchText(raw) {
    return String(raw || "")
      .replace(/[\u0640]/g, "")
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .trim()
      .toLowerCase();
  }

  /** Unique حي names from the owner’s buildings (from map geocode), for the dropdown only. */
  function distinctNeighborhoodLabels(buildingList) {
    const byNorm = new Map();
    for (const b of buildingList || []) {
      const raw = String(b.neighborhood ?? "").trim();
      if (!raw) continue;
      const key = normalizeArabicSearchText(raw);
      if (!key) continue;
      if (!byNorm.has(key)) byNorm.set(key, raw);
    }
    return Array.from(byNorm.values()).sort((a, b) => a.localeCompare(b, "ar"));
  }

  function populateOwnerNeighborhoodSelect(selectEl, buildingList) {
    if (!selectEl) return;
    const previous = selectEl.value;
    const labels = distinctNeighborhoodLabels(buildingList);
    selectEl.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "كل الأحياء";
    selectEl.appendChild(optAll);
    for (const label of labels) {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      selectEl.appendChild(o);
    }
    if (previous && [...selectEl.options].some((opt) => opt.value === previous)) {
      selectEl.value = previous;
    } else {
      selectEl.value = "";
    }
  }

  function buildingMatchesNeighborhoodChoice(building, selectedLabel) {
    const sel = String(selectedLabel || "").trim();
    if (!sel) return true;
    return (
      normalizeArabicSearchText(building.neighborhood || "") ===
      normalizeArabicSearchText(sel)
    );
  }

  function buildingHasOpenRequestFilter(buildingId, typeFilter) {
    if (!typeFilter || typeFilter === "all") return true;
    const apts = getApartmentsForBuilding(buildingId, apartments);
    const aptIds = new Set(
      apts
        .map((a) => String(a.apiId ?? a.id ?? ""))
        .filter((id) => id && id !== "undefined")
    );
    const bidStr = String(buildingId);

    const openRows = (maintenanceRows || []).filter((m) => {
      const st = String(m.status || "").toLowerCase();
      if (st === "resolved" || st === "closed") return false;
      const aid = m.apartment_id != null ? String(m.apartment_id) : "";
      const mbid = m.building_id != null ? String(m.building_id) : "";
      if (mbid && mbid === bidStr) return true;
      if (aid && aptIds.has(aid)) return true;
      return false;
    });

    if (typeFilter === "any_open") return openRows.length > 0;

    if (typeFilter === "maintenance") {
      return openRows.some(
        (m) => String(m.request_type || "maintenance").toLowerCase() === "maintenance"
      );
    }

    return openRows.some(
      (m) => String(m.request_type || "").toLowerCase() === String(typeFilter).toLowerCase()
    );
  }

  function getOwnerNeighborhoodAndRequestFilterValues() {
    const neighborhoodFilterSelect = document.getElementById("ownerBuildingsNeighborhoodFilter");
    const requestFilterSelect = document.getElementById("ownerBuildingsRequestFilter");
    return {
      neighborhoodChoice: neighborhoodFilterSelect?.value || "",
      requestFilter: requestFilterSelect?.value || "all",
    };
  }

  /** True when user narrowed results (حي or طلبات), so pick UI is shown. */
  function isOwnerBuildingSearchActive() {
    const { neighborhoodChoice, requestFilter } = getOwnerNeighborhoodAndRequestFilterValues();
    return neighborhoodChoice.trim() !== "" || requestFilter !== "all";
  }

  function syncOwnerPickUiVisibility() {
    const containerEl = document.getElementById("buildingsContainer");
    const visible = showOnlySelectedMode || isOwnerBuildingSearchActive();
    if (containerEl) {
      containerEl.classList.toggle("is-owner-pick-active", visible);
    }
  }

  function computeOwnerBuildingsFilterList() {
    const { neighborhoodChoice, requestFilter } = getOwnerNeighborhoodAndRequestFilterValues();
    return buildings.filter(
      (b) =>
        buildingMatchesNeighborhoodChoice(b, neighborhoodChoice) &&
        buildingHasOpenRequestFilter(b.id, requestFilter)
    );
  }

  function computeOwnerBuildingsDisplayList() {
    if (showOnlySelectedMode) {
      return buildings.filter((b) => selectedBuildingIds.has(String(b.id)));
    }
    return computeOwnerBuildingsFilterList();
  }

  function updateSelectionToolbar() {
    const showBtn = document.getElementById("ownerShowSelectedOnlyBtn");
    const backBtn = document.getElementById("ownerBackToFilterViewBtn");
    const actionsWrap = document.getElementById("ownerBuildingsFilterPickActions");
    if (!showBtn || !backBtn) return;

    const pickVisible = showOnlySelectedMode || isOwnerBuildingSearchActive();
    if (actionsWrap) {
      actionsWrap.hidden = !pickVisible;
    }

    if (showOnlySelectedMode) {
      showBtn.hidden = true;
      backBtn.hidden = false;
    } else {
      showBtn.hidden = false;
      backBtn.hidden = true;
      showBtn.disabled = selectedBuildingIds.size === 0;
    }
  }

  function refreshOwnerBuildingsView() {
    syncOwnerPickUiVisibility();
    const list = computeOwnerBuildingsDisplayList();
    updateOwnerBuildingsCountDisplay(list.length);
    updateSelectionToolbar();
    renderBuildingCards(list);
  }

  function applyOwnerBuildingFilters() {
    showOnlySelectedMode = false;
    refreshOwnerBuildingsView();
  }

  function createBuildingCardHtml(building) {
    const bid = String(building.id);
    const isChecked = selectedBuildingIds.has(bid);
    const selectAria = String(wlT("owner.buildingsSelectForListAria")).replace(/"/g, "&quot;");

    const buildingApartments = getApartmentsForBuilding(building.id, apartments);

    const newRequestsCount = getNewRequestsCountForBuilding(
      building.id,
      apartments,
      maintenanceRows
    );

    const sizeClass = getBuildingSizeClass(buildingApartments.length);

    const layoutComplete =
      typeof WalajnaApartmentsApi !== "undefined" &&
      WalajnaApartmentsApi.isBuildingUnitLayoutComplete
        ? WalajnaApartmentsApi.isBuildingUnitLayoutComplete(building, buildingApartments)
        : true;
    const layoutBanner = !layoutComplete
      ? `<div class="building-card__layout-banner" role="status">${String(
          wlT("building.completeLayoutBanner")
        )
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</div>`
      : "";

    let squaresHtml = "";
    if (layoutComplete) {
      const floorsMap = new Map();

      buildingApartments.forEach((apartment) => {
        const floorNumber = Number(apartment.floorNumber || 0);

        if (!floorsMap.has(floorNumber)) {
          floorsMap.set(floorNumber, []);
        }

        floorsMap.get(floorNumber).push(apartment);
      });

      const sortedFloorNumbers = [...floorsMap.keys()].sort((a, b) => b - a);

      squaresHtml = sortedFloorNumbers
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
                payments
              );

              const rentedClass =
                isApartmentRented(apartment) && typeClass === "none"
                  ? "rented"
                  : "";

              return `
                <div
                  class="apartment-square ${typeClass} ${rentedClass}"
                  title="${String(wlT("owner.aptTitle", { n: apartment.number, f: floorNumber }))
                    .replace(/&/g, "&amp;")
                    .replace(/"/g, "&quot;")}">
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
    }

    return `
        <article
          class="building-card ${sizeClass} ${newRequestsCount > 0 ? "has-notifications" : ""} ${isBuildingPinned(building) ? "is-pinned" : ""} ${isChecked ? "is-multi-selected" : ""}"
          data-building-id="${building.id}"
        >
          <label class="building-card-select-wrap">
            <input
              type="checkbox"
              class="building-card-select"
              data-building-id="${building.id}"
              ${isChecked ? "checked" : ""}
              aria-label="${selectAria}"
            />
          </label>
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
              aria-label="${String(wlT("owner.buildingMenu")).replace(/"/g, "&quot;")}"
            >
              ⋮
            </button>

            <div class="building-card-menu" data-menu="${building.id}">
              <button
                type="button"
                data-action="toggle-pin-building"
                data-building-id="${building.id}"
              >
                ${building.isPinned ? wlT("owner.unpin") : wlT("owner.pin")}
              </button>

              <button
                type="button"
                data-action="edit-building"
                data-building-id="${building.id}"
              >
                ${wlT("common.edit")}
              </button>

              <button
                type="button"
                class="danger"
                data-action="delete-building"
                data-building-id="${building.id}"
              >
                ${wlT("common.delete")}
              </button>
            </div>
          </div>

          <div class="building-card__head">
            <h3 class="building-title">${building.isPinned ? "📌 " : ""}${building.name}</h3>
            <span class="building-count">${wlT("owner.aptCountLabel", { n: buildingApartments.length })}</span>
          </div>
          ${layoutBanner}

          ${
            layoutComplete && squaresHtml
              ? `<div class="apartments-grid">${squaresHtml}</div>`
              : ""
          }
        </article>
      `;
  }

  function bindBuildingCardEvents() {
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

    document.querySelectorAll(".building-card-select").forEach((input) => {
      input.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const id = String(input.dataset.buildingId ?? "");
        if (!id) return;
        if (input.checked) {
          selectedBuildingIds.add(id);
        } else {
          selectedBuildingIds.delete(id);
        }
        const card = input.closest(".building-card");
        if (card) {
          card.classList.toggle("is-multi-selected", input.checked);
        }
        updateSelectionToolbar();
        if (showOnlySelectedMode) {
          if (selectedBuildingIds.size === 0) {
            showOnlySelectedMode = false;
          }
          refreshOwnerBuildingsView();
        }
      });
    });

    document.querySelectorAll(".building-card").forEach((card) => {
      card.addEventListener("click", async (event) => {
        if (event.target.closest(".building-menu-wrap")) return;
        if (event.target.closest(".building-card-select-wrap")) return;

        const buildingId = card.dataset.buildingId;

        await markBuildingRequestsAsSeen(buildingId);

        window.location.href = `owner_building.html?buildingId=${encodeURIComponent(
          buildingId
        )}`;
      });
    });
  }

  function renderBuildingCards(list) {
    if (!list.length) {
      container.innerHTML = "";
      const p = document.createElement("p");
      p.className = "buildings-filter-empty";
      p.setAttribute("dir", "rtl");
      p.textContent = wlT("owner.buildingsFilterEmpty");
      container.appendChild(p);
      return;
    }
    container.innerHTML = list.map(createBuildingCardHtml).join("");
    bindBuildingCardEvents();
  }

  function updateOwnerBuildingsCountDisplay(visibleCount) {
    const el = document.getElementById("ownerBuildingsCount");
    if (!el) return;
    const total = buildings.length;
    const v = Math.max(0, Number(visibleCount) || 0);
    const text = v === total ? String(total) : `${total}/${v}`;
    el.textContent = text;
  }

  const neighborhoodFilterSelect = document.getElementById("ownerBuildingsNeighborhoodFilter");
  populateOwnerNeighborhoodSelect(neighborhoodFilterSelect, buildings);
  refreshOwnerBuildingsView();

  const requestFilterSelect = document.getElementById("ownerBuildingsRequestFilter");
  if (neighborhoodFilterSelect) {
    neighborhoodFilterSelect.addEventListener("change", applyOwnerBuildingFilters);
  }
  if (requestFilterSelect) {
    requestFilterSelect.addEventListener("change", applyOwnerBuildingFilters);
  }

  document.getElementById("ownerShowSelectedOnlyBtn")?.addEventListener("click", () => {
    if (selectedBuildingIds.size === 0) {
      alert(wlT("owner.buildingsPickEmptyFiltered"));
      return;
    }
    showOnlySelectedMode = true;
    refreshOwnerBuildingsView();
  });
  document.getElementById("ownerBackToFilterViewBtn")?.addEventListener("click", () => {
    showOnlySelectedMode = false;
    refreshOwnerBuildingsView();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".building-menu-wrap")) {
      closeAllBuildingMenus();
    }
  });
});