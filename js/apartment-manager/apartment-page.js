document.addEventListener("DOMContentLoaded", () => {
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
  const roomsCountEl = document.getElementById("roomsCount");
  const bathroomsCountEl = document.getElementById("bathroomsCount");
  const livingRoomsCountEl = document.getElementById("livingRoomsCount");

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
    if (title) title.textContent = "لم يتم العثور على الشقة";
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
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  data = normalizeApartmentLeaseStatus(data);
  saveUpdatedApartment(data);

  const buildingData = buildings.find((b) => b.id === data.buildingId) || null;
  const contract = data.contract || {};

  let remainingDays = null;
  if (contract.endDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    remainingDays = daysBetween(todayStr, contract.endDate);
  }

  /* =========================
     4) HELPERS
     ========================= */
  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("en-US")} ريال`;
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-GB");
  }

  function getPaymentCycleLabel(cycle) {
    const labels = {
      monthly: "شهري",
      quarterly: "ربع سنوي",
      semi_annual: "نصف سنوي",
      annual: "سنوي",
    };

    return labels[cycle] || "شهري";
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

    rent.textContent =
      `${formatMoney(annualRent)} سنويًا • ${formatMoney(installmentAmount)} لكل دفعة (${cycleLabel})`;
  }

  function getPaymentsForApartment(apartmentId) {
    try {
      const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");
      return Array.isArray(payments)
        ? payments.filter((payment) => payment.apartmentId === apartmentId)
        : [];
    } catch (error) {
      console.error("خطأ أثناء قراءة المدفوعات:", error);
      return [];
    }
  }

  function getNextDuePayment(apartmentId) {
    const payments = getPaymentsForApartment(apartmentId);

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
        status: normalizedStatus
      };
    });

    const unpaidPayments = normalizedPayments
      .filter((payment) => payment.status !== "paid" && payment.status !== "cancelled")
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    return unpaidPayments[0] || null;
  }

  function updateNextPaymentInfo(apartmentId) {
    const dateEl = document.getElementById("nextPaymentDate");
    const amountEl = document.getElementById("nextPaymentAmount");

    if (!dateEl || !amountEl) return;

    const nextPayment = getNextDuePayment(apartmentId);

    if (!nextPayment) {
      dateEl.textContent = "";
      amountEl.textContent = "لا يوجد دفعات";
      return;
    }

    const dueDate = new Date(nextPayment.dueDate);
    const today = new Date();

    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    const formattedDate = dueDate.toLocaleDateString("en-GB");

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

    title.textContent = `شقة ${aptNumber} ${buildingName}`;
  }

  function fillExtraApartmentInfo() {
    if (floorNumberEl) {
      floorNumberEl.textContent =
        data.floorNumber ?? data.contract?.floorNumber ?? "—";
    }

    if (roomsCountEl) {
      roomsCountEl.textContent =
        data.roomsCount ?? data.contract?.roomsCount ?? "—";
    }

    if (bathroomsCountEl) {
      bathroomsCountEl.textContent =
        data.bathroomsCount ?? data.contract?.bathroomsCount ?? "—";
    }

    if (livingRoomsCountEl) {
      livingRoomsCountEl.textContent =
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
      alert("لا توجد دفعات مستحقة حاليًا");
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
    historyBtn.textContent = "سجل الشقة";

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
      archiveReason: "vacated"
    };
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

  if (roleLabel) {
    roleLabel.textContent = activeRole === "owner" ? "عرض المالك" : "عرض المستأجر";
  }

  /* =========================
     6) INIT FEATURES
     ========================= */
  initDocumentsSystem(aptId);
  initRequestsSystem(aptId, activeRole, currentUser, data.leaseStatus);
  const linkTenantSystem = initLinkTenantSystem(aptId, currentUser);

  /* =========================
     OPEN EDIT / LINK MODAL
     ========================= */
  if (mainActionBtn) {
    mainActionBtn.addEventListener("click", () => {
      if (activeRole !== "owner") return;

      if (data.leaseStatus === "vacant") {
        linkTenantSystem.openLinkTenantModal();
      } else {
        linkTenantSystem.openEditTenantModal();
      }
    });
  }

  /* =========================
     7) BUTTONS BY ROLE + STATE
     ========================= */
  if (activeRole === "owner") {
    if (data.leaseStatus === "vacant") {
      if (mainActionBtn) mainActionBtn.textContent = "ربط مستأجر";

      showElement(mainActionBtn);
      hideElement(renewContractBtn);
      hideElement(evictTenantBtn);
      hideElement(viewRequestsBtn);
      hideElement(paymentsBtn);
      hideElement(documentsBtn);
      hideElement(viewCostsBtn);

      if (tenantPayBtn) hideElement(tenantPayBtn);
    } else {
      if (mainActionBtn) {
        mainActionBtn.textContent = "تعديل بيانات الشقة";
      }

      showElement(mainActionBtn);
      showElement(renewContractBtn);
      showElement(evictTenantBtn);
      showElement(viewRequestsBtn);
      showElement(paymentsBtn);
      showElement(documentsBtn);
      showElement(viewCostsBtn);

      if (tenantPayBtn) hideElement(tenantPayBtn);

      if (renewContractBtn) {
        renewContractBtn.disabled = !(
          remainingDays !== null &&
          remainingDays <= 30 &&
          remainingDays >= 0
        );
      }
    }
  } else {
    if (mainActionBtn) mainActionBtn.textContent = "طلب صيانة";

    showElement(mainActionBtn);
    hideElement(renewContractBtn);
    hideElement(evictTenantBtn);
    showElement(viewRequestsBtn);
    showElement(paymentsBtn);
    showElement(documentsBtn);
    hideElement(viewCostsBtn);

    if (tenantPayBtn) {
      showElement(tenantPayBtn);
      tenantPayBtn.style.background = "#111827";
      tenantPayBtn.style.color = "#fff";
      tenantPayBtn.style.border = "none";
    }

    if (data.leaseStatus === "vacant") {
      hideElement(mainActionBtn);
      hideElement(viewRequestsBtn);
      hideElement(paymentsBtn);
      hideElement(documentsBtn);
      hideElement(viewCostsBtn);

      if (tenantPayBtn) hideElement(tenantPayBtn);
    }
  }

  ensureHistoryButton();

  /* =========================
     8) PAYMENTS
     ========================= */
  if (paymentsBtn) {
    paymentsBtn.addEventListener("click", goToPaymentsPage);
  }

  if (tenantPayBtn) {
    tenantPayBtn.addEventListener("click", goToPaymentOptionsPage);
  }

  /* =========================
     9) OWNER MAIN ACTION
     ========================= */
  if (activeRole === "owner" && mainActionBtn) {
    mainActionBtn.addEventListener("click", () => {
      if (data.leaseStatus === "vacant") {
        linkTenantSystem.openLinkTenantModal();
      }
    });
  }

  /* =========================
     10) COSTS
     ========================= */
  if (viewCostsBtn) {
    viewCostsBtn.addEventListener("click", () => {
      if (!aptId) {
        alert("تعذر تحديد الشقة");
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
        alert("يمكن تجديد العقد قبل شهر من نهايته فقط");
        return;
      }

      alert("سيتم إضافة نظام تجديد العقد لاحقًا");
    });
  }

  /* =========================
     12) EVICT TENANT
     ========================= */
  if (evictTenantBtn) {
    evictTenantBtn.addEventListener("click", () => {
      if (!confirm("هل أنت متأكد من إخلاء المستأجر؟ سيتم حفظه في سجل الشقة.")) return;

      const updatedApartments = getApartments().map((apt) => {
        if (apt.id !== aptId) return apt;

        const hasTenantData =
          !!apt.tenantUserId ||
          !!apt.tenantNationalId ||
          !!apt.tenantInfo?.fullName ||
          !!apt.contract?.startDate ||
          !!apt.contract?.endDate;

        const tenantHistory = Array.isArray(apt.tenantHistory)
          ? [...apt.tenantHistory]
          : [];

        if (hasTenantData) {
          tenantHistory.push(buildTenantHistoryEntry(apt));
        }

        return {
          ...apt,
          tenantHistory,
          tenantUserId: null,
          tenantNationalId: null,
          tenantInfo: {},
          contract: {},
          leaseStatus: "vacant",
          status: "فارغة"
        };
      });

      saveApartments(updatedApartments);

      alert("تم إخلاء المستأجر وحفظه في سجل الشقة");
      window.location.reload();
    });
  }

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