document.addEventListener("DOMContentLoaded", async () => {
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

  let building = buildings.find((b) => normalizeId(b.id) === buildingId) || null;
  let buildingApartments = apartments.filter(
    (a) => normalizeId(a.buildingId) === buildingId
  );

  /** contractId -> installment rows from API (paid income) */
  let serverInstallmentsByContract = new Map();
  let incomeFromApi = false;

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

  async function loadInstallmentsForFinanceApartments(apts) {
    serverInstallmentsByContract = new Map();
    if (
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth ||
      !apts?.length
    ) {
      return;
    }
    const cids = [
      ...new Set(
        apts
          .map((a) => getApartmentCurrentContractId(a))
          .filter((id) => id != null && String(id) !== "")
      ),
    ];
    await Promise.all(
      cids.map(async (cid) => {
        const key = String(cid);
        try {
          const res = await WalajnaAuth.fetchWithAuth(
            `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(cid)}/installments`,
            { method: "GET" }
          );
          if (!res.ok) {
            serverInstallmentsByContract.set(key, []);
            return;
          }
          const rows = await res.json();
          serverInstallmentsByContract.set(
            key,
            Array.isArray(rows) ? rows : []
          );
        } catch {
          serverInstallmentsByContract.set(key, []);
        }
      })
    );
  }

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
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
          await loadInstallmentsForFinanceApartments(buildingApartments);
        }
      }
    } catch (e) {
      console.warn("finance-summary: API load failed, using local data", e);
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

  function calendarDayTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function paymentAnchorInRange(anchorRaw, rangeStart, rangeEnd) {
    if (!anchorRaw) return false;
    const d = new Date(anchorRaw);
    if (Number.isNaN(d.getTime())) return false;
    const day = calendarDayTime(d);
    return (
      day >= calendarDayTime(rangeStart) && day <= calendarDayTime(rangeEnd)
    );
  }

  function getApartmentRealizedIncomeForRange(apartment, rangeStart, rangeEnd) {
    if (!apartment) return 0;

    const apartmentId = apartment.id;
    const apiAptId =
      apartment.apiId != null ? String(apartment.apiId) : String(apartmentId);
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!apartmentId || !currentContractId) {
      return 0;
    }

    if (incomeFromApi) {
      const rows =
        serverInstallmentsByContract.get(String(currentContractId)) || [];
      let apiIncome = 0;
      rows.forEach((row) => {
        if (String(row.status || "").toLowerCase() !== "paid") return;
        if (
          row.apartment_id != null &&
          String(row.apartment_id) !== apiAptId
        ) {
          return;
        }
        const anchor =
          row.paid_at || row.paidAt || row.due_date || row.dueDate;
        if (!paymentAnchorInRange(anchor, rangeStart, rangeEnd)) return;
        apiIncome += Number(row.amount || 0);
      });
      return apiIncome;
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
