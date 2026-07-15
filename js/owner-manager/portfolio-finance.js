/**
 * Portfolio financial summary: same period logic as finance-summary.js, aggregated across all owner buildings.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof requireAuth === "function" && !requireAuth()) return;
  if (typeof requireRole === "function" && !requireRole("owner")) return;

  const normalizeId = (value) => String(value || "").trim();

  let apartments = [];
  const costsLocal = JSON.parse(localStorage.getItem("walajna_costs") || "[]");
  let payments = [];

  /** All owner installments (GET /api/owner/installments); filtered client-side by building pick. */
  let serverInstallmentsAllFull = [];
  let serverInstallmentsAll = [];
  /** All owner costs (GET /api/owner/costs); filtered client-side by building pick. */
  let serverCostsAllFull = [];
  let serverCostsAll = [];
  let incomeFromApi = false;
  let costsFromApi = false;

  let allBuildingApartments = [];
  let allBuildingApartmentsFull = [];
  let ownerBuildingsCatalog = [];

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

  function applyInstallmentsScopeFilter() {
    const allowedAptIds = new Set(
      allBuildingApartments
        .map((a) => getApartmentApiId(a))
        .filter(Boolean)
    );
    const allowedBuildingIds = new Set(
      allBuildingApartments.map((a) => normalizeId(a.buildingId)).filter(Boolean)
    );
    serverInstallmentsAll = (serverInstallmentsAllFull || []).filter((row) => {
      const rowBid = row.building_id != null ? normalizeId(row.building_id) : "";
      if (rowBid && allowedBuildingIds.has(rowBid)) return true;
      const rowApt = row.apartment_id != null ? String(row.apartment_id) : "";
      return rowApt && allowedAptIds.has(rowApt);
    });
  }

  async function loadInstallmentsBulk() {
    serverInstallmentsAllFull = [];
    serverInstallmentsAll = [];
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/owner/installments`,
        { method: "GET" }
      );
      if (!res.ok) {
        console.warn("portfolio-finance: owner installments fetch failed", res.status);
        return;
      }
      const data = await res.json();
      serverInstallmentsAllFull = Array.isArray(data) ? data : [];
      applyInstallmentsScopeFilter();
    } catch (e) {
      console.warn("portfolio-finance: owner installments fetch failed", e);
    }
  }

  function applyCostsScopeFilter() {
    const allowedAptIds = new Set(
      allBuildingApartments
        .map((a) => getApartmentApiId(a))
        .filter(Boolean)
    );
    serverCostsAll = (serverCostsAllFull || []).filter((row) =>
      allowedAptIds.has(String(row.apartment_id ?? ""))
    );
  }

  async function loadCostsBulk() {
    serverCostsAllFull = [];
    serverCostsAll = [];
    costsFromApi = false;
    if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      return;
    }
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/owner/costs`,
        { method: "GET" }
      );
      if (!res.ok) {
        console.warn("portfolio-finance: owner costs fetch failed", res.status);
        return;
      }
      const data = await res.json();
      serverCostsAllFull = Array.isArray(data) ? data : [];
      costsFromApi = true;
      applyCostsScopeFilter();
    } catch (e) {
      console.warn("portfolio-finance: owner costs fetch failed", e);
    }
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
      console.warn("portfolio-finance: apartments API failed", e);
      apartments = [];
    }
  } else if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.getSessionList) {
    apartments = WalajnaApartmentsApi.getSessionList();
  } else {
    apartments = [];
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

      let ownerBuildings = [];
      if (bRes.ok) {
        ownerBuildings = await bRes.json();
        if (
          Array.isArray(ownerBuildings) &&
          ownerBuildings.length &&
          typeof WalajnaBuildingsApi !== "undefined" &&
          WalajnaBuildingsApi.persistSessionList
        ) {
          WalajnaBuildingsApi.persistSessionList(
            ownerBuildings.map((b) =>
              typeof WalajnaBuildingsApi.mapApiRowToClient === "function"
                ? WalajnaBuildingsApi.mapApiRowToClient(b)
                : b
            )
          );
        }
      }

      const nameById = new Map(
        (ownerBuildings || []).map((b) => [String(b.id), b.name || "—"])
      );

      const buildingIdSet = new Set((ownerBuildings || []).map((b) => String(b.id)));

      if (aRes.ok) {
        const all = await aRes.json();
        const rows = Array.isArray(all) ? all : [];
        const merged = [];

        for (const bid of buildingIdSet) {
          const code = (ownerBuildings || []).find((x) => String(x.id) === bid)?.code;
          const codeStr = code != null ? String(code) : null;

          const filtered = rows.filter((a) => {
            const ab = String(a.building_id ?? "");
            return ab === bid || (codeStr && ab === codeStr);
          });

          const mapped = filtered
            .map(mapApiApartmentToFinance)
            .filter(Boolean)
            .map((apt) => ({
              ...apt,
              buildingName: nameById.get(bid) || "—",
            }));

          merged.push(...dedupeFinanceApartments(mapped, bid));
        }

        ownerBuildingsCatalog = (ownerBuildings || []).map((b) => ({
          id: String(b.id),
          name: b.name || "—",
        }));

        if (merged.length) {
          allBuildingApartmentsFull = merged;
          incomeFromApi = true;
          await Promise.all([loadInstallmentsBulk(), loadCostsBulk()]);
          allBuildingApartments =
            typeof WalajnaOwnerBuildingPick !== "undefined"
              ? WalajnaOwnerBuildingPick.filterApartments(allBuildingApartmentsFull)
              : allBuildingApartmentsFull;
        }
      }
    } catch (e) {
      console.warn("portfolio-finance: API load failed, using local data", e);
    }
  }

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
  const footerTotalUnitsEl = document.getElementById("footerTotalUnits");
  const footerTotalRentedEl = document.getElementById("footerTotalRented");
  const portfolioApartmentsModal = document.getElementById("portfolioApartmentsModal");
  const closePortfolioApartmentsModalBtn = document.getElementById("closePortfolioApartmentsModal");
  const portfolioApartmentsModalTitle = document.getElementById("portfolioApartmentsModalTitle");
  const portfolioApartmentsModalSub = document.getElementById("portfolioApartmentsModalSub");
  const portfolioApartmentsModalBody = document.getElementById("portfolioApartmentsModalBody");

  let renderedGroups = [];
  let currentRenderedRange = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA"
          : "ar-SA";
    if (!n) return T("common.sarZero");
    return `${n.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function isApartmentOccupied(apartment) {
    if (!apartment) return false;
    const ti = apartment.tenantInfo;
    return !!(
      apartment.tenantUserId ||
      apartment.tenantNationalId ||
      String(ti?.fullName || ti?.full_name || "").trim()
    );
  }

  /** Used only in the slide-down nested apartment table (main table header has no status column). */
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
          ? "en-GB"
          : "ar-SA";

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
      return serverCostsAll
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

    if (incomeFromApi) {
      const rows = serverInstallmentsAll || [];
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
    return Number(apartment?.contract?.rentAmount || 0);
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

    if (incomeFromApi) {
      const apiAptId = getApartmentApiId(apartment);
      const periodEnd =
        rangeEnd instanceof Date ? new Date(rangeEnd.getTime()) : parseIsoDate(rangeEnd) || new Date();
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      const asOf = periodEnd.getTime() < now.getTime() ? periodEnd : now;
      let sum = 0;
      (serverInstallmentsAll || []).forEach((row) => {
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

  function compareUnitOrder(a, b) {
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

  function groupApartmentsByBuilding(apartments) {
    const map = new Map();
    for (const apt of apartments) {
      const bid = normalizeId(apt.buildingId) || "__none__";
      if (!map.has(bid)) {
        map.set(bid, {
          buildingId: bid,
          buildingName: apt.buildingName || T("common.dash"),
          units: [],
        });
      }
      map.get(bid).units.push(apt);
    }
    return [...map.values()].sort((a, b) =>
      String(a.buildingName).localeCompare(String(b.buildingName), "ar", {
        sensitivity: "base",
      })
    );
  }

  function renderApartmentCard(apartment, income, apartmentCosts, lateAmount, profit) {
    const num = apartment.number || apartment.apartmentNumber || T("common.dash");
    const aptLabel = T("building.aptLabel", { n: num });
    const tenant =
      apartment?.tenantInfo?.fullName || T("finance.noTenant");
    const noteRaw = buildNoteText(apartment);
    const note = escapeHtml(noteRaw);
    const profitCls =
      profit > 0 ? "finance-value-profit" : profit < 0 ? "finance-value-cost" : "";
    const costCls = apartmentCosts > 0 ? "finance-value-cost" : "";

    return `
      <article class="portfolio-apt-card">
        <div class="portfolio-apt-card__head">
          <h4 class="portfolio-apt-card__title">${escapeHtml(aptLabel)}</h4>
          ${getApartmentStatusHtml(apartment)}
        </div>

        <div class="portfolio-apt-card__meta">
          <div class="portfolio-apt-card__item">
            <span class="portfolio-apt-card__label">${escapeHtml(T("finance.th.tenant"))}</span>
            <strong class="portfolio-apt-card__value">${escapeHtml(tenant)}</strong>
          </div>
          <div class="portfolio-apt-card__item">
            <span class="portfolio-apt-card__label">${escapeHtml(T("finance.th.income"))}</span>
            <strong class="portfolio-apt-card__value">${escapeHtml(formatMoney(income))}</strong>
          </div>
          <div class="portfolio-apt-card__item">
            <span class="portfolio-apt-card__label">${escapeHtml(T("finance.th.costs"))}</span>
            <strong class="portfolio-apt-card__value ${costCls}">${escapeHtml(formatMoney(apartmentCosts))}</strong>
          </div>
          <div class="portfolio-apt-card__item">
            <span class="portfolio-apt-card__label">${escapeHtml(T("finance.th.late"))}</span>
            <strong class="portfolio-apt-card__value">${escapeHtml(formatMoney(lateAmount))}</strong>
          </div>
          <div class="portfolio-apt-card__item">
            <span class="portfolio-apt-card__label">${escapeHtml(T("finance.th.profit"))}</span>
            <strong class="portfolio-apt-card__value ${profitCls}">${escapeHtml(formatMoney(profit))}</strong>
          </div>
        </div>

        <p class="portfolio-apt-card__note" title="${note}">
          <span>${escapeHtml(T("finance.th.notes"))}:</span>
          ${note}
        </p>
      </article>
    `;
  }

  function renderNestedApartmentsTable(units, start, end) {
    const sorted = [...units].sort(compareUnitOrder);
    const cards = sorted
      .map((apartment) => {
        const income = getApartmentRealizedIncomeForRange(apartment, start, end);
        const apartmentCosts = getApartmentCostsForRange(apartment, start, end);
        const lateAmount = getApartmentOverdueThrough(apartment, end);
        const profit = income - apartmentCosts;
        return renderApartmentCard(apartment, income, apartmentCosts, lateAmount, profit);
      })
      .join("");

    return `
      <div class="portfolio-apartments-list" role="list">
        ${cards}
      </div>
    `;
  }

  function openPortfolioApartmentsModal(group) {
    if (!portfolioApartmentsModal || !group) return;
    const rangeLabel = currentRenderedRange?.label || "";
    if (portfolioApartmentsModalTitle) {
      portfolioApartmentsModalTitle.textContent = `${T("finance.aptDetails")} - ${group.buildingName || T("common.dash")}`;
    }
    if (portfolioApartmentsModalSub) {
      portfolioApartmentsModalSub.textContent = rangeLabel
        ? T("finance.periodShown", { label: rangeLabel })
        : "";
    }
    if (portfolioApartmentsModalBody) {
      portfolioApartmentsModalBody.innerHTML = renderNestedApartmentsTable(
        group.units || [],
        currentRenderedRange?.start,
        currentRenderedRange?.end
      );
    }
    portfolioApartmentsModal.classList.add("is-open");
    portfolioApartmentsModal.setAttribute("aria-hidden", "false");
  }

  function closePortfolioApartmentsModal() {
    if (!portfolioApartmentsModal) return;
    portfolioApartmentsModal.classList.remove("is-open");
    portfolioApartmentsModal.setAttribute("aria-hidden", "true");
  }

  function isPortfolioTableFilterActive() {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return false;
    return WalajnaOwnerBuildingPick.isPortfolioTableFilterActive(ownerBuildingsCatalog);
  }

  function isPortfolioGroupInTotals(group) {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return true;
    return WalajnaOwnerBuildingPick.isPortfolioBuildingInTotals(
      group.buildingId,
      ownerBuildingsCatalog
    );
  }

  function portfolioCheckboxHtml(buildingId) {
    if (typeof WalajnaOwnerBuildingPick === "undefined") return "";
    const checked = WalajnaOwnerBuildingPick.isPortfolioBuildingChecked(
      buildingId,
      ownerBuildingsCatalog
    );
    return WalajnaOwnerBuildingPick.portfolioBuildingCheckboxHtml(buildingId, checked);
  }

  function render() {
    if (!tableBody) return;

    const { start, end, label } = getSelectedDateRange();
    currentRenderedRange = { start, end, label };

    let totalIncome = 0;
    let totalCosts = 0;
    let totalLate = 0;

    tableBody.innerHTML = "";

    if (periodCaption) {
      periodCaption.textContent = T("finance.periodShown", { label });
    }

    if (!allBuildingApartments.length) {
      renderedGroups = [];
      tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="finance-empty">${escapeHtml(T("finance.noAptsPortfolio"))}</div>
          </td>
        </tr>
      `;
    } else {
      const groups = groupApartmentsByBuilding(allBuildingApartments);
      renderedGroups = groups;
      const parts = [];

      groups.forEach((group, idx) => {
        let bIncome = 0;
        let bCosts = 0;
        let bLate = 0;
        group.units.forEach((apartment) => {
          const income = getApartmentRealizedIncomeForRange(apartment, start, end);
          const apartmentCosts = getApartmentCostsForRange(apartment, start, end);
          const lateAmount = getApartmentOverdueThrough(apartment, end);
          bIncome += income;
          bCosts += apartmentCosts;
          bLate += lateAmount;
        });
        const bProfit = bIncome - bCosts;
        const includeInTotals = isPortfolioGroupInTotals(group);
        if (includeInTotals) {
          totalIncome += bIncome;
          totalCosts += bCosts;
          totalLate += bLate;
        }

        const profitCls =
          bProfit > 0 ? "finance-value-profit" : bProfit < 0 ? "finance-value-cost" : "";
        const costCls = bCosts > 0 ? "finance-value-cost" : "";
        const rentedCount = group.units.filter((a) => isApartmentOccupied(a)).length;
        const rowMutedCls =
          isPortfolioTableFilterActive() && !includeInTotals
            ? " portfolio-building-row--unchecked"
            : "";

        parts.push(`
          <tr class="portfolio-building-row${rowMutedCls}" data-portfolio-idx="${idx}">
            <td class="portfolio-building-name-cell">
              <div class="portfolio-building-name-row">
                ${portfolioCheckboxHtml(group.buildingId)}
                <button type="button" class="portfolio-building-open" data-portfolio-open="${idx}">
                  <span class="portfolio-building-name">${escapeHtml(group.buildingName)}</span>
                </button>
              </div>
            </td>
            <td class="portfolio-building-meta">${escapeHtml(
              String(group.units.length)
            )}</td>
            <td class="portfolio-building-rented">${escapeHtml(String(rentedCount))}</td>
            <td>${escapeHtml(formatMoney(bIncome))}</td>
            <td class="${costCls}">${escapeHtml(formatMoney(bCosts))}</td>
            <td>${escapeHtml(formatMoney(bLate))}</td>
            <td>${escapeHtml(T("common.dash"))}</td>
            <td class="${profitCls}">${escapeHtml(formatMoney(bProfit))}</td>
          </tr>
        `);
      });

      tableBody.innerHTML = parts.join("");
    }

    const totalProfit = totalIncome - totalCosts;

    let buildingCount = 0;
    let apartmentCount = 0;
    let rentedCountTotal = 0;
    if (allBuildingApartments.length) {
      const groups = groupApartmentsByBuilding(allBuildingApartments);
      const selectedGroups = groups.filter((g) => isPortfolioGroupInTotals(g));
      buildingCount = selectedGroups.length;
      for (const group of selectedGroups) {
        apartmentCount += group.units.length;
        rentedCountTotal += group.units.filter((a) => isApartmentOccupied(a)).length;
      }
    }

    if (tableMeta) {
      const allGroupCount = allBuildingApartments.length
        ? groupApartmentsByBuilding(allBuildingApartments).length
        : 0;
      const buildingsLabel =
        isPortfolioTableFilterActive() && allGroupCount > 0 && buildingCount < allGroupCount
          ? `${buildingCount}/${allGroupCount}`
          : buildingCount;
      tableMeta.textContent = T("finance.portfolioTableMeta", {
        buildings: buildingsLabel,
        apartments: apartmentCount,
        rented: rentedCountTotal,
      });
    }

    if (footerTotalUnitsEl) footerTotalUnitsEl.textContent = String(apartmentCount);
    if (footerTotalRentedEl) footerTotalRentedEl.textContent = String(rentedCountTotal);

    if (incomeValueEl) incomeValueEl.textContent = formatMoney(totalIncome);
    if (costValueEl) costValueEl.textContent = formatMoney(totalCosts);
    if (profitValueEl) profitValueEl.textContent = formatMoney(totalProfit);
    if (lateValueEl) lateValueEl.textContent = formatMoney(totalLate);

    if (totalIncomeEl) totalIncomeEl.textContent = formatMoney(totalIncome);
    if (totalCostsEl) totalCostsEl.textContent = formatMoney(totalCosts);
    if (totalLateEl) totalLateEl.textContent = formatMoney(totalLate);
    if (totalProfitEl) totalProfitEl.textContent = formatMoney(totalProfit);
  }

  if (tableBody) {
    tableBody.addEventListener("click", (e) => {
      const btn = e.target.closest(".portfolio-building-open");
      if (!btn || !tableBody.contains(btn)) return;
      const idx = Number(btn.getAttribute("data-portfolio-open"));
      if (!Number.isFinite(idx) || idx < 0 || idx >= renderedGroups.length) return;
      openPortfolioApartmentsModal(renderedGroups[idx]);
    });

    tableBody.addEventListener("change", (e) => {
      const cb = e.target.closest(".portfolio-building-pick__input");
      if (!cb || !tableBody.contains(cb)) return;
      e.stopPropagation();
      if (typeof WalajnaOwnerBuildingPick === "undefined") return;
      WalajnaOwnerBuildingPick.setPortfolioBuildingChecked(
        cb.dataset.buildingId,
        cb.checked,
        ownerBuildingsCatalog
      );
      render();
    });
  }

  if (closePortfolioApartmentsModalBtn) {
    closePortfolioApartmentsModalBtn.addEventListener("click", closePortfolioApartmentsModal);
  }
  if (portfolioApartmentsModal) {
    portfolioApartmentsModal.addEventListener("click", (e) => {
      if (e.target?.dataset?.portfolioModalClose === "true") {
        closePortfolioApartmentsModal();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && portfolioApartmentsModal?.classList.contains("is-open")) {
      closePortfolioApartmentsModal();
    }
  });

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

  async function refreshPortfolioPickUi() {
    if (!allBuildingApartmentsFull.length) return;
    if (typeof WalajnaOwnerBuildingPick === "undefined") return;

    allBuildingApartments = WalajnaOwnerBuildingPick.filterApartments(
      allBuildingApartmentsFull
    );

    applyInstallmentsScopeFilter();
    applyCostsScopeFilter();

    const anchor = document.querySelector(".finance-cards");
    WalajnaOwnerBuildingPick.mountFilterBanner({
      anchor,
      buildings: ownerBuildingsCatalog,
      onChange: () => {
        refreshPortfolioPickUi().then(render);
      },
    });
  }

  refreshPortfolioPickUi().then(render);

  document.addEventListener("walajna:i18n-applied", () => {
    render();
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
  });

  if (typeof window.walajnaRefreshBreadcrumb === "function") {
    window.walajnaRefreshBreadcrumb();
  }

});
