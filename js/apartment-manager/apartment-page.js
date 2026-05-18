document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  const paramsEarly = new URLSearchParams(window.location.search);
  const aptIdEarly = paramsEarly.get("id");
  const currentUserEarly =
    typeof getCurrentUser === "function" ? getCurrentUser() : null;
  const skipSessionBulkLoad = Boolean(aptIdEarly && currentUserEarly);

  if (!skipSessionBulkLoad) {
    if (typeof WalajnaBuildingsApi !== "undefined" && WalajnaBuildingsApi.refreshForSession) {
      try {
        await WalajnaBuildingsApi.refreshForSession();
      } catch (e) {
        console.warn("[apartment-page] buildings cache refresh failed", e);
      }
    }
    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
      try {
        await WalajnaApartmentsApi.refreshForSession();
      } catch (e) {
        console.warn("[apartment-page] apartments cache refresh failed", e);
      }
    }
  }
  if (typeof ensureRoleSetup === "function") {
    ensureRoleSetup();
  }
  /* =========================
     1) PAGE ELEMENTS
     ========================= */
  const title = document.getElementById("aptTitle");
  const roleLabel = document.getElementById("pageRoleLabel");

  const number = document.getElementById("aptNumber");
  const building = document.getElementById("buildingName");
  const status = document.getElementById("leaseStatus");
  const rent = document.getElementById("rentAmount");

  const floorNumberEl = document.getElementById("floorNumber");
  const bedroomsEl = document.getElementById("bedrooms");
  const bathroomsEl = document.getElementById("bathrooms");
  const livingRoomsEl = document.getElementById("livingRooms");

  const tenantFullNameEl = document.getElementById("tenantFullName");
  const tenantNationalityEl = document.getElementById("tenantNationality");
  const tenantTypeEl = document.getElementById("tenantType");
  const insurancePaidEl = document.getElementById("insurancePaid");
  const phoneNumberEl = document.getElementById("phoneNumber");
  const identityNumberEl = document.getElementById("identityNumber");

  const startDateEl = document.getElementById("startDate");
  const endDateEl = document.getElementById("endDate");
  const meterNumberEl = document.getElementById("meterNumber");
  const notesEl = document.getElementById("notes");

  const ownerInfoSection = document.getElementById("ownerInfoSection");
  const ownerFullNameEl = document.getElementById("ownerFullName");
  const ownerNationalIdEl = document.getElementById("ownerNationalId");

  const mainActionBtn = document.getElementById("mainActionBtn");
  const paymentsBtn = document.getElementById("paymentsBtn");
  const documentsBtn = document.getElementById("documentsBtn");
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");
  const renewContractBtn = document.getElementById("renewContractBtn");
  const evictTenantBtn = document.getElementById("evictTenantBtn");
  const tenantPayBtn = document.getElementById("tenantPayBtn");
  const viewCostsBtn = document.getElementById("viewCostsBtn");
  const actionsSection = document.querySelector("section.actions");

  if (!title && !number && !building && !status && !rent) return;

  /* =========================
     2) PAGE PARAMS
     ========================= */
  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");
  const activeRole = getActiveRole();
  const currentUser = getCurrentUser();

  if (!aptId) {
    if (title) title.textContent = T("aptPage.notFound");
    if (actionsSection) {
      actionsSection.classList.remove("actions--pending");
      actionsSection.removeAttribute("aria-busy");
    }
    return;
  }

  /* =========================
     3) LOAD DATA
     ========================= */
  const apartments = getApartments();
  const buildings = getBuildings();
  const users = typeof getUsers === "function" ? getUsers() : [];

  function sameId(a, b) {
    return String(a ?? "") === String(b ?? "");
  }

  function mapApiApartmentToLocal(apiApartment) {
    if (!apiApartment) return null;
    const lt =
      apiApartment.lease_terms && typeof apiApartment.lease_terms === "object"
        ? apiApartment.lease_terms
        : null;
    const cid = apiApartment.current_contract_id ?? null;
    let contract = null;
    if (cid || lt) {
      const yrForMonthly =
        lt?.yearlyRent != null && String(lt.yearlyRent).trim() !== ""
          ? Number(lt.yearlyRent)
          : NaN;
      const rentAmountFromYearly =
        Number.isFinite(yrForMonthly) && yrForMonthly > 0 ? yrForMonthly / 12 : undefined;
      contract = {
        id: cid,
        startDate:
          lt?.startDate != null ? String(lt.startDate).slice(0, 10) : undefined,
        endDate:
          lt?.endDate != null ? String(lt.endDate).slice(0, 10) : undefined,
        yearlyRent: lt?.yearlyRent,
        rentAmount: rentAmountFromYearly ?? lt?.monthlyRent,
        paymentCycle: lt?.paymentCycle,
        installmentsCount: lt?.installmentsCount,
        insurancePaid: lt?.insurancePaid,
        meterNumber: lt?.meterNumber,
        notes: lt?.notes,
        brokerInfo: lt?.brokerInfo,
        services: lt?.services,
      };
    }
    return {
      id: String(apiApartment.id ?? aptId),
      apiId: apiApartment.id ?? null,
      ownerId: apiApartment.owner_id ?? null,
      ownerPublicName:
        apiApartment.owner_public_name ?? apiApartment.ownerPublicName ?? null,
      ownerPublicNationalId:
        apiApartment.owner_public_national_id ??
        apiApartment.ownerPublicNationalId ??
        null,
      buildingId:
        apiApartment.building_id != null ? String(apiApartment.building_id) : null,
      buildingName:
        apiApartment.building_name ?? apiApartment.buildingName ?? "",
      number:
        apiApartment.apartment_number != null
          ? String(apiApartment.apartment_number)
          : null,
      floorNumber:
        apiApartment.floor_number != null
          ? Number(apiApartment.floor_number)
          : null,
      bedrooms:
        apiApartment.bedrooms != null
          ? Number(apiApartment.bedrooms)
          : null,
      bathrooms:
        apiApartment.bathrooms != null
          ? Number(apiApartment.bathrooms)
          : null,
      livingRooms:
        apiApartment.living_rooms != null
          ? Number(apiApartment.living_rooms)
          : apiApartment.livingRooms != null
            ? Number(apiApartment.livingRooms)
            : null,
      address: apiApartment.address || "",
      description: apiApartment.description || "",
      rent:
        apiApartment.rent != null && apiApartment.rent !== ""
          ? Number(apiApartment.rent)
          : "",
      tenantUserId: apiApartment.tenant_user_id ?? null,
      tenantNationalId: apiApartment.tenant_national_id ?? null,
      tenantInfo: apiApartment.tenant_info || null,
      currentContractId: apiApartment.current_contract_id ?? null,
      contractId: apiApartment.current_contract_id ?? null,
      leaseStatus: apiApartment.lease_status || "vacant",
      maintenanceId: apiApartment.maintenance_id ?? null,
      contract,
      leaseTerms: lt,
    };
  }

  function inferPaymentCycleFromInstallments(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length < 2) return undefined;
    const sorted = list
      .map((r) => String(r?.due_date || r?.dueDate || ""))
      .filter(Boolean)
      .sort();
    if (sorted.length < 2) return undefined;
    const d0 = new Date(sorted[0]);
    const d1 = new Date(sorted[1]);
    if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return undefined;
    const months = Math.max(
      1,
      (d1.getFullYear() - d0.getFullYear()) * 12 + (d1.getMonth() - d0.getMonth())
    );
    if (months >= 12) return "annual";
    if (months >= 6) return "semi_annual";
    if (months >= 3) return "quarterly";
    return "monthly";
  }

  /** One GET /installments per contract per page load (shared by lease meta + next payment). */
  const installmentRowsPromiseByContract = new Map();

  function getInstallmentRowsPromise(contractId) {
    const key = String(contractId ?? "").trim();
    if (!key || typeof WalajnaAuth === "undefined") return Promise.resolve([]);
    if (installmentRowsPromiseByContract.has(key)) {
      return installmentRowsPromiseByContract.get(key);
    }
    const p = (async () => {
      try {
        const res = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(key)}/installments`,
          { method: "GET" }
        );
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    })();
    installmentRowsPromiseByContract.set(key, p);
    return p;
  }

  async function fetchInstallmentsMeta(contractId) {
    const list = await getInstallmentRowsPromise(contractId);
    if (!list.length) return null;
    return {
      paymentCycle: inferPaymentCycleFromInstallments(list),
      installmentsCount: list.length,
    };
  }

  function contractNeedsApiEnrichment(contractData) {
    if (!contractData) return true;
    const hasDates = contractData.startDate && contractData.endDate;
    const yr = Number(contractData.yearlyRent ?? contractData.yearly_rent);
    const hasRent =
      (Number.isFinite(yr) && yr > 0) || Number(contractData.rentAmount || 0) > 0;
    return !hasDates || !hasRent;
  }

  async function fetchContractById(contractId) {
    if (!contractId || typeof WalajnaAuth === "undefined") return null;
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/contracts/${encodeURIComponent(String(contractId))}`,
        { method: "GET" }
      );
      if (!res.ok) return null;
      const match = await res.json();
      if (!match || typeof match !== "object") return null;
      let parsedTerms = null;
      if (typeof match.terms === "string" && match.terms.trim().startsWith("{")) {
        try {
          parsedTerms = JSON.parse(match.terms);
        } catch {
          parsedTerms = null;
        }
      }
      const needsInstallmentMeta =
        !match.payment_cycle &&
        !parsedTerms?.paymentCycle &&
        !parsedTerms?.payment_cycle &&
        match.installments_count == null &&
        parsedTerms?.installmentsCount == null &&
        parsedTerms?.installments_count == null;
      const installmentsMeta = needsInstallmentMeta
        ? await fetchInstallmentsMeta(contractId)
        : null;
      const termsNotes =
        (parsedTerms && (parsedTerms.notes || parsedTerms.note)) || "";
      const legacyTermsPlain =
        typeof match.terms === "string" &&
        match.terms.trim() &&
        !match.terms.trim().startsWith("{")
          ? match.terms
          : "";
      const leaseNotesCol = String(
        match.lease_notes ?? match.leaseNotes ?? ""
      ).trim();
      const meterCol = match.meter_number ?? match.meterNumber;
      const insuranceCol = match.insurance_paid ?? match.insurancePaid;

      return {
        id: match.id,
        startDate: match.start_date || "",
        endDate: match.end_date || "",
        yearlyRent:
          match.yearly_rent != null && match.yearly_rent !== ""
            ? Number(match.yearly_rent)
            : parsedTerms?.yearlyRent ?? parsedTerms?.yearly_rent ?? undefined,
        notes:
          leaseNotesCol ||
          termsNotes ||
          legacyTermsPlain ||
          "",
        meterNumber:
          (meterCol != null && String(meterCol).trim() !== ""
            ? String(meterCol).trim()
            : "") ||
          (parsedTerms &&
            (parsedTerms.meterNumber ||
              parsedTerms.meter_number ||
              parsedTerms.meter)) ||
          "",
        insurancePaid:
          insuranceCol != null && String(insuranceCol).trim() !== ""
            ? String(insuranceCol).trim()
            : String(
                parsedTerms?.insurancePaid ?? parsedTerms?.insurance_paid ?? ""
              ).trim() || "",
        paymentCycle:
          match.payment_cycle ||
          parsedTerms?.paymentCycle ||
          parsedTerms?.payment_cycle ||
          installmentsMeta?.paymentCycle ||
          undefined,
        installmentsCount:
          match.installments_count ??
          parsedTerms?.installmentsCount ??
          parsedTerms?.installments_count ??
          installmentsMeta?.installmentsCount ??
          undefined,
        rentAmount:
          (match.yearly_rent != null &&
          match.yearly_rent !== "" &&
          Number(match.yearly_rent) > 0
            ? Number(match.yearly_rent) / 12
            : undefined) ??
          match.rent_amount ??
          parsedTerms?.rentAmount ??
          parsedTerms?.rent ??
          undefined,
      };
    } catch {
      return null;
    }
  }

  async function fetchFreshApartmentById(apartmentId) {
    if (typeof WalajnaAuth === "undefined") return null;
    try {
      const response = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/apartments/${encodeURIComponent(apartmentId)}`,
        { method: "GET" }
      );
      if (!response.ok) return null;
      const apiApartment = await response.json();
      return mapApiApartmentToLocal(apiApartment);
    } catch {
      return null;
    }
  }

  let data = apartments.find((apt) => sameId(apt.id, aptId));

  // Logged-in: always refetch once so owner_public_* / tenant fields are not stuck on stale localStorage.
  const shouldRefreshFromApi = !data || Boolean(currentUser);
  if (shouldRefreshFromApi) {
    const freshApartment = await fetchFreshApartmentById(aptId);
    if (freshApartment) {
      if (
        freshApartment.currentContractId &&
        contractNeedsApiEnrichment(freshApartment.contract)
      ) {
        const freshContract = await fetchContractById(freshApartment.currentContractId);
        if (freshContract) {
          freshApartment.contract = {
            ...(freshApartment.contract || {}),
            ...freshContract,
          };
        }
      }
      data = freshApartment;

      const existing = apartments.find((apt) => sameId(apt.id, aptId));
      if (existing && typeof saveUpdatedApartment === "function") {
        saveUpdatedApartment({ ...existing, ...freshApartment });
      } else if (typeof saveApartments === "function") {
        saveApartments([...apartments, freshApartment]);
      }
    }
  }

  if (!data) {
    if (title) title.textContent = T("aptPage.notFound");
    if (actionsSection) {
      actionsSection.classList.remove("actions--pending");
      actionsSection.removeAttribute("aria-busy");
    }
    return;
  }

  const buildingData =
    buildings.find((b) => sameId(b.id, data.buildingId)) || null;

  /* =========================
     4) HELPERS
     ========================= */
  /** Avoid float noise (e.g. 20000/12*12 → 20000.04) when showing SAR. */
  function roundMoneySAR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function toEnglishDigits(value) {
    return String(value ?? "")
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  }

  function forceLatinDigitsLocale(locale, fallback) {
    const base = String(locale || fallback || "en-GB").trim();
    return base.includes("-u-nu-") ? base : `${base}-u-nu-latn`;
  }

  function formatMoney(value) {
    const locRaw =
      window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-SA"
          : "ar-SA";
    const loc = forceLatinDigitsLocale(locRaw, "en-SA");
    const rounded = roundMoneySAR(value);
    return toEnglishDigits(
      `${rounded.toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${T("common.sar")}`
    );
  }

  function normalizePaymentCycleForUi(cycle) {
    if (typeof cycle === "number" && Number.isFinite(cycle)) {
      if (cycle === 1) return "monthly";
      if (cycle === 4) return "quarterly";
      if (cycle === 2) return "semi_annual";
      if (cycle === 12) return "annual";
    }
    const c = String(cycle || "monthly")
      .toLowerCase()
      .trim()
      .replace(/-/g, "_");
    if (c === "1" || c === "month") return "monthly";
    if (c === "4" || c === "quarter" || c === "qtr") return "quarterly";
    if (c === "semi" || c === "half_yearly" || c === "halfyearly" || c === "2") return "semi_annual";
    if (c === "yearly" || c === "12") return "annual";
    if (["monthly", "quarterly", "semi_annual", "annual"].includes(c)) return c;
    return "monthly";
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const locRaw =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB"
          : "ar-SA";
    const loc = forceLatinDigitsLocale(locRaw, "en-GB");
    return toEnglishDigits(date.toLocaleDateString(loc));
  }

  function getPaymentCycleLabel(cycle) {
    const k =
      cycle === "quarterly"
        ? "payments.cycle.quarterly"
        : cycle === "semi_annual"
          ? "payments.cycle.semi"
          : cycle === "annual"
            ? "payments.cycle.annual"
            : "payments.cycle.monthly";
    return T(k);
  }
   function getCurrentContractId() {
  return (
    data.currentContractId ||
    data.contract?.id ||
    data.contractId ||
    null
  );
}
  function getCycleMonthsCount(cycle) {
    const monthsMap = {
      monthly: 1,
      quarterly: 3,
      semi_annual: 6,
      annual: 12,
    };

    return monthsMap[normalizePaymentCycleForUi(cycle)] || 1;
  }

  function hasTenantData(apartmentData) {
    return !!(
      apartmentData?.tenantUserId ||
      apartmentData?.tenantNationalId ||
      apartmentData?.tenantInfo?.fullName ||
      apartmentData?.tenantInfo?.phoneNumber ||
      apartmentData?.tenantInfo?.nationality ||
      apartmentData?.tenantInfo?.tenantType
    );
  }

  function hasContractData(apartmentData) {
    return !!(
      apartmentData?.contract?.startDate ||
      apartmentData?.contract?.endDate ||
      apartmentData?.contract?.rentAmount ||
      apartmentData?.contract?.paymentCycle ||
      apartmentData?.contract?.meterNumber ||
      apartmentData?.contract?.notes
    );
  }

  function isApartmentOccupied(apartmentData) {
    return hasTenantData(apartmentData);
  }

  function getEffectiveLeaseStatus(apartmentData) {
    return isApartmentOccupied(apartmentData) ? "active" : "vacant";
  }

  function getLeaseStatusLabel(leaseStatus) {
    switch (leaseStatus) {
      case "ending_soon":
        return T("aptLease.ending_soon");
      case "ended":
        return T("aptLease.ended");
      case "overdue":
        return T("aptLease.overdue_state");
      case "occupied":
      case "active":
        return T("aptLease.rented");
      case "vacant":
      default:
        return T("aptLease.vacant_label");
    }
  }

  function buildNormalizedApartment(apartmentData) {
    const occupied = isApartmentOccupied(apartmentData);
    const updated = { ...apartmentData };

    if (!occupied) {
      updated.leaseStatus = "vacant";
      return updated;
    }

    const normalized =
      typeof normalizeApartmentLeaseStatus === "function"
        ? normalizeApartmentLeaseStatus(updated)
        : updated;

    if (!normalized.leaseStatus || normalized.leaseStatus === "vacant") {
      normalized.leaseStatus = "active";
    }

    return normalized;
  }

  data = buildNormalizedApartment(data);
  saveUpdatedApartment(data);

  const contract = data.contract || {};
  const effectiveLeaseStatus = getEffectiveLeaseStatus(data);

  let remainingDays = null;
  if (contract.endDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    remainingDays = daysBetween(todayStr, contract.endDate);
  }

  function getMonthlyRent(contractData) {
    const y = Number(contractData?.yearlyRent ?? contractData?.yearly_rent);
    if (Number.isFinite(y) && y > 0) return y / 12;
    return Number(contractData?.rentAmount || 0);
  }

  /**
   * When only monthly is stored (yearly ÷ 12 rounded to 2 decimals), `m * 12` becomes e.g. 20000.04.
   * Snap to the nearest whole riyal if the drift is tiny; otherwise keep 2-decimal SAR.
   */
  function deriveYearlySARFromMonthlyStored(monthly) {
    const m = Number(monthly);
    if (!Number.isFinite(m) || m <= 0) return 0;
    const raw = m * 12;
    const nearestWhole = Math.round(raw);
    if (Math.abs(raw - nearestWhole) < 0.06) return nearestWhole;
    return roundMoneySAR(raw);
  }

  /** Prefer stored yearly rent (exact user input); else derive from monthly without ×12 float junk. */
  function getYearlyRentForContract(contractData) {
    const y = Number(contractData?.yearlyRent ?? contractData?.yearly_rent);
    if (Number.isFinite(y) && y > 0) return roundMoneySAR(y);
    return deriveYearlySARFromMonthlyStored(getMonthlyRent(contractData));
  }

  function getContractMonths(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end <= start) return 0;

    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
    );
  }

  function getInstallmentAmount(contractData) {
    const monthlyRent = getMonthlyRent(contractData);
    const yearlyRent = getYearlyRentForContract(contractData);
    const paymentCycle = normalizePaymentCycleForUi(
      contractData?.paymentCycle || contractData?.payment_cycle || "monthly"
    );
    let installmentsCount = Number(contractData?.installmentsCount || 0);

    const contractMonths = getContractMonths(
      contractData?.startDate,
      contractData?.endDate
    );

    const cm = getCycleMonthsCount(paymentCycle);
    const fromLease =
      contractData?.startDate && contractData?.endDate
        ? (() => {
            const start = new Date(contractData.startDate);
            const end = new Date(contractData.endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
              return null;
            }
            let n = 0;
            let cur = new Date(start);
            while (cur < end) {
              n += 1;
              const d = new Date(cur);
              const od = d.getDate();
              d.setMonth(d.getMonth() + cm);
              if (d.getDate() < od) d.setDate(0);
              cur = d;
            }
            return n > 0 ? n : null;
          })()
        : null;
    if (fromLease != null && fromLease > 0) installmentsCount = fromLease;

    if (installmentsCount > 0 && contractMonths > 0) {
      const impliedMonthly = yearlyRent > 0 ? yearlyRent / 12 : monthlyRent;
      const totalContractRent = roundMoneySAR(impliedMonthly * contractMonths);
      return roundMoneySAR(totalContractRent / installmentsCount);
    }

    const monthsCount = getCycleMonthsCount(paymentCycle);
    return roundMoneySAR((yearlyRent > 0 ? yearlyRent / 12 : monthlyRent) * monthsCount);
  }

  function updateRentDisplay(contractData) {
    if (!rent) return;

    const ls = String(data.leaseStatus || effectiveLeaseStatus || "").toLowerCase();
    if (ls === "vacant" || !getCurrentContractId()) {
      rent.textContent = "—";
      return;
    }

    const monthlyRent = getMonthlyRent(contractData);
    const paymentCycle = normalizePaymentCycleForUi(
      contractData?.paymentCycle || contractData?.payment_cycle || "monthly"
    );
    const installmentAmount = getInstallmentAmount(contractData);
    const cycleLabel = getPaymentCycleLabel(paymentCycle);

    if (!monthlyRent && !getYearlyRentForContract(contractData)) {
      rent.textContent = "—";
      return;
    }

    const annualRent = getYearlyRentForContract(contractData);

    rent.textContent = T("aptPage.annualSummary", {
      a: formatMoney(annualRent),
      i: formatMoney(installmentAmount),
      c: cycleLabel,
    });
  }

  /** @deprecated Local `walajna_payments` removed; use `fetchNextUnpaidInstallmentFromApi` when online. */
  function getNextDuePayment(_apartmentId) {
    return null;
  }

  async function fetchNextUnpaidInstallmentFromApi(contractId) {
    if (!contractId || typeof WalajnaAuth === "undefined") return null;
    try {
      const rows = await getInstallmentRowsPromise(contractId);
      if (!Array.isArray(rows) || !rows.length) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sorted = [...rows].sort((a, b) =>
        String(a.due_date || "").localeCompare(String(b.due_date || ""))
      );
      for (const r of sorted) {
        if (r.status === "paid" || r.status === "cancelled") continue;
        const dueStr = (r.due_date || "").toString().slice(0, 10);
        const due = new Date(dueStr);
        due.setHours(0, 0, 0, 0);
        let st = r.status || "pending";
        if (
          st === "pending" &&
          !Number.isNaN(due.getTime()) &&
          due < today
        ) {
          st = "overdue";
        }
        if (st === "paid" || st === "cancelled") continue;
        return {
          id: String(r.id),
          dueDate: dueStr,
          amount: Number(r.amount ?? 0),
          contractId: String(contractId),
        };
      }
      return null;
    } catch {
      return null;
    }
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
  async function updateNextPaymentInfo(apartmentId) {
    const dateEl = document.getElementById("nextPaymentDate");
    const amountEl = document.getElementById("nextPaymentAmount");

    if (!dateEl || !amountEl) return;

    if (effectiveLeaseStatus === "vacant") {
      dateEl.textContent = "";
      amountEl.textContent = T("aptPage.noPayments");
      return;
    }

    const contractId = getCurrentContractId();
    let nextPayment =
      contractId && typeof WalajnaAuth !== "undefined"
        ? await fetchNextUnpaidInstallmentFromApi(contractId)
        : null;
    if (!nextPayment) {
      nextPayment = getNextDuePayment(apartmentId);
    }

    if (!nextPayment) {
      dateEl.textContent = "";
      amountEl.textContent = T("aptPage.noPayments");
      return;
    }

    const dueDate = new Date(nextPayment.dueDate);
    const today = new Date();

    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const loc =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB-u-nu-latn"
          : "ar-SA-u-nu-latn";
    const formattedDate = toEnglishDigits(dueDate.toLocaleDateString(loc));

    dateEl.textContent = "— " + formattedDate;
    amountEl.textContent = formatMoney(nextPayment.amount);

    dateEl.classList.remove(
      "next-payment-normal",
      "next-payment-warning",
      "next-payment-overdue"
    );

    if (diffDays < 0) {
      dateEl.classList.add("next-payment-overdue");
    } else if (diffDays <= 5) {
      dateEl.classList.add("next-payment-warning");
    } else {
      dateEl.classList.add("next-payment-normal");
    }
  }

  function updatePageTitle() {
    if (!title) return;

    const aptNumber = data.number || data.apartmentNumber || "—";
    const buildingName = buildingData?.name || data.buildingName || "—";

    title.textContent = T("aptPage.titleDynamic", {
      n: aptNumber,
      b: buildingName,
    });
  }

  function fillExtraApartmentInfo() {
    if (floorNumberEl) {
      floorNumberEl.textContent =
        data.floorNumber ?? data.contract?.floorNumber ?? "—";
    }

    if (bedroomsEl) {
      bedroomsEl.textContent =
        data.bedrooms ??
        data.roomsCount ??
        data.contract?.roomsCount ??
        data.contract?.bedrooms ??
        "—";
    }

    if (bathroomsEl) {
      bathroomsEl.textContent =
        data.bathrooms ??
        data.bathroomsCount ??
        data.contract?.bathroomsCount ??
        "—";
    }

    if (livingRoomsEl) {
      livingRoomsEl.textContent =
        data.livingRooms ??
        data.living_rooms ??
        data.livingRoomsCount ??
        data.contract?.livingRooms ??
        data.contract?.livingRoomsCount ??
        "—";
    }
  }

  function fillTenantInfo() {
    const tenantInfo = data.tenantInfo || {};

    if (tenantFullNameEl) {
      tenantFullNameEl.textContent = tenantInfo.fullName || "—";
    }

    if (tenantNationalityEl) {
      tenantNationalityEl.textContent = tenantInfo.nationality || "—";
    }

    if (tenantTypeEl) {
      tenantTypeEl.textContent = tenantInfo.tenantType || "—";
    }

    if (insurancePaidEl) {
      insurancePaidEl.textContent = contract.insurancePaid
        ? toEnglishDigits(String(contract.insurancePaid))
        : "—";
    }

    if (phoneNumberEl) {
      phoneNumberEl.textContent = tenantInfo.phoneNumber || "—";
    }

    if (identityNumberEl) {
      identityNumberEl.textContent = data.tenantNationalId
        ? toEnglishDigits(String(data.tenantNationalId))
        : "—";
    }
  }

  function fillAdditionalInfo() {
    if (startDateEl) startDateEl.textContent = formatDate(contract.startDate);
    if (endDateEl) endDateEl.textContent = formatDate(contract.endDate);
    if (meterNumberEl) {
      meterNumberEl.textContent = contract.meterNumber
        ? toEnglishDigits(String(contract.meterNumber))
        : "—";
    }
    if (notesEl) notesEl.textContent = contract.notes || "—";
  }

  /**
   * Show "معلومات المالك" only when not browsing as مالك (tenant / other roles).
   * Owner view must never show this block — it depended on tenant_user_id before and looked random across units.
   */
  function shouldShowLandlordCard() {
    if (!data) return false;
    return activeRole !== "owner";
  }

  function fillOwnerInfoForTenantOnly() {
    if (!ownerInfoSection) return;

    if (!shouldShowLandlordCard()) {
      ownerInfoSection.style.display = "none";
      return;
    }

    ownerInfoSection.style.display = "block";

    const fromApiName = String(
      data.ownerPublicName || data.owner_public_name || ""
    ).trim();
    const fromApiNid = String(
      data.ownerPublicNationalId || data.owner_public_national_id || ""
    ).trim();

    let name = fromApiName || null;
    let nid = fromApiNid || null;

    if (!name && !nid) {
      const owner = users.find(
        (u) => String(u.id ?? "") === String(data.ownerId ?? "")
      );
      if (owner) {
        name =
          owner.fullName || owner.name || null;
        nid = owner.nationalId || owner.national_id || null;
      }
    }

    if (ownerFullNameEl) {
      ownerFullNameEl.textContent = name || "—";
    }
    if (ownerNationalIdEl) {
      ownerNationalIdEl.textContent = nid || "—";
    }
  }

  function goToPaymentsPage() {
    const idParam = encodeURIComponent(data.apiId ?? data.id ?? aptId);
    window.location.href = `../main/payments.html?id=${idParam}`;
  }

  async function goToPaymentOptionsPage() {
    const contractId = getCurrentContractId();
    let nextPayment =
      contractId && typeof WalajnaAuth !== "undefined"
        ? await fetchNextUnpaidInstallmentFromApi(contractId)
        : null;
    if (!nextPayment) {
      nextPayment = getNextDuePayment(aptId);
    }

    if (!nextPayment) {
      alert(T("aptPage.noDuePayments"));
      return;
    }

    const cid =
      contractId ||
      (nextPayment.contractId != null ? String(nextPayment.contractId) : null);

    const aptParam = encodeURIComponent(data.apiId ?? data.id ?? aptId);
    let href =
      `../main/payment-options.html?id=${aptParam}` +
      `&paymentId=${encodeURIComponent(nextPayment.id)}`;
    if (cid != null && cid !== "") {
      href += `&contractId=${encodeURIComponent(cid)}`;
    }
    window.location.href = href;
  }

  function ensureHistoryButton() {
    if (activeRole !== "owner") return;

    const actionsRow =
      mainActionBtn?.parentElement ||
      renewContractBtn?.parentElement ||
      evictTenantBtn?.parentElement ||
      paymentsBtn?.parentElement ||
      documentsBtn?.parentElement ||
      viewRequestsBtn?.parentElement ||
      viewCostsBtn?.parentElement;

    if (!actionsRow) return;
    if (document.getElementById("apartmentHistoryBtn")) return;

    const historyBtn = document.createElement("button");
    historyBtn.id = "apartmentHistoryBtn";
    historyBtn.type = "button";
    historyBtn.textContent = T("aptPage.historyBtn");

    if (mainActionBtn) {
      historyBtn.className = mainActionBtn.className;
    }

    historyBtn.addEventListener("click", () => {
      window.location.href = `../owners/apartment_history.html?apartmentId=${encodeURIComponent(aptId)}`;
    });

    actionsRow.appendChild(historyBtn);
  }

  function buildTenantHistoryEntry(apartmentData) {
    return {
      historyId: "H" + Date.now(),
      apartmentId: apartmentData.id,
      buildingId: apartmentData.buildingId || null,
      buildingName: apartmentData.buildingName || buildingData?.name || "",
      apartmentNumber: apartmentData.number || apartmentData.apartmentNumber || "",

      tenantInfo: { ...(apartmentData.tenantInfo || {}) },
      tenantNationalId: apartmentData.tenantNationalId || null,
      tenantUserId: apartmentData.tenantUserId || null,

      contract: { ...(apartmentData.contract || {}) },

      archivedAt: new Date().toISOString(),
      archiveReason: "vacated",
    };
  }

  function hideActionButtons() {
    hideElement(mainActionBtn);
    hideElement(paymentsBtn);
    hideElement(documentsBtn);
    hideElement(viewRequestsBtn);
    hideElement(renewContractBtn);
    hideElement(evictTenantBtn);
    hideElement(tenantPayBtn);
    hideElement(viewCostsBtn);
  }

  function applyTenantPayStyle() {
    if (!tenantPayBtn) return;

    tenantPayBtn.style.background = "#111827";
    tenantPayBtn.style.color = "#fff";
    tenantPayBtn.style.border = "none";
  }

  function applyActionVisibility() {
    hideActionButtons();

    if (activeRole === "owner") {
      if (effectiveLeaseStatus === "vacant") {
        if (mainActionBtn) {
          mainActionBtn.textContent = T("aptPage.linkTenant");
          if (!buildingUnitLayoutOk) {
            mainActionBtn.disabled = true;
            mainActionBtn.setAttribute("aria-disabled", "true");
            mainActionBtn.title = T("building.completeLayoutAlert");
          } else {
            mainActionBtn.disabled = false;
            mainActionBtn.removeAttribute("aria-disabled");
            mainActionBtn.removeAttribute("title");
          }
          showElement(mainActionBtn);
        }
        if (actionsSection) {
          actionsSection.classList.remove("actions--pending");
          actionsSection.removeAttribute("aria-busy");
        }
        return;
      }

      if (mainActionBtn) {
        mainActionBtn.textContent = T("aptPage.editApt");
        mainActionBtn.disabled = false;
        mainActionBtn.removeAttribute("aria-disabled");
        mainActionBtn.removeAttribute("title");
        showElement(mainActionBtn);
      }

      showElement(paymentsBtn);
      showElement(documentsBtn);
      showElement(viewRequestsBtn);
      showElement(evictTenantBtn);
      showElement(viewCostsBtn);

      if (renewContractBtn) {
        showElement(renewContractBtn);
        renewContractBtn.disabled = !(
          remainingDays !== null &&
          remainingDays <= 30 &&
          remainingDays >= 0
        );
      }

      hideElement(tenantPayBtn);
      if (actionsSection) {
        actionsSection.classList.remove("actions--pending");
        actionsSection.removeAttribute("aria-busy");
      }
      return;
    }

    if (effectiveLeaseStatus === "vacant") {
      if (actionsSection) {
        actionsSection.classList.remove("actions--pending");
        actionsSection.removeAttribute("aria-busy");
      }
      return;
    }

    if (mainActionBtn) {
      mainActionBtn.textContent = T("aptPage.maintenanceRequest");
      showElement(mainActionBtn);
    }

    showElement(paymentsBtn);
    showElement(documentsBtn);
    showElement(viewRequestsBtn);

    if (tenantPayBtn) {
      showElement(tenantPayBtn);
      applyTenantPayStyle();
    }
    if (actionsSection) {
      actionsSection.classList.remove("actions--pending");
      actionsSection.removeAttribute("aria-busy");
    }
  }

  async function resolveOwnerBuildingUnitLayoutOk(apartmentRow, localBuildingRow) {
    if (
      !apartmentRow?.buildingId ||
      typeof WalajnaApartmentsApi === "undefined" ||
      !WalajnaApartmentsApi.isBuildingUnitLayoutComplete ||
      !WalajnaApartmentsApi.listForBuilding
    ) {
      return true;
    }
    try {
      const bid = String(apartmentRow.buildingId ?? "");
      let bRow = localBuildingRow;
      if (
        (!bRow || (bRow.apartmentCount == null && bRow.apartments_count == null)) &&
        typeof WalajnaBuildingsApi !== "undefined" &&
        WalajnaBuildingsApi.getSessionList
      ) {
        const fromSession = WalajnaBuildingsApi.getSessionList().find(
          (b) => String(b.id) === bid || String(b.code ?? "").trim() === bid
        );
        if (fromSession) bRow = fromSession;
      }
      if (
        (!bRow || (bRow.apartmentCount == null && bRow.apartments_count == null)) &&
        typeof WalajnaAuth !== "undefined" &&
        WalajnaAuth.fetchWithAuth
      ) {
        const bRes = await WalajnaAuth.fetchWithAuth(
          `${WalajnaAuth.API_BASE}/api/buildings`,
          { method: "GET" }
        );
        if (bRes.ok) {
          const list = await bRes.json();
          const fromApi = (Array.isArray(list) ? list : []).find(
            (b) => String(b.id) === bid || String(b.code ?? "").trim() === bid
          );
          if (fromApi) bRow = fromApi;
        }
      }
      if (!bRow) return true;
      const mappedBuilding = {
        id: bRow.id ?? apartmentRow.buildingId,
        apartmentCount: bRow.apartmentCount ?? bRow.apartments_count,
        apartments_count: bRow.apartments_count ?? bRow.apartmentCount,
      };
      const apts = await WalajnaApartmentsApi.listForBuilding(apartmentRow.buildingId);
      return WalajnaApartmentsApi.isBuildingUnitLayoutComplete(mappedBuilding, apts);
    } catch (e) {
      console.warn("[apartment-page] unit layout gate skipped", e);
      return true;
    }
  }

  let buildingUnitLayoutOk = true;
  if (activeRole === "owner" && currentUser) {
    void resolveOwnerBuildingUnitLayoutOk(data, buildingData).then((ok) => {
      buildingUnitLayoutOk = ok;
      applyActionVisibility();
    });
  }

  /* Owner/tenant bottom actions before any slow payment API — avoids ~2s flash of wrong buttons */
  applyActionVisibility();
  ensureHistoryButton();

  /* =========================
     5) FILL UI
     ========================= */
  fillApartmentInfoUI(data, buildingData);
  updatePageTitle();
  updateRentDisplay(contract);
  fillExtraApartmentInfo();
  fillTenantInfo();
  fillAdditionalInfo();
  fillOwnerInfoForTenantOnly();
  await updateNextPaymentInfo(aptId);

  if (status) {
    status.textContent = getLeaseStatusLabel(data.leaseStatus || effectiveLeaseStatus);
  }

  if (roleLabel) {
    roleLabel.textContent =
      activeRole === "owner" ? T("aptPage.viewOwner") : T("aptPage.viewTenant");
  }

  const uiRoleForWidgets =
    activeRole === "owner" || activeRole === "tenant"
      ? activeRole
      : currentUser?.role || "tenant";

  /* =========================
     6) INIT FEATURES
     ========================= */
  if (typeof WalajnaDocumentsApi !== "undefined" && WalajnaDocumentsApi.refreshForApartment) {
    try {
      const serverDocApartmentId =
        data.apiId != null ? data.apiId : data.id != null ? data.id : aptId;
      await WalajnaDocumentsApi.refreshForApartment(aptId, serverDocApartmentId);
    } catch (e) {
      console.warn("[apartment-page] documents refresh failed", e);
    }
  }
  initDocumentsSystem(aptId);
  initRequestsSystem(aptId, uiRoleForWidgets, currentUser, effectiveLeaseStatus, data);
  const linkTenantSystem = initLinkTenantSystem(aptId, currentUser, {
    canAssignTenant: () => buildingUnitLayoutOk,
  });

  /* Renew button state may depend on payment fetch — refresh actions once */
  applyActionVisibility();
  ensureHistoryButton();

  /* =========================
     8) MAIN ACTION
     ========================= */
  if (mainActionBtn) {
    mainActionBtn.addEventListener("click", () => {
      if (activeRole === "owner") {
        if (effectiveLeaseStatus === "vacant") {
          linkTenantSystem.openLinkTenantModal();
        } else {
          linkTenantSystem.openEditTenantModal();
        }
        return;
      }

      // Tenant: requests module binds the same button
    });
  }

  /* =========================
     9) PAYMENTS
     ========================= */
  if (paymentsBtn) {
    paymentsBtn.addEventListener("click", goToPaymentsPage);
  }

  if (tenantPayBtn) {
    tenantPayBtn.addEventListener("click", () => {
      void goToPaymentOptionsPage();
    });
  }

  /* =========================
     10) COSTS
     ========================= */
  if (viewCostsBtn) {
    viewCostsBtn.addEventListener("click", () => {
      if (!aptId) {
        alert(T("aptPage.cannotIdentify"));
        return;
      }

      window.location.href = `../main/costs.html?id=${encodeURIComponent(aptId)}`;
    });
  }

  /* =========================
     11) RENEW CONTRACT
     ========================= */
  if (renewContractBtn) {
    renewContractBtn.addEventListener("click", () => {
      if (remainingDays === null || remainingDays > 30) {
        alert(T("aptPage.renewWindow"));
        return;
      }

      alert(T("aptPage.renewSoon"));
    });
  }

  /* =========================
     12) EVICT TENANT
     ========================= */
 if (evictTenantBtn) {
  evictTenantBtn.addEventListener("click", async () => {
    const evictionCheck = canEvictApartment(data);
    if (!evictionCheck.allowed) {
      alert(evictionCheck.message);
      return;
    }

    const currentContractId =
      data.currentContractId ||
      data.contract?.id ||
      data.contractId ||
      null;

    let openRequests = [];
    const apiAid =
      data.apiId != null ? Number(data.apiId) : Number(aptId);
    if (
      currentContractId &&
      typeof WalajnaTenantRequests !== "undefined" &&
      WalajnaAuth?.fetchWithAuth &&
      Number.isFinite(apiAid)
    ) {
      try {
        const rows = await WalajnaTenantRequests.list(apiAid);
        openRequests = (rows || []).filter((row) => {
          const st = String(row.status || "").toLowerCase();
          if (st === "resolved" || st === "closed") return false;
          const cid = row.contract_id;
          return cid != null && String(cid) === String(currentContractId);
        });
      } catch (e) {
        console.warn("[apartment-page] evict requests check", e);
      }
    }

    if (openRequests.length > 0) {
      alert(T("aptPage.evacBlockedRequests"));
      return;
    }

    if (!confirm(T("aptPage.confirmEvict"))) return;

    const authed =
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser?.();
    if (
      authed &&
      typeof WalajnaApartmentsApi !== "undefined" &&
      WalajnaApartmentsApi.vacateTenant &&
      Number.isFinite(apiAid)
    ) {
      try {
        await WalajnaApartmentsApi.vacateTenant(apiAid);
        alert(T("aptPage.evicted"));
        window.location.reload();
        return;
      } catch (e) {
        alert(e?.message || String(e));
        return;
      }
    }

    const updatedApartments = getApartments().map((apt) => {
      if (apt.id !== aptId) return apt;

      const apartmentHasTenantData =
        !!apt.tenantUserId ||
        !!apt.tenantNationalId ||
        !!apt.tenantInfo?.fullName ||
        !!apt.contract?.startDate ||
        !!apt.contract?.endDate;

      const tenantHistory = Array.isArray(apt.tenantHistory)
        ? [...apt.tenantHistory]
        : [];

      if (apartmentHasTenantData) {
        tenantHistory.push(buildTenantHistoryEntry(apt));
      }

      return {
        ...apt,
        tenantHistory,
        tenantUserId: null,
        tenantNationalId: null,
        tenantInfo: {},
        contract: {},
        currentContractId: null,
        leaseStatus: "vacant",
        maintenanceId: null,
      };
    });

    saveApartments(updatedApartments);

    alert(T("aptPage.evicted"));
    window.location.reload();
  });
}

  function refreshI18nTexts() {
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
    fillApartmentInfoUI(data, buildingData);
    updatePageTitle();
    updateRentDisplay(contract);
    fillExtraApartmentInfo();
    fillTenantInfo();
    fillAdditionalInfo();
    fillOwnerInfoForTenantOnly();
    updateNextPaymentInfo(aptId);
    if (status) {
      status.textContent = getLeaseStatusLabel(data.leaseStatus || effectiveLeaseStatus);
      if (typeof applyLeaseStatusStyle === "function") {
        applyLeaseStatusStyle(status, data.leaseStatus || effectiveLeaseStatus);
      }
    }
    if (roleLabel) {
      roleLabel.textContent =
        activeRole === "owner" ? T("aptPage.viewOwner") : T("aptPage.viewTenant");
    }
    applyActionVisibility();
    ensureHistoryButton();
    const hb = document.getElementById("apartmentHistoryBtn");
    if (hb) hb.textContent = T("aptPage.historyBtn");
  }

  document.addEventListener("walajna:i18n-applied", refreshI18nTexts);

  /* =========================
     13) CLICKABLE CARDS (GLOBAL)
     ========================= */
  document.querySelectorAll(".clickable-card").forEach((card) => {
    card.addEventListener("click", () => {
      const target = card.dataset.target;
      const id = card.dataset.id;

      if (!target) return;

      let url = target;
      if (id) url += "?id=" + encodeURIComponent(id);

      window.location.href = url;
    });
  });
});

/** Paste in console on apartment_info.html: walajnaDiagnoseApartmentPage() */
window.walajnaDiagnoseApartmentPage = async function walajnaDiagnoseApartmentPage() {
  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");
  const API = typeof WalajnaAuth !== "undefined" ? WalajnaAuth.API_BASE : "(WalajnaAuth missing)";
  const report = {
    page: window.location.href,
    urlApartmentId: aptId,
    apiBase: API,
    loggedIn: !!(typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser && WalajnaAuth.getCurrentUser()),
    user: typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser ? WalajnaAuth.getCurrentUser() : null,
    activeRole:
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.getActiveRole
        ? WalajnaAuth.getActiveRole()
        : sessionStorage.getItem("activeRole"),
    localStorageApartments: [],
    localStorageBuildings: [],
    apiListApartments: null,
    apiSingleApartment: null,
    diagnosis: [],
  };

  try {
    report.localStorageApartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  } catch (e) {
    report.localStorageApartments = { parseError: String(e) };
  }
  try {
    report.sessionBuildings =
      typeof WalajnaBuildingsApi !== "undefined" && WalajnaBuildingsApi.getSessionList
        ? WalajnaBuildingsApi.getSessionList()
        : [];
  } catch (e) {
    report.localStorageBuildings = { parseError: String(e) };
  }

  const localMatch = Array.isArray(report.localStorageApartments)
    ? report.localStorageApartments.find((a) => String(a.id) === String(aptId))
    : null;
  report.localMatch = localMatch || null;

  if (!aptId) {
    report.diagnosis.push("No ?id= in URL.");
  } else if (!/^\d+$/.test(String(aptId).trim())) {
    report.diagnosis.push(
      `URL id "${aptId}" is NOT a server numeric id (API expects digits only, e.g. id=12). This often comes from old cached data after a DB reset.`
    );
  }

  if (typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
    report.diagnosis.push("WalajnaAuth not loaded — open page from the app, not a saved HTML file.");
    console.table(report);
    return report;
  }

  try {
    const listRes = await WalajnaAuth.fetchWithAuth(`${API}/api/apartments`, { method: "GET" });
    const listText = await listRes.text();
    let listJson = null;
    try {
      listJson = listText ? JSON.parse(listText) : null;
    } catch {
      listJson = listText;
    }
    report.apiListApartments = { status: listRes.status, ok: listRes.ok, body: listJson };
    if (listRes.status === 503) {
      report.diagnosis.push("API returned 503 — Render waking up or Supabase unavailable. Wait 30–60s and retry.");
    } else if (!listRes.ok) {
      report.diagnosis.push(`GET /api/apartments failed (${listRes.status}).`);
    }
  } catch (e) {
    report.apiListApartments = { error: String(e) };
    report.diagnosis.push("Network error calling GET /api/apartments.");
  }

  if (aptId) {
    try {
      const oneRes = await WalajnaAuth.fetchWithAuth(
        `${API}/api/apartments/${encodeURIComponent(aptId)}`,
        { method: "GET" }
      );
      const oneText = await oneRes.text();
      let oneJson = null;
      try {
        oneJson = oneText ? JSON.parse(oneText) : null;
      } catch {
        oneJson = oneText;
      }
      report.apiSingleApartment = { status: oneRes.status, ok: oneRes.ok, body: oneJson };
      if (oneRes.status === 422) {
        report.diagnosis.push(
          `GET /api/apartments/${aptId} → 422: id must be a number. Use a link from the building page after login.`
        );
      } else if (oneRes.status === 404) {
        report.diagnosis.push("Apartment not in database (404). DB may have been cleared — add buildings/units again.");
      } else if (!oneRes.ok) {
        report.diagnosis.push(`GET /api/apartments/${aptId} failed (${oneRes.status}).`);
      } else {
        report.diagnosis.push("API returned this apartment — page should load if you hard-refresh (Ctrl+F5).");
      }
    } catch (e) {
      report.apiSingleApartment = { error: String(e) };
      report.diagnosis.push("Network error calling GET /api/apartments/{id}.");
    }
  }

  if (localMatch && report.apiSingleApartment && !report.apiSingleApartment.ok) {
    report.diagnosis.push(
      "Browser still has this unit in localStorage but API rejected it — clear site data OR open from building grid (numeric id)."
    );
  }

  if (Array.isArray(report.localStorageApartments) && report.localStorageApartments.length && report.apiListApartments?.ok) {
    const serverIds = new Set(
      (report.apiListApartments.body || []).map((a) => String(a.id))
    );
    const stale = report.localStorageApartments.filter(
      (a) => a.id != null && !serverIds.has(String(a.id))
    );
    if (stale.length) {
      report.staleLocalOnly = stale.map((a) => ({ id: a.id, number: a.number || a.apartment_number }));
      report.diagnosis.push(
        `${stale.length} apartment(s) exist only in localStorage, not on server — remove walajna_apartments or re-add on server.`
      );
    }
  }

  console.log("=== Walajna apartment page diagnosis ===");
  console.table(report.diagnosis.map((msg, i) => ({ step: i + 1, issue: msg })));
  console.log(report);
  return report;
};