document.addEventListener("DOMContentLoaded", () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

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
    return;
  }

  /* =========================
     3) LOAD DATA
     ========================= */
  const apartments = getApartments();
  const buildings = getBuildings();
  const users = typeof getUsers === "function" ? getUsers() : [];

  let data = apartments.find((apt) => apt.id === aptId);

  if (!data) {
    if (title) title.textContent = T("aptPage.notFound");
    return;
  }

  const buildingData = buildings.find((b) => b.id === data.buildingId) || null;

  /* =========================
     4) HELPERS
     ========================= */
  function formatMoney(value) {
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-SA"
        : "ar-SA";
    return `${Number(value || 0).toLocaleString(loc)} ${T("common.sar")}`;
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-GB"
        : "ar-SA";
    return date.toLocaleDateString(loc);
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

    return monthsMap[cycle] || 1;
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
    return hasTenantData(apartmentData) || hasContractData(apartmentData);
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
    return Number(contractData?.rentAmount || data?.rent || 0);
  }

  function getContractMonths(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end < start) return 0;

    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1
    );
  }

  function getInstallmentAmount(contractData) {
    const monthlyRent = getMonthlyRent(contractData);
    const paymentCycle = contractData?.paymentCycle || "monthly";
    const installmentsCount = Number(contractData?.installmentsCount || 0);

    const contractMonths = getContractMonths(
      contractData?.startDate,
      contractData?.endDate
    );

    if (installmentsCount > 0 && contractMonths > 0) {
      const totalContractRent = monthlyRent * contractMonths;
      return totalContractRent / installmentsCount;
    }

    const monthsCount = getCycleMonthsCount(paymentCycle);
    return monthlyRent * monthsCount;
  }

  function updateRentDisplay(contractData) {
    if (!rent) return;

    const monthlyRent = getMonthlyRent(contractData);
    const paymentCycle = contractData?.paymentCycle || "monthly";
    const installmentAmount = getInstallmentAmount(contractData);
    const cycleLabel = getPaymentCycleLabel(paymentCycle);

    if (!monthlyRent) {
      rent.textContent = "—";
      return;
    }

    const annualRent = monthlyRent * 12;

    rent.textContent = T("aptPage.annualSummary", {
      a: formatMoney(annualRent),
      i: formatMoney(installmentAmount),
      c: cycleLabel,
    });
  }

 function getPaymentsForApartment() {
  try {
    const contractId = getCurrentContractId();
    if (!contractId) return [];

    const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");

    return Array.isArray(payments)
      ? payments.filter((payment) => payment.contractId === contractId)
      : [];
  } catch (error) {
    console.error(T("aptPage.payError"), error);
    return [];
  }
}

  function getNextDuePayment(apartmentId) {
    const payments = getPaymentsForApartment();

    if (!payments.length) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalizedPayments = payments.map((payment) => {
      const dueDate = new Date(payment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      let normalizedStatus = payment.status;

      if (payment.status === "pending" && dueDate < today) {
        normalizedStatus = "overdue";
      }

      return {
        ...payment,
        status: normalizedStatus,
      };
    });

    const unpaidPayments = normalizedPayments
      .filter((payment) => payment.status !== "paid" && payment.status !== "cancelled")
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    return unpaidPayments[0] || null;
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
  function updateNextPaymentInfo(apartmentId) {
    const dateEl = document.getElementById("nextPaymentDate");
    const amountEl = document.getElementById("nextPaymentAmount");

    if (!dateEl || !amountEl) return;

    if (effectiveLeaseStatus === "vacant") {
      dateEl.textContent = "";
      amountEl.textContent = T("aptPage.noPayments");
      return;
    }

    const nextPayment = getNextDuePayment(apartmentId);

    if (!nextPayment) {
      dateEl.textContent = "";
      amountEl.textContent = T("aptPage.noPayments");
      return;
    }

    const dueDate = new Date(nextPayment.dueDate);
    const today = new Date();

    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const loc =
      window.walajna_language && window.walajna_language.get() === "en"
        ? "en-GB"
        : "ar-SA";
    const formattedDate = dueDate.toLocaleDateString(loc);

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
        data.livingRoomsCount ?? data.contract?.livingRoomsCount ?? "—";
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
      insurancePaidEl.textContent = contract.insurancePaid || "—";
    }

    if (phoneNumberEl) {
      phoneNumberEl.textContent = tenantInfo.phoneNumber || "—";
    }

    if (identityNumberEl) {
      identityNumberEl.textContent = data.tenantNationalId || "—";
    }
  }

  function fillAdditionalInfo() {
    if (startDateEl) startDateEl.textContent = formatDate(contract.startDate);
    if (endDateEl) endDateEl.textContent = formatDate(contract.endDate);
    if (meterNumberEl) meterNumberEl.textContent = contract.meterNumber || "—";
    if (notesEl) notesEl.textContent = contract.notes || "—";
  }

  function fillOwnerInfoForTenantOnly() {
    if (!ownerInfoSection) return;

    if (activeRole !== "tenant") {
      ownerInfoSection.style.display = "none";
      return;
    }

    const owner = users.find((u) => u.id === data.ownerId);

    if (!owner) {
      ownerInfoSection.style.display = "none";
      return;
    }

    ownerInfoSection.style.display = "block";

    if (ownerFullNameEl) {
      ownerFullNameEl.textContent = owner.fullName || "—";
    }

    if (ownerNationalIdEl) {
      ownerNationalIdEl.textContent = owner.nationalId || "—";
    }
  }

  function goToPaymentsPage() {
    window.location.href = `../main/payments.html?id=${encodeURIComponent(aptId)}`;
  }

  function goToPaymentOptionsPage() {
    const nextPayment = getNextDuePayment(aptId);

    if (!nextPayment) {
      alert(T("aptPage.noDuePayments"));
      return;
    }

    window.location.href =
      `../main/payment-options.html?id=${encodeURIComponent(aptId)}` +
      `&paymentId=${encodeURIComponent(nextPayment.id)}`;
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
          showElement(mainActionBtn);
        }
        return;
      }

      if (mainActionBtn) {
        mainActionBtn.textContent = T("aptPage.editApt");
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
      return;
    }

    if (effectiveLeaseStatus === "vacant") {
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
  }

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
  updateNextPaymentInfo(aptId);

  if (status) {
    status.textContent = getLeaseStatusLabel(data.leaseStatus || effectiveLeaseStatus);
  }

  if (roleLabel) {
    roleLabel.textContent =
      activeRole === "owner" ? T("aptPage.viewOwner") : T("aptPage.viewTenant");
  }

  /* =========================
     6) INIT FEATURES
     ========================= */
  initDocumentsSystem(aptId);
  initRequestsSystem(aptId, activeRole, currentUser, effectiveLeaseStatus);
  const linkTenantSystem = initLinkTenantSystem(aptId, currentUser);

  /* =========================
     7) BUTTONS BY ROLE + STATE
     ========================= */
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
    tenantPayBtn.addEventListener("click", goToPaymentOptionsPage);
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
  evictTenantBtn.addEventListener("click", () => {
    const evictionCheck = canEvictApartment(data);
    if (!evictionCheck.allowed) {
      alert(evictionCheck.message);
      return;
    }

    const allRequests = JSON.parse(localStorage.getItem("walajna_requests") || "[]");

    const currentContractId =
      data.currentContractId ||
      data.contract?.id ||
      data.contractId ||
      null;

    const openRequests = currentContractId
      ? allRequests.filter((req) => {
          return req.contractId === currentContractId && req.status !== "resolved";
        })
      : [];

    if (openRequests.length > 0) {
      alert(T("aptPage.evacBlockedRequests"));
      return;
    }

    if (!confirm(T("aptPage.confirmEvict"))) return;

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
        status:
          typeof getStatusLabel === "function"
            ? getStatusLabel("vacant")
            : T("lease.status.vacant"),
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