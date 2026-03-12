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
  const dueDateInfo = document.getElementById("dueDateInfo");

  const mainActionBtn = document.getElementById("mainActionBtn");
  const paymentsBtn = document.getElementById("paymentsBtn");
  const documentsBtn = document.getElementById("documentsBtn");
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");
  const renewContractBtn = document.getElementById("renewContractBtn");
  const evictTenantBtn = document.getElementById("evictTenantBtn");
  const tenantPayBtn = document.getElementById("tenantPayBtn");

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

  function formatDueDateForDisplay(dateString) {
    if (!dateString) return "—";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString("ar-SA");
  }

  function updateNextPaymentInfo(apartmentId){

  const dateEl = document.getElementById("nextPaymentDate");
  const amountEl = document.getElementById("nextPaymentAmount");

  if(!dateEl || !amountEl) return;

  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");

  const nextPayment = payments
    .filter(p => p.apartmentId === apartmentId && p.status !== "paid")
    .sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate))[0];

  if(!nextPayment){
    dateEl.textContent = "";
    amountEl.textContent = "لا يوجد دفعات";
    return;
  }

  const dueDate = new Date(nextPayment.dueDate);
  const today = new Date();

  const diffDays = Math.ceil((dueDate - today)/(1000*60*60*24));

  const formattedDate = dueDate.toLocaleDateString("en-GB");

  dateEl.textContent = "— " + formattedDate;
  amountEl.textContent = nextPayment.amount + " ريال";

  dateEl.classList.remove(
    "next-payment-normal",
    "next-payment-warning",
    "next-payment-overdue"
  );

  if(diffDays < 0){
    dateEl.classList.add("next-payment-overdue");
  }
  else if(diffDays <= 5){
    dateEl.classList.add("next-payment-warning");
  }
  else{
    dateEl.classList.add("next-payment-normal");
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

    window.location.href = `../main/payment-options.html?id=${encodeURIComponent(aptId)}&paymentId=${encodeURIComponent(nextPayment.id)}`;
  }

  /* =========================
     5) FILL UI
     ========================= */
  fillApartmentInfoUI(data, buildingData);
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

      if (tenantPayBtn) hideElement(tenantPayBtn);
    } else {
      hideElement(mainActionBtn);
      showElement(renewContractBtn);
      showElement(evictTenantBtn);
      showElement(viewRequestsBtn);
      showElement(paymentsBtn);
      showElement(documentsBtn);

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

      if (tenantPayBtn) hideElement(tenantPayBtn);
    }
  }

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
     10) RENEW CONTRACT
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
     11) EVICT TENANT
     ========================= */
  if (evictTenantBtn) {
    evictTenantBtn.addEventListener("click", () => {
      if (!confirm("هل أنت متأكد من إخلاء المستأجر؟")) return;

      const updatedApartments = getApartments().map((apt) => {
        if (apt.id !== aptId) return apt;

        return {
          ...apt,
          tenantUserId: null,
          tenantNationalId: null,
          tenantInfo: {},
          contract: {},
          leaseStatus: "vacant",
          status: "فارغة"
        };
      });

      saveApartments(updatedApartments);
      deleteApartmentDocuments(aptId);

      alert("تم إخلاء المستأجر وحذف الوثائق بنجاح");
      window.location.reload();
    });
  }

  /* =========================
     12) CLICKABLE CARDS (GLOBAL)
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