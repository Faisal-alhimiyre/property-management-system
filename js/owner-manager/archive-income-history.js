document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const archiveId = String(params.get("archiveId") || "").trim();

  const ARCHIVE_KEY = "walajna_buildings_archive";
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  let building = null;
  let buildingApartments = [];
  let canonicalBuildingId = "";
  /** @type {any[]} */
  let serverInstallmentsForBuilding = [];

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }

  function readArchiveRows() {
    try {
      const rows = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function normalizeId(value) {
    return String(value || "").trim();
  }

  if (!archiveId) {
    const titleEl = document.getElementById("buildingName");
    if (titleEl) titleEl.textContent = T("owner.archiveBuildingNotFound");
    const sub = document.querySelector(".finance-subtitle");
    if (sub) sub.textContent = T("owner.archiveBuildingNotFoundSub");
    return;
  }

  const archiveRow = readArchiveRows().find((row) => String(row.archiveId) === String(archiveId));
  if (!archiveRow) {
    const titleEl = document.getElementById("buildingName");
    if (titleEl) titleEl.textContent = T("owner.archiveBuildingNotFound");
    const sub = document.querySelector(".finance-subtitle");
    if (sub) sub.textContent = T("owner.archiveBuildingNotFoundSub");
    return;
  }

  const b = archiveRow.building || {};
  canonicalBuildingId = String(archiveRow.buildingId ?? b.id ?? "");
  building = {
    id: canonicalBuildingId,
    name: b.name || T("building.notFound"),
    code: b.code != null ? String(b.code) : null,
  };

  const archivedApts = Array.isArray(archiveRow.apartments) ? archiveRow.apartments : [];
  buildingApartments = archivedApts.map((apt) => ({
    id: String(apt.id ?? apt.apiId ?? ""),
    apiId: apt.apiId ?? apt.id ?? null,
    buildingId: String(apt.buildingId ?? apt.building_id ?? canonicalBuildingId),
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

  /** Cost rows already merged into maintenanceHistory at archive time — skip in walajna_costs to avoid double count. */
  const archivedCostLinkedIds = new Set(
    (Array.isArray(archiveRow.maintenanceHistory) ? archiveRow.maintenanceHistory : [])
      .filter(
        (m) =>
          m &&
          (m.source === "costs_local" || m.source === "costs_api") &&
          m.id != null &&
          String(m.id).trim() !== ""
      )
      .map((m) => String(m.id))
  );

  const maintenanceHistoryRows = Array.isArray(archiveRow.maintenanceHistory)
    ? archiveRow.maintenanceHistory
    : [];

  const incomeHistoryByApartment = Array.isArray(archiveRow.incomeHistoryByApartment)
    ? archiveRow.incomeHistoryByApartment
    : [];

  const buildingNameEl = document.getElementById("buildingName");
  const periodSelect = document.getElementById("periodSelect");
  const periodDateInput = document.getElementById("periodDate");
  const periodCaption = document.getElementById("periodCaption");

  const incomeValueEl = document.getElementById("incomeValue");
  const costValueEl = document.getElementById("costValue");
  const profitValueEl = document.getElementById("profitValue");

  const tableBody = document.getElementById("tableBody");
  const tableMeta = document.getElementById("tableMeta");

  const totalIncomeEl = document.getElementById("totalIncome");
  const totalCostsEl = document.getElementById("totalCosts");
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
      ? T("finance.archiveIncomeTitleWithBuilding", { name: building.name })
      : T("finance.archiveIncomeHeading");
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

  function getApartmentCurrentContractId(apartment) {
    if (!apartment) return null;
    return (
      apartment.currentContractId ||
      apartment.contract?.id ||
      apartment.contractId ||
      null
    );
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

  function normalizeDigits(value) {
    return String(value ?? "")
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .trim();
  }

  function normalizeApartmentNumber(value) {
    const raw = normalizeDigits(value);
    if (raw === "") return "";
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return String(asNum);
    return raw;
  }

  function maintenanceRowMatchesApartment(m, apartment) {
    if (!m || !apartment) return false;
    const aptNum = normalizeApartmentNumber(apartment.number || apartment.apartment_number || "");
    const aptIds = new Set(
      [apartment.apiId, apartment.id]
        .filter((x) => x != null && x !== "")
        .map((x) => String(x))
    );
    const mAptId = m.apartmentId != null ? String(m.apartmentId) : "";
    if (mAptId && aptIds.has(mAptId)) return true;
    const mNum = normalizeApartmentNumber(m.apartmentNumber || "");
    if (mNum && aptNum && mNum === aptNum) return true;
    const mDesc = normalizeDigits(m.description || "");
    if (aptNum && mDesc && (mDesc.includes(`شقة ${aptNum}`) || mDesc.includes(`apt ${aptNum}`))) {
      return true;
    }
    return false;
  }

  /** Maintenance / cost amounts captured when the building was archived (and merged API + local costs). */
  function getArchiveMaintenanceCostsForRange(apartment, start, end) {
    if (!apartment) return 0;
    let sum = 0;
    maintenanceHistoryRows.forEach((m) => {
      if (!maintenanceRowMatchesApartment(m, apartment)) return;
      const rawDate = m.createdAt || m.resolvedAt;
      if (!rawDate) return;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) return;
      if (d < start || d > end) return;
      const amt = Number(m.amount ?? m.cost ?? 0);
      if (!Number.isFinite(amt) || amt <= 0) return;
      sum += amt;
    });
    return sum;
  }

  function apartmentCostKeys(apartment) {
    return new Set(
      [normalizeId(apartment.id), normalizeId(apartment.apiId)].filter(Boolean)
    );
  }

  function getLocalWalajnaCostsForRange(apartment, start, end) {
    if (!apartment) return 0;

    const currentContractId = getApartmentCurrentContractId(apartment);
    const aptKeys = apartmentCostKeys(apartment);
    const bid = normalizeId(canonicalBuildingId);

    return costs
      .filter((cost) => {
        if (cost.id != null && archivedCostLinkedIds.has(String(cost.id))) {
          return false;
        }

        const cBid = normalizeId(cost.buildingId);
        if (bid && cBid && cBid !== bid) return false;

        const cAid = normalizeId(cost.apartmentId);
        if (!aptKeys.has(cAid)) return false;

        if (cost.contractId && currentContractId) {
          if (normalizeId(cost.contractId) !== normalizeId(currentContractId)) {
            return false;
          }
        }

        const rawDate = cost.date || cost.createdAt;
        if (!rawDate) return false;

        const costDate = new Date(rawDate);
        if (Number.isNaN(costDate.getTime())) return false;

        return costDate >= start && costDate <= end;
      })
      .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  }

  function getApartmentCostsForRange(apartment, start, end) {
    return (
      getArchiveMaintenanceCostsForRange(apartment, start, end) +
      getLocalWalajnaCostsForRange(apartment, start, end)
    );
  }

  /** Maps DB apartment id (string) → normalized unit number for matching installments to archived units. */
  function apartmentDbIdToUnitNumberMap() {
    const m = new Map();
    buildingApartments.forEach((apt) => {
      const num = normalizeApartmentNumber(apt.number || apt.apartment_number || "");
      if (!num) return;
      [apt.apiId, apt.id].forEach((raw) => {
        if (raw == null || raw === "") return;
        m.set(String(raw), num);
      });
    });
    return m;
  }

  let cachedAptIdToUnitNum = null;
  function getAptIdToUnitNum() {
    if (!cachedAptIdToUnitNum) {
      cachedAptIdToUnitNum = apartmentDbIdToUnitNumberMap();
    }
    return cachedAptIdToUnitNum;
  }

  function monthKeyOverlapsRange(monthKey, rangeStart, rangeEnd) {
    if (!monthKey || String(monthKey).length < 7) return false;
    const ym = String(monthKey).slice(0, 7);
    const parts = ym.split("-");
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return false;
    const monthStart = new Date(y, mo - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, mo, 0, 23, 59, 59, 999);
    return rangesOverlap(monthStart, monthEnd, rangeStart, rangeEnd);
  }

  function findIncomeGroupForApartment(apartment) {
    const myNum = normalizeApartmentNumber(apartment.number || apartment.apartment_number || "");
    const idStrs = new Set(
      [apartment.apiId, apartment.id]
        .filter((x) => x != null && x !== "")
        .map((x) => String(x))
    );
    return incomeHistoryByApartment.find((x) => {
      const keyRaw = x.apartmentNumber;
      const keyNorm = normalizeApartmentNumber(keyRaw ?? "");
      if (myNum && keyNorm === myNum) return true;
      if (myNum && String(keyRaw) === myNum) return true;
      if (idStrs.has(String(keyRaw))) return true;
      return false;
    });
  }

  function getApartmentIncomeFromGroupedHistory(apartment, rangeStart, rangeEnd) {
    const group = findIncomeGroupForApartment(apartment);
    if (!group || !Array.isArray(group.rows)) return 0;
    let sum = 0;
    group.rows.forEach((r) => {
      if (!monthKeyOverlapsRange(r.month, rangeStart, rangeEnd)) return;
      const amt = Number(r.amount || 0);
      if (Number.isFinite(amt)) sum += amt;
    });
    return sum;
  }

  function installmentRowBelongsToApartment(row, apartment, idToNum) {
    const rowApt = row.apartment_id != null ? String(row.apartment_id) : "";
    if (!rowApt) return false;
    const myNum = normalizeApartmentNumber(apartment.number || apartment.apartment_number || "");
    const mappedNum = idToNum.get(rowApt);
    if (myNum && mappedNum && mappedNum === myNum) return true;
    const apiAptId = apartment.apiId != null ? String(apartment.apiId) : "";
    const idStr = String(apartment.id ?? "");
    if (apiAptId && rowApt === apiAptId) return true;
    if (idStr && rowApt === idStr) return true;
    return false;
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

    const idToNum = getAptIdToUnitNum();
    let fromInstallments = 0;
    (serverInstallmentsForBuilding || []).forEach((row) => {
      if (!installmentRowBelongsToApartment(row, apartment, idToNum)) return;
      fromInstallments += paidInstallmentIncomeAttributedToRange(row, rangeStart, rangeEnd);
    });

    if (fromInstallments > 0) {
      return fromInstallments;
    }
    return getApartmentIncomeFromGroupedHistory(apartment, rangeStart, rangeEnd);
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

  function renderTableRow(apartment, income, apartmentCosts, profit) {
    const tr = document.createElement("tr");

    const num = apartment.number || apartment.apartmentNumber || T("common.dash");
    const aptLabel = T("building.aptLabel", { n: num });
    const noteRaw = buildNoteText(apartment);
    const note = escapeHtml(noteRaw);

    tr.innerHTML = `
      <td>${escapeHtml(aptLabel)}</td>
      <td>${escapeHtml(formatMoney(income))}</td>
      <td class="${apartmentCosts > 0 ? "finance-value-cost" : ""}">${escapeHtml(formatMoney(apartmentCosts))}</td>
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

    tableBody.innerHTML = "";

    if (periodCaption) {
      periodCaption.textContent = T("finance.periodShown", { label });
    }

    if (!buildingApartments.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="finance-empty">${escapeHtml(T("finance.noApts"))}</div>
          </td>
        </tr>
      `;
    } else {
      const sortedUnits = [...buildingApartments].sort(compareApartmentsByUnitOrder);
      sortedUnits.forEach((apartment) => {
        const income = getApartmentRealizedIncomeForRange(apartment, start, end);
        const apartmentCosts = getApartmentCostsForRange(apartment, start, end);
        const profit = income - apartmentCosts;

        totalIncome += income;
        totalCosts += apartmentCosts;

        tableBody.appendChild(
          renderTableRow(apartment, income, apartmentCosts, profit)
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

    if (totalIncomeEl) totalIncomeEl.textContent = formatMoney(totalIncome);
    if (totalCostsEl) totalCostsEl.textContent = formatMoney(totalCosts);
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
