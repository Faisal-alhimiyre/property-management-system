document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const rawBuildingId = params.get("buildingId") || "";
  const archiveId = params.get("archiveId") || "";

  const normalizeId = (value) => String(value || "").trim();
  const buildingId = normalizeId(rawBuildingId);

  let apartments = [];
  const costsLocal = JSON.parse(localStorage.getItem("walajna_costs") || "[]");
  let payments = [];

  let building = null;
  let buildingApartments = [];
  let archiveRow = null;

  /** Paid installments for this building (includes vacated units; GET /api/buildings/:id/installments). */
  let serverInstallmentsForBuilding = [];
  /** Cost rows from GET /api/buildings/:id/costs */
  let serverCostsForBuilding = [];
  let incomeFromApi = false;
  let incomeFromArchive = false;
  let costsFromApi = false;

  function mapApiApartmentToFinance(api) {
    if (!api) return null;
    const rent = api.rent != null && api.rent !== "" ? Number(api.rent) : 0;
    return {
      id: String(api.id ?? ""),
      apiId: api.id ?? null,
      buildingId: String(api.building_id ?? ""),
      number: String(api.apartment_number ?? ""),
      floorNumber: api.floor_number != null ? Number(api.floor_number) : 0,
      leaseStatus: api.lease_status || "vacant",
      tenantUserId: api.tenant_user_id ?? null,
      tenantNationalId: api.tenant_national_id ?? null,
      tenantInfo: api.tenant_info || null,
      currentContractId: api.current_contract_id ?? null,
      contractId: api.current_contract_id ?? null,
      contract: {
        id: api.current_contract_id,
        rentAmount: rent,
        startDate: null,
        endDate: null,
        paymentCycle: "monthly",
      },
    };
  }

  function dedupeFinanceApartments(apartmentList, canonicalBuildingId) {
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
      if (!prev || score(apt) > score(prev)) byKey.set(key, apt);
    }
    return Array.from(byKey.values());
  }

  function parseIsoDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function getApartmentApiId(apartment) {
    if (apartment?.apiId != null && String(apartment.apiId).trim() !== "") {
      return String(apartment.apiId);
    }
    return normalizeId(apartment?.id);
  }

  async function loadInstallmentsForFinanceApartments() {
    serverInstallmentsForBuilding = [];
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !buildingId
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
      console.warn("finance-summary: building installments fetch failed", e);
    }
  }

  async function loadCostsForBuilding() {
    serverCostsForBuilding = [];
    costsFromApi = false;
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !buildingId
    ) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(buildingId)}/costs`,
        { method: "GET" }
      );
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      serverCostsForBuilding = Array.isArray(data) ? data : [];
      costsFromApi = true;
    } catch (e) {
      console.warn("finance-summary: building costs fetch failed", e);
    }
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }

  const sessionUser =
    typeof WalajnaAuth !== "undefined" &&
    typeof WalajnaAuth.getCurrentUser === "function" &&
    WalajnaAuth.getCurrentUser();

  if (!sessionUser && typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
      apartments = WalajnaApartmentsApi.getSessionList();
    } catch (e) {
      console.warn("finance-summary: apartments API failed", e);
      apartments = [];
    }
  } else if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.getSessionList) {
    apartments = WalajnaApartmentsApi.getSessionList();
  } else {
    apartments = [];
  }

  buildingApartments = apartments.filter(
    (a) => normalizeId(a.buildingId) === buildingId
  );

  function readArchiveRows() {
    try {
      const rows = JSON.parse(localStorage.getItem("walajna_buildings_archive") || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  if (
    typeof WalajnaAuth !== "undefined" &&
    WalajnaAuth.fetchWithAuth &&
    typeof WalajnaAuth.getCurrentUser === "function" &&
    WalajnaAuth.getCurrentUser()
  ) {
    try {
      const [bRes, aRes] = await Promise.all([
        WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/buildings`, {
          method: "GET",
        }),
        WalajnaAuth.fetchWithAuth(`${WalajnaAuth.API_BASE}/api/apartments`, {
          method: "GET",
        }),
      ]);
      if (bRes.ok) {
        const blist = await bRes.json();
        const raw = blist.find((b) => String(b.id) === String(buildingId));
        if (raw) {
          building = {
            id: String(raw.id),
            name: raw.name,
            code: raw.code != null ? String(raw.code) : null,
          };
        }
      }
      if (aRes.ok) {
        const all = await aRes.json();
        const target = String(buildingId);
        const code = building?.code ? String(building.code) : null;
        const filtered = all.filter((a) => {
          const bid = String(a.building_id ?? "");
          return bid === target || (code && bid === code);
        });
        const mapped = filtered
          .map(mapApiApartmentToFinance)
          .filter(Boolean);
        if (mapped.length) {
          buildingApartments = dedupeFinanceApartments(mapped, buildingId);
          incomeFromApi = true;
        }
      }
      if (buildingId && incomeFromApi) {
        await Promise.all([
          loadInstallmentsForFinanceApartments(),
          loadCostsForBuilding(),
        ]);
      }
    } catch (e) {
      console.warn("finance-summary: API load failed (no local buildings fallback)", e);
    }
  }

  if (
    !incomeFromApi &&
    typeof WalajnaPaymentsApi !== "undefined" &&
    WalajnaPaymentsApi.listMapped &&
    typeof WalajnaAuth !== "undefined" &&
    WalajnaAuth.fetchWithAuth
  ) {
    try {
      payments = await WalajnaPaymentsApi.listMapped();
    } catch (e) {
      console.warn("finance-summary: payments API failed", e);
    }
  }

  // Archive fallback: finance summary for deleted buildings.
  if (!building || !buildingApartments.length) {
    const archiveRows = readArchiveRows();
    if (archiveId) {
      archiveRow = archiveRows.find((row) => String(row.archiveId) === String(archiveId)) || null;
    } else {
      // fallback by buildingId when archiveId is missing
      archiveRow =
        archiveRows.find((row) => String(row.buildingId) === String(buildingId)) || null;
    }
    if (archiveRow) {
      const b = archiveRow.building || {};
      building = {
        id: String(b.id ?? archiveRow.buildingId ?? buildingId),
        name: b.name || T("building.notFound"),
        code: b.code != null ? String(b.code) : null,
      };
      const archivedApts = Array.isArray(archiveRow.apartments) ? archiveRow.apartments : [];
      buildingApartments = archivedApts.map((apt) => ({
        id: String(apt.id ?? apt.apiId ?? ""),
        apiId: apt.apiId ?? apt.id ?? null,
        buildingId: String(apt.buildingId ?? apt.building_id ?? buildingId),
        number: String(apt.number ?? apt.apartment_number ?? ""),
        floorNumber: Number(apt.floorNumber ?? apt.floor_number ?? 0),
        leaseStatus: apt.leaseStatus || apt.lease_status || "vacant",
        tenantUserId: apt.tenantUserId ?? null,
        tenantNationalId: apt.tenantNationalId ?? null,
        tenantInfo: apt.tenantInfo || null,
        currentContractId: apt.currentContractId ?? apt.current_contract_id ?? null,
        contractId: apt.contractId ?? apt.currentContractId ?? null,
        contract: apt.contract || null,
      }));
      serverInstallmentsForBuilding = Array.isArray(archiveRow.incomeInstallments)
        ? archiveRow.incomeInstallments
        : [];
      incomeFromArchive = serverInstallmentsForBuilding.length > 0;
    }
  }

  const buildingNameEl = document.getElementById("buildingName");
  const periodSelect = document.getElementById("periodSelect");
  const periodDateInput = document.getElementById("periodDate");
  const periodCaption = document.getElementById("periodCaption");

  const incomeValueEl = document.getElementById("incomeValue");
  const costValueEl = document.getElementById("costValue");
  const profitValueEl = document.getElementById("profitValue");
  const lateValueEl = document.getElementById("lateValue");

  const tableBody = document.getElementById("tableBody");
  const tableMeta = document.getElementById("tableMeta");

  const totalIncomeEl = document.getElementById("totalIncome");
  const totalCostsEl = document.getElementById("totalCosts");
  const totalLateEl = document.getElementById("totalLate");
  const totalProfitEl = document.getElementById("totalProfit");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setBuildingTitle() {
    if (!buildingNameEl) return;
    buildingNameEl.textContent = building
      ? T("finance.summaryWithBuilding", { name: building.name })
      : T("finance.summary");
  }

  setBuildingTitle();

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

  function isApartmentOccupied(apartment) {
    return !!(
      apartment?.leaseStatus !== "vacant" ||
      apartment?.tenantUserId ||
      apartment?.tenantNationalId ||
      apartment?.tenantInfo?.fullName ||
      apartment?.currentContractId ||
      apartment?.contract?.id
    );
  }

  function getApartmentStatusHtml(apartment) {
    const occupied = isApartmentOccupied(apartment);
    const label = occupied ? T("finance.rented") : T("finance.vacant");
    const cls = occupied ? "rented" : "vacant";
    return `<span class="finance-status-badge ${cls}">${escapeHtml(label)}</span>`;
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
    return new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
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

  function getSelectedDateRange() {
    const view = periodSelect?.value || "monthly";
    const baseDate = periodDateInput?.value
      ? new Date(periodDateInput.value)
      : new Date();

    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB-u-nu-latn"
          : "ar-SA-u-nu-latn";

    let start;
    let end;
    let label = "";

    if (view === "monthly") {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
      label = baseDate.toLocaleDateString(loc, { month: "long", year: "numeric" });
    } else if (view === "quarterly") {
      const quarter = Math.floor(month / 3) + 1;
      const startMonth = (quarter - 1) * 3;

      start = new Date(year, startMonth, 1);
      end = new Date(year, startMonth + 3, 0);
      label = T("finance.quarter", { q: quarter, y: year });
    } else if (view === "semi") {
      const half = month < 6 ? 1 : 2;
      const startMonth = half === 1 ? 0 : 6;

      start = new Date(year, startMonth, 1);
      end = new Date(year, startMonth + 6, 0);
      label =
        half === 1
          ? T("finance.halfFirst", { y: year })
          : T("finance.halfSecond", { y: year });
    } else {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      label = T("finance.year", { y: year });
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end, label };
  }

  function buildNoteText(apartment) {
    return apartment?.contract?.notes || T("common.dash");
  }

  function getApartmentCostsForRange(apartment, start, end) {
    if (!apartment) return 0;

    const apiAptId = getApartmentApiId(apartment);

    if (costsFromApi) {
      return serverCostsForBuilding
        .filter((row) => String(row.apartment_id ?? "") === apiAptId)
        .filter((row) => {
          const costDate = parseIsoDate(row.expense_date || row.created_at);
          if (!costDate) return false;
          return costDate >= start && costDate <= end;
        })
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    }

    const currentContractId = getApartmentCurrentContractId(apartment);

    return costsLocal
      .filter((cost) => {
        const costApt = normalizeId(cost.apartmentId);
        if (costApt !== normalizeId(apartment.id) && costApt !== apiAptId) {
          return false;
        }

        if (cost.contractId && currentContractId) {
          if (normalizeId(cost.contractId) !== normalizeId(currentContractId)) {
            return false;
          }
        }

        const costDate = parseIsoDate(cost.date || cost.createdAt);
        if (!costDate) return false;

        return costDate >= start && costDate <= end;
      })
      .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
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

  function getApartmentRealizedIncomeForRange(apartment, rangeStart, rangeEnd) {
    if (!apartment) return 0;

    const apartmentId = apartment.id;
    const apiAptId =
      apartment.apiId != null ? String(apartment.apiId) : String(apartmentId);
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!apartmentId) {
      return 0;
    }

    if (incomeFromApi || incomeFromArchive) {
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
      if (normalizeId(payment.apartmentId) !== normalizeId(apartmentId)) {
        return false;
      }

      const pc = normalizeId(payment.contractId);
      const cc = normalizeId(currentContractId);
      if (pc && cc && pc !== cc) {
        return false;
      }

      if (payment.status !== "paid") {
        return false;
      }

      return true;
    });

    let income = 0;

    apartmentPayments.forEach((payment) => {
      const coverageStartDate = getPaymentCoverageStart(payment);
      if (!coverageStartDate) return;

      const cycleMonths = getCycleMonths(
        payment.paymentCycle || apartment.contract?.paymentCycle
      );

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

  function getApartmentContractMonthlyRent(apartment) {
    const c = apartment?.contract || {};
    const yr = Number(c.yearlyRent);
    if (Number.isFinite(yr) && yr > 0) return yr / 12;
    return Number(c.rentAmount || 0);
  }

  function getApartmentContractStart(apartment) {
    const value = apartment?.contract?.startDate;
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  }

  function getApartmentContractEnd(apartment) {
    const value = apartment?.contract?.endDate;
    if (!value) return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date;
  }

  function getApartmentExpectedIncomeForRange(apartment, rangeStart, rangeEnd) {
    if (!isApartmentOccupied(apartment)) return 0;

    const monthlyRent = getApartmentContractMonthlyRent(apartment);
    if (!monthlyRent) return 0;

    const contractStart = getApartmentContractStart(apartment);
    const contractEnd = getApartmentContractEnd(apartment);

    if (!contractStart || !contractEnd) return 0;

    let income = 0;
    let cursor = startOfMonth(rangeStart);
    const finalMonth = startOfMonth(rangeEnd);

    while (cursor <= finalMonth) {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);

      if (rangesOverlap(monthStart, monthEnd, contractStart, contractEnd)) {
        income += monthlyRent;
      }

      cursor = addMonths(cursor, 1);
    }

    return income;
  }

  function getApartmentRealizedIncomeUntil(apartment, endDate) {
    const earliest = new Date(2000, 0, 1);
    return getApartmentRealizedIncomeForRange(apartment, earliest, endDate);
  }

  function getApartmentOverdueThrough(apartment, rangeEnd) {
    if (!apartment || !isApartmentOccupied(apartment)) {
      return 0;
    }

    if (incomeFromApi || incomeFromArchive) {
      const apiAptId = getApartmentApiId(apartment);
      const periodEnd =
        rangeEnd instanceof Date ? new Date(rangeEnd.getTime()) : parseIsoDate(rangeEnd) || new Date();
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const asOf = periodEnd.getTime() < now.getTime() ? periodEnd : now;
      let sum = 0;
      (serverInstallmentsForBuilding || []).forEach((row) => {
        const rowApt = row.apartment_id != null ? String(row.apartment_id) : "";
        if (rowApt !== apiAptId) return;
        const status = String(row.status || "").toLowerCase();
        if (status === "paid" || status === "cancelled") return;
        const due = parseIsoDate(row.due_date || row.dueDate);
        if (!due) return;
        due.setHours(0, 0, 0, 0);
        const cutoff = new Date(asOf);
        cutoff.setHours(0, 0, 0, 0);
        if (due.getTime() > cutoff.getTime()) return;
        sum += Number(row.amount || 0);
      });
      return sum;
    }

    const currentContractId = getApartmentCurrentContractId(apartment);
    if (!currentContractId) {
      return 0;
    }

    const expectedUntilNow = getApartmentExpectedIncomeForRange(
      apartment,
      getApartmentContractStart(apartment) || new Date(2000, 0, 1),
      rangeEnd
    );

    const realizedUntilNow = getApartmentRealizedIncomeUntil(apartment, rangeEnd);
    const lateAmount = expectedUntilNow - realizedUntilNow;

    return lateAmount > 0 ? lateAmount : 0;
  }

  function compareApartmentsByUnitOrder(a, b) {
    const fa = Number(a.floorNumber ?? a.floor_number ?? 0);
    const fb = Number(b.floorNumber ?? b.floor_number ?? 0);
    if (fa !== fb && !Number.isNaN(fa) && !Number.isNaN(fb)) {
      return fa - fb;
    }
    const na = Number(String(a.number ?? a.apartmentNumber ?? "").replace(/\D/g, "") || NaN);
    const nb = Number(String(b.number ?? b.apartmentNumber ?? "").replace(/\D/g, "") || NaN);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) {
      return na - nb;
    }
    return String(a.number ?? "").localeCompare(String(b.number ?? ""), "ar", {
      numeric: true,
    });
  }

  function renderTableRow(apartment, income, apartmentCosts, lateAmount, profit) {
    const tr = document.createElement("tr");

    const num = apartment.number || apartment.apartmentNumber || T("common.dash");
    const aptLabel = T("building.aptLabel", { n: num });
    const tenant =
      apartment?.tenantInfo?.fullName || T("finance.noTenant");
    const noteRaw = buildNoteText(apartment);
    const note = escapeHtml(noteRaw);

    tr.innerHTML = `
      <td>${escapeHtml(aptLabel)}</td>
      <td>${escapeHtml(tenant)}</td>
      <td>${getApartmentStatusHtml(apartment)}</td>
      <td>${escapeHtml(formatMoney(income))}</td>
      <td class="${apartmentCosts > 0 ? "finance-value-cost" : ""}">${escapeHtml(formatMoney(apartmentCosts))}</td>
      <td>${escapeHtml(formatMoney(lateAmount))}</td>
      <td class="finance-note-cell" title="${note}">${note}</td>
      <td class="${profit > 0 ? "finance-value-profit" : profit < 0 ? "finance-value-cost" : ""}">${escapeHtml(formatMoney(profit))}</td>
    `;

    return tr;
  }

  function render() {
    if (!tableBody) return;

    const { start, end, label } = getSelectedDateRange();

    let totalIncome = 0;
    let totalCosts = 0;
    let totalLate = 0;

    tableBody.innerHTML = "";

    if (periodCaption) {
      periodCaption.textContent = T("finance.periodShown", { label });
    }

    if (!buildingApartments.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="finance-empty">${escapeHtml(T("finance.noApts"))}</div>
          </td>
        </tr>
      `;
    } else {
      const sortedUnits = [...buildingApartments].sort(compareApartmentsByUnitOrder);
      sortedUnits.forEach((apartment) => {
        const income = getApartmentRealizedIncomeForRange(apartment, start, end);
        const apartmentCosts = getApartmentCostsForRange(apartment, start, end);
        const lateAmount = getApartmentOverdueThrough(apartment, end);
        const profit = income - apartmentCosts;

        totalIncome += income;
        totalCosts += apartmentCosts;
        totalLate += lateAmount;

        tableBody.appendChild(
          renderTableRow(apartment, income, apartmentCosts, lateAmount, profit)
        );
      });
    }

    const totalProfit = totalIncome - totalCosts;

    if (tableMeta) {
      tableMeta.textContent = T("finance.aptCount", {
        n: buildingApartments.length,
      });
    }

    if (incomeValueEl) incomeValueEl.textContent = formatMoney(totalIncome);
    if (costValueEl) costValueEl.textContent = formatMoney(totalCosts);
    if (profitValueEl) profitValueEl.textContent = formatMoney(totalProfit);
    if (lateValueEl) lateValueEl.textContent = formatMoney(totalLate);

    if (totalIncomeEl) totalIncomeEl.textContent = formatMoney(totalIncome);
    if (totalCostsEl) totalCostsEl.textContent = formatMoney(totalCosts);
    if (totalLateEl) totalLateEl.textContent = formatMoney(totalLate);
    if (totalProfitEl) totalProfitEl.textContent = formatMoney(totalProfit);
  }

  if (periodDateInput) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    periodDateInput.value = `${year}-${month}-${day}`;
  }

  if (periodSelect) {
    periodSelect.addEventListener("change", render);
  }

  if (periodDateInput) {
    periodDateInput.addEventListener("change", render);
  }

  render();

  document.addEventListener("walajna:i18n-applied", () => {
    setBuildingTitle();
    render();
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
  });
});
