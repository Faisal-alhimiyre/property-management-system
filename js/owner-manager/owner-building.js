document.addEventListener("DOMContentLoaded", async () => {
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
  const portfolioFinanceBtn = document.getElementById("portfolioFinanceBtn");

  if (!grid) return;

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
    if (title) title.textContent = T("building.notFound");
    return;
  }

  let building = null;
  let apartments = [];
  let maintenanceRows = [];
  let apartmentsFromApi = false;

  let payments = [];
  let apiLoadError = null;
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  function mapApiApartmentToLocal(apt) {
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
      contract: apt.current_contract_id ? { id: apt.current_contract_id } : null,
      maintenanceId: apt.maintenance_id ?? null,
    };
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof requireAuth === "function") requireAuth();
  if (typeof requireRole === "function") requireRole("owner");

  function expectedSlotsFromBuilding(b) {
    if (!b) return 0;
    return Number(b.apartments_count ?? b.apartmentCount ?? 0);
  }

  try {
    const [bRes, aRes, mRes] = await Promise.all([
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/buildings`, { method: "GET" }),
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/apartments`, { method: "GET" }),
      WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/maintenance`, { method: "GET" }),
    ]);

    if (bRes.ok) {
      const buildings = await bRes.json();
      const raw = buildings.find((b) => String(b.id) === String(buildingId)) || null;
      if (raw) {
        building = {
          ...raw,
          apartmentCount: raw.apartmentCount ?? raw.apartments_count ?? 0,
          totalFloors: raw.totalFloors ?? raw.total_floors ?? null,
        };
      }
    }

    if (aRes.ok) {
      const all = await aRes.json();
      const rows = Array.isArray(all) ? all : [];
      const mappedAll = rows
        .map((row) =>
          typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mapApiRowToClient
            ? WalajnaApartmentsApi.mapApiRowToClient(row)
            : mapApiApartmentToLocal(row)
        )
        .filter(Boolean);
      if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.persistSessionList) {
        WalajnaApartmentsApi.persistSessionList(mappedAll);
      }
      apartments = mappedAll.filter((a) => String(a.buildingId) === String(buildingId));
      apartmentsFromApi = true;
    }

    if (mRes.ok) {
      maintenanceRows = await mRes.json();
    }

    const expectedUnits = expectedSlotsFromBuilding(building);
    if (apartments.length === 0 && building && expectedUnits > 0) {
      await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}/seed-apartments`,
        { method: "POST" }
      );
      const aRes2 = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments`,
        { method: "GET" }
      );
      if (aRes2.ok) {
        const all = await aRes2.json();
        const rows = Array.isArray(all) ? all : [];
        const mappedAll = rows
          .map((row) =>
            typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.mapApiRowToClient
              ? WalajnaApartmentsApi.mapApiRowToClient(row)
              : mapApiApartmentToLocal(row)
          )
          .filter(Boolean);
        if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.persistSessionList) {
          WalajnaApartmentsApi.persistSessionList(mappedAll);
        }
        apartments = mappedAll.filter((a) => String(a.buildingId) === String(buildingId));
        apartmentsFromApi = true;
      }
    }
  } catch (e) {
    apiLoadError = e;
    apartmentsFromApi = false;
    building = null;
    apartments = [];
    maintenanceRows = [];
    console.warn("owner-building API load failed (no local fallback)", e);
  }

  if (building && title) {
    title.textContent = building.name;
  } else if (title) {
    title.textContent = T("building.notFound");
  }

  if (typeof WalajnaPaymentsApi !== "undefined" && WalajnaPaymentsApi.listMapped) {
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
    window.location.href = `finance_summary.html?buildingId=${encodeURIComponent(buildingId)}`;
  }

  function openPortfolioFinance() {
    if (!buildingId) return;
    window.location.href = `portfolio_finance.html?refBuildingId=${encodeURIComponent(buildingId)}`;
  }

  if (financeBtn) {
    financeBtn.addEventListener("click", openFinanceSummary);
  }

  if (portfolioFinanceBtn) {
    portfolioFinanceBtn.addEventListener("click", openPortfolioFinance);
  }

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
    const target = String(buildingId);
    const code = building?.code ? String(building.code) : null;
    const filtered = apartments.filter((a) => {
      const apartmentBuildingId = String(a.buildingId ?? "");
      return apartmentBuildingId === target || (code && apartmentBuildingId === code);
    });
    return dedupeApartmentsByUnit(filtered, target);
  }

  function buildGeneratedApartment(apartmentNumber, floorNumber) {
    return {
      id: `${buildingId}-A${apartmentNumber}`,
      buildingId: String(buildingId),
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

  const buildingApartments = ensureApartmentsExist();

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
    return !!(
      apartment?.tenantUserId ||
      apartment?.tenantNationalId ||
      apartment?.tenantInfo?.fullName ||
      apartment?.tenantInfo?.phoneNumber ||
      apartment?.tenantInfo?.nationality ||
      apartment?.tenantInfo?.tenantType ||
      apartment?.contract?.id ||
      apartment?.contract?.startDate ||
      apartment?.contract?.endDate ||
      apartment?.contract?.rentAmount ||
      apartment?.contract?.paymentCycle ||
      apartment?.contract?.meterNumber
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
        await WalajnaTenantRequests.markOwnerSeenBuilding(buildingId);
      }
    } catch (e) {
      console.warn("[owner-building] mark owner seen", e);
    }
  }

  void markOwnerAcknowledgedBuildingOnHome();

  function getOpenRequests(apartment) {
    const fromMaint = getOpenMaintenanceForApartment(apartment).map((m) => ({
      typeId: "maintenance",
      typeTitle: canonicalBadgeLabel("maintenance"),
      typeColor: "#f59e0b",
      status: m.status,
    }));
    const fromStored = getOpenNonMaintenanceRequestsForApartment(apartment);
    const byType = new Map();
    [...fromMaint, ...fromStored].forEach((r) => {
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

  function isApartmentRentOverdue(apartment) {
    const ls = String(
      apartment.leaseStatus ?? apartment.lease_status ?? ""
    ).toLowerCase();
    if (ls === "overdue") {
      return true;
    }

    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!currentContractId) return false;

    // API apartments use server-reconciled lease_status + payment_installments; ignore stale localStorage.
    if (apartmentsFromApi) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return payments.some((payment) => {
      if (
        payment.apartmentId != null &&
        String(payment.apartmentId) !== "" &&
        String(payment.apartmentId) !== String(apartment.id)
      ) {
        return false;
      }
      const pc =
        payment.contractId != null && String(payment.contractId) !== ""
          ? String(payment.contractId)
          : "";
      const cc = String(currentContractId);
      if (pc && pc !== cc) return false;
      if (payment.status === "paid" || payment.status === "cancelled") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;

      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });
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

  function saveApartmentEdit() {
    if (!selectedApartmentId) return;

    const formData = readEditFormData();
    const validationMessage = validateEditFormData(formData);

    showError("");

    if (validationMessage) {
      showError(validationMessage);
      return;
    }

    const updatedApartments = apartments.map((apt) => {
      if (String(apt.id) !== String(selectedApartmentId)) return apt;

      const oldContract = apt.contract || {};
      const oldTenantInfo = apt.tenantInfo || {};

      const hasTenantData =
        formData.fullName ||
        formData.nationalId ||
        formData.nationality ||
        formData.tenantType ||
        formData.phone;

      return {
        ...apt,
        rent: formData.rent ? Number(formData.rent) : "",
        floorNumber: formData.floorNumber ? Number(formData.floorNumber) : null,
        roomsCount: formData.roomsCount ? Number(formData.roomsCount) : null,
        bathroomsCount: formData.bathroomsCount ? Number(formData.bathroomsCount) : null,
        livingRoomsCount: formData.livingRoomsCount ? Number(formData.livingRoomsCount) : null,

        tenantNationalId: formData.nationalId || null,

        tenantInfo: hasTenantData
          ? {
              fullName: formData.fullName || "",
              phoneNumber: formData.phone || "",
              nationality: formData.nationality || "",
              tenantType: formData.tenantType || "",
            }
          : oldTenantInfo,

        contract: {
          ...oldContract,
          startDate: formData.startDate || "",
          endDate: formData.endDate || "",
          rentAmount: formData.rent ? Number(formData.rent) : Number(oldContract.rentAmount || 0),
          paymentCycle: formData.paymentCycle || apt.paymentDefaults?.paymentCycle || "monthly",
          installmentsCount: formData.installmentsCount ? Number(formData.installmentsCount) : Number(oldContract.installmentsCount || 0),
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

  const confirmed = confirm(T("building.confirmVacate"));
  if (!confirmed) return;

  const authed =
    typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser?.();
  if (authed && typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.vacateTenant) {
    const apiId =
      apartment.apiId != null ? Number(apartment.apiId) : Number(apartment.id);
    if (Number.isFinite(apiId)) {
      try {
        await WalajnaApartmentsApi.vacateTenant(apiId);
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
    if (!apartment) return 0;

    const apartmentId = apartment.id;
    const currentContractId = getApartmentCurrentContractId(apartment);

    return costs
      .filter((cost) => {
        if (String(cost.apartmentId) !== String(apartmentId)) return false;

        // إذا التكلفة مربوطة بعقد، لازم تطابق العقد الحالي
        if (cost.contractId && currentContractId) {
          if (String(cost.contractId) !== String(currentContractId)) {
            return false;
          }
        }

        const rawDate = cost.date || cost.createdAt;
        if (!rawDate) return false;

        const costDate = new Date(rawDate);
        if (Number.isNaN(costDate.getTime())) return false;

        return costDate >= rangeStart && costDate <= rangeEnd;
      })
      .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  }

  function getBuildingFinancialSummary() {
    const today = new Date();
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);

    const monthlyIncome = buildingApartments.reduce((sum, apartment) => {
      return sum + getApartmentRealizedIncomeForRange(
        apartment,
        currentMonthStart,
        currentMonthEnd
      );
    }, 0);

    const expenses = buildingApartments.reduce((sum, apartment) => {
      return sum + getApartmentExpensesForRange(
        apartment,
        currentMonthStart,
        currentMonthEnd
      );
    }, 0);

    const profit = monthlyIncome - expenses;

    const occupiedUnits = buildingApartments.filter((apartment) => {
      return isApartmentOccupied(apartment);
    }).length;

    const lateUnits = buildingApartments.filter((apartment) => {
      return isApartmentRentOverdue(apartment);
    }).length;

    return {
      monthlyIncome,
      expenses,
      profit,
      occupiedUnits,
      totalUnits: buildingApartments.length,
      lateUnits,
    };
  }

  function renderBuildingFinancialSummary() {
    const incomeEl = document.getElementById("buildingIncome");
    const costsEl = document.getElementById("buildingCosts");
    const profitEl = document.getElementById("buildingProfit");
    const occupiedEl = document.getElementById("buildingOccupiedUnits");
    const lateEl = document.getElementById("buildingLateUnits");

    const summary = getBuildingFinancialSummary();

    if (incomeEl) {
      incomeEl.textContent = formatMoney(summary.monthlyIncome);
    }

    if (costsEl) {
      costsEl.textContent = formatMoney(summary.expenses);
    }

    if (profitEl) {
      profitEl.textContent = formatMoney(summary.profit);
      profitEl.classList.remove("profit-positive", "profit-negative");

      if (summary.profit > 0) {
        profitEl.classList.add("profit-positive");
      } else if (summary.profit < 0) {
        profitEl.classList.add("profit-negative");
      }
    }

    if (occupiedEl) {
      occupiedEl.textContent = `${summary.occupiedUnits} / ${summary.totalUnits}`;
    }

    if (lateEl) {
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
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}/installments`,
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

  async function deleteApartment(apartmentId) {
    const confirmed = confirm(T("building.confirmDeleteApt"));
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

  const floors = {};

  buildingApartments.forEach((apartment) => {
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
  refreshAll();
  void loadInstallmentsForBuildingSummary().then(() => {
    renderBuildingFinancialSummary();
  });
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