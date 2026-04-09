document.addEventListener("DOMContentLoaded", () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const rawBuildingId = params.get("buildingId") || "";

  const normalizeId = (value) => String(value || "").trim();
  const buildingId = normalizeId(rawBuildingId);

  const buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");
  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");

  const building = buildings.find((b) => normalizeId(b.id) === buildingId);
  const buildingApartments = apartments.filter(
    (a) => normalizeId(a.buildingId) === buildingId
  );

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
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-SA"
        : "ar-SA";
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
      window.walajna_language && window.walajna_language.get() === "en"
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

    const currentContractId = getApartmentCurrentContractId(apartment);

    return costs
      .filter((cost) => {
        if (normalizeId(cost.apartmentId) !== normalizeId(apartment.id)) {
          return false;
        }

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

  function getApartmentRealizedIncomeForRange(apartment, rangeStart, rangeEnd) {
    if (!apartment) return 0;

    const apartmentId = apartment.id;
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!apartmentId || !currentContractId) {
      return 0;
    }

    const apartmentPayments = payments.filter((payment) => {
      if (normalizeId(payment.apartmentId) !== normalizeId(apartmentId)) {
        return false;
      }

      if (normalizeId(payment.contractId) !== normalizeId(currentContractId)) {
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

  function getApartmentLateAmount(apartment, rangeEnd) {
    if (!apartment || !isApartmentOccupied(apartment)) {
      return 0;
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
      buildingApartments.forEach((apartment) => {
        const income = getApartmentRealizedIncomeForRange(apartment, start, end);
        const apartmentCosts = getApartmentCostsForRange(apartment, start, end);
        const lateAmount = getApartmentLateAmount(apartment, end);
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
