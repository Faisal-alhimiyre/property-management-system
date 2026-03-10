document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     0) HELPERS
     ========================= */
  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function saveLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
    } catch {
      return null;
    }
  }

  function getActiveRole() {
    return (
      localStorage.getItem("activeRole") ||
      localStorage.getItem("activerole") ||
      localStorage.getItem("role") ||
      "tenant"
    );
  }

  function getStatusLabel(leaseStatus) {
    switch (leaseStatus) {
      case "vacant":
        return "فارغة";
      case "active":
        return "نشط";
      case "ending_soon":
        return "قريب الانتهاء";
      case "ended":
        return "منتهي";
      default:
        return "—";
    }
  }

  function getStatusClass(leaseStatus) {
    switch (leaseStatus) {
      case "active":
        return "ok";
      case "ending_soon":
        return "warn";
      case "ended":
        return "danger";
      default:
        return "";
    }
  }

  function daysBetween(todayStr, endStr) {
    const today = new Date(todayStr);
    const end = new Date(endStr);
    const ms = end - today;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  function normalizeApartmentLeaseStatus(apartment) {
    if (!apartment) return apartment;

    const updated = { ...apartment };

    if (!updated.tenantNationalId || !updated.contract?.endDate) {
      updated.leaseStatus = "vacant";
      updated.status = "فارغة";
      return updated;
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const endDate = updated.contract.endDate;
    const remainingDays = daysBetween(todayStr, endDate);

    if (remainingDays < 0) {
      updated.leaseStatus = "ended";
    } else if (remainingDays <= 30) {
      updated.leaseStatus = "ending_soon";
    } else {
      updated.leaseStatus = "active";
    }

    updated.status = getStatusLabel(updated.leaseStatus);
    return updated;
  }

  function saveUpdatedApartment(updatedApartment) {
    const apartments = getLocalArray("walajna_apartments");
    const updatedApartments = apartments.map((apt) =>
      apt.id === updatedApartment.id ? updatedApartment : apt
    );
    saveLocalArray("walajna_apartments", updatedApartments);
  }
    function getUsers() {
    return getLocalArray("walajna_users");
  }

  function saveUsers(users) {
    saveLocalArray("walajna_users", users);
  }

  function showLinkTenantError(msg) {
    if (linkTenantError) {
      linkTenantError.textContent = msg;
    }
  }

  function resetLinkTenantForm() {
    showLinkTenantError("");

    if (linkNationalId) linkNationalId.value = "";
    if (linkNationality) linkNationality.value = "";
    if (linkTenantType) linkTenantType.value = "";
    if (linkPhoneNumber) linkPhoneNumber.value = "";
    if (linkRent) linkRent.value = "";
    if (linkInsurancePaid) linkInsurancePaid.value = "";
    if (linkStartDate) linkStartDate.value = "";
    if (linkEndDate) linkEndDate.value = "";
    if (linkMeterNumber) linkMeterNumber.value = "";
    if (linkNotes) linkNotes.value = "";
  }

  function openLinkTenantModal() {
    if (!linkTenantModal) return;
    resetLinkTenantForm();
    linkTenantModal.classList.add("is-open");
    linkTenantModal.setAttribute("aria-hidden", "false");
  }

  function closeLinkTenantModalFn() {
    if (!linkTenantModal) return;
    linkTenantModal.classList.remove("is-open");
    linkTenantModal.setAttribute("aria-hidden", "true");
    resetLinkTenantForm();
  }

  function updateCurrentUserRoleIfNeeded(userId) {
    if (!currentUser || currentUser.id !== userId) return;

    const users = getUsers();
    const freshUser = users.find((u) => u.id === userId);
    if (freshUser) {
      localStorage.setItem("walajna_current_user", JSON.stringify(freshUser));
    }
  }

  function linkTenantToApartment() {
  const fullName = (linkFullName?.value || "").trim();
  const nationalId = (linkNationalId?.value || "").trim();
  const nationality = (linkNationality?.value || "").trim();
  const tenantTypeValue = (linkTenantType?.value || "").trim();
  const phone = (linkPhoneNumber?.value || "").trim();
  const rentValue = (linkRent?.value || "").trim();
  const insuranceValue = (linkInsurancePaid?.value || "").trim();
  const startValue = (linkStartDate?.value || "").trim();
  const endValue = (linkEndDate?.value || "").trim();
  const meterValue = (linkMeterNumber?.value || "").trim();
  const notesValue = (linkNotes?.value || "").trim();

  showLinkTenantError("");

  if (!fullName) {
    showLinkTenantError("أدخل الاسم الكامل");
    return;
  }

  if (!nationalId) {
    showLinkTenantError("أدخل رقم الهوية / الإقامة");
    return;
  }

  if (!nationality) {
    showLinkTenantError("أدخل الجنسية");
    return;
  }

  if (!tenantTypeValue) {
    showLinkTenantError("اختر أفراد أو عوائل");
    return;
  }

  if (!phone) {
    showLinkTenantError("أدخل رقم الجوال");
    return;
  }

  if (!rentValue) {
    showLinkTenantError("أدخل الإيجار الشهري");
    return;
  }

  if (!startValue || !endValue) {
    showLinkTenantError("أدخل تاريخ بداية ونهاية العقد");
    return;
  }

  if (!/^\d{10}$/.test(nationalId)) {
    showLinkTenantError("رقم الهوية / الإقامة يجب أن يكون 10 أرقام");
    return;
  }

  if (!/^05\d{8}$/.test(phone)) {
    showLinkTenantError("رقم الجوال غير صحيح");
    return;
  }

  if (endValue < startValue) {
    showLinkTenantError("تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية");
    return;
  }

  const users = getUsers();
  const tenantUser = users.find((u) => u.nationalId === nationalId) || null;
  let tenantUserId = null;

  if (tenantUser) {
    tenantUserId = tenantUser.id;

    if (!Array.isArray(tenantUser.roles)) {
      tenantUser.roles = tenantUser.role ? [tenantUser.role] : [];
    }

    if (!tenantUser.roles.includes("tenant")) {
      tenantUser.roles.push("tenant");
    }

    const updatedUsers = users.map((u) => (u.id === tenantUser.id ? tenantUser : u));
    saveUsers(updatedUsers);
  }

  const apartments = getLocalArray("walajna_apartments");
  const updatedApartments = apartments.map((apt) => {
    if (apt.id !== aptId) return apt;

    const updatedApartment = {
      ...apt,
      rent: rentValue,
      tenantUserId: tenantUserId,
      tenantNationalId: nationalId,
      tenantInfo: {
        fullName: fullName,
        phoneNumber: phone,
        nationality: nationality,
        tenantType: tenantTypeValue
      },
      contract: {
        startDate: startValue,
        endDate: endValue,
        insurancePaid: insuranceValue,
        meterNumber: meterValue,
        notes: notesValue
      }
    };

    return normalizeApartmentLeaseStatus(updatedApartment);
  });

  saveLocalArray("walajna_apartments", updatedApartments);

  if (contractFile && contractFile.files.length > 0) {
    const file = contractFile.files[0];
    saveDocumentForApartment(file);
  }

  closeLinkTenantModalFn();
  alert("تم ربط المستأجر بالشقة بنجاح ✅");
  window.location.reload();
}

  /* =========================
     1) CLICKABLE CARDS (GLOBAL)
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

  /* =========================
     2) PAGE ELEMENTS
     ========================= */
  const title = document.getElementById("aptTitle");
  const roleLabel = document.getElementById("pageRoleLabel");
  const number = document.getElementById("aptNumber");
  const building = document.getElementById("buildingName");
  const status = document.getElementById("leaseStatus");
  const rent = document.getElementById("rentAmount");

  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const meterNumber = document.getElementById("meterNumber");
  const notes = document.getElementById("notes");

  const tenantNationality = document.getElementById("tenantNationality");
  const tenantType = document.getElementById("tenantType");
  const insurancePaid = document.getElementById("insurancePaid");
  const phoneNumber = document.getElementById("phoneNumber");
  const identityNumber = document.getElementById("identityNumber");

  const mainActionBtn = document.getElementById("mainActionBtn");
  const paymentsBtn = document.getElementById("paymentsBtn");
  const documentsBtn = document.getElementById("documentsBtn");
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");
  const linkTenantModal = document.getElementById("linkTenantModal");
  const closeLinkTenantModal = document.getElementById("closeLinkTenantModal");
  const cancelLinkTenantModal = document.getElementById("cancelLinkTenantModal");
  const linkFullName = document.getElementById("linkFullName");
  const linkNationalId = document.getElementById("linkNationalId");
  const linkNationality = document.getElementById("linkNationality");
  const linkTenantType = document.getElementById("linkTenantType");
  const linkPhoneNumber = document.getElementById("linkPhoneNumber");
  const linkRent = document.getElementById("linkRent");
  const linkInsurancePaid = document.getElementById("linkInsurancePaid");
  const linkStartDate = document.getElementById("linkStartDate");
  const linkEndDate = document.getElementById("linkEndDate");
  const linkMeterNumber = document.getElementById("linkMeterNumber");
  const linkNotes = document.getElementById("linkNotes");
  const contractFile = document.getElementById("contractFile");
  const extractContractBtn = document.getElementById("extractContractBtn");
  const saveLinkedTenantBtn = document.getElementById("saveLinkedTenantBtn");
  const linkTenantError = document.getElementById("linkTenantError"); 
  if (!title && !number && !building && !status && !rent) return;

  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");
  const activeRole = getActiveRole();
  const currentUser = getCurrentUser();

  if (!aptId) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  /* =========================
     3) LOAD REAL DATA
     ========================= */
  const apartments = getLocalArray("walajna_apartments");
  const buildings = getLocalArray("walajna_buildings");

  let data = apartments.find((apt) => apt.id === aptId);

  if (!data) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  data = normalizeApartmentLeaseStatus(data);
  saveUpdatedApartment(data);

  const buildingData = buildings.find((b) => b.id === data.buildingId) || null;
  const tenantInfo = data.tenantInfo || {};
  const contract = data.contract || {};
  const hasTenant = !!data.tenantNationalId;

  /* =========================
     4) FILL UI
     ========================= */
  if (title) title.textContent = `تفاصيل الشقة ${data.number || ""}`.trim();

  if (roleLabel) {
    roleLabel.textContent = activeRole === "owner" ? "عرض المالك" : "عرض المستأجر";
  }

  if (number) number.textContent = data.number ?? "—";
  if (building) building.textContent = data.buildingName || buildingData?.name || "—";
  if (status) status.textContent = data.status || getStatusLabel(data.leaseStatus);
  if (rent) rent.textContent = data.rent ? `${data.rent} ريال` : "—";

  if (startDate) startDate.textContent = contract.startDate ?? "—";
  if (endDate) endDate.textContent = contract.endDate ?? "—";
  if (meterNumber) meterNumber.textContent = contract.meterNumber ?? "—";
  if (notes) notes.textContent = contract.notes ?? "—";

  if (tenantNationality) tenantNationality.textContent = tenantInfo.nationality ?? "—";
  if (tenantType) tenantType.textContent = tenantInfo.tenantType ?? "—";
  if (insurancePaid) insurancePaid.textContent = contract.insurancePaid ? `${contract.insurancePaid} ريال` : "—";
  if (phoneNumber) phoneNumber.textContent = tenantInfo.phoneNumber ?? "—";
  if (identityNumber) identityNumber.textContent = data.tenantNationalId ?? "—";

  /* =========================
     5) STATUS BADGE COLORING
     ========================= */
  if (status) {
    status.classList.remove("ok", "warn", "danger");
    const cls = getStatusClass(data.leaseStatus);
    if (cls) status.classList.add(cls);
  }

  /* =========================
     6) BUTTONS BY ROLE + STATE
     ========================= */
  function hideElement(el) {
    if (el) el.style.display = "none";
  }

  function showElement(el, display = "inline-block") {
    if (el) el.style.display = display;
  }
  function getDocuments() {
  try {
    return JSON.parse(localStorage.getItem("walajna_documents") || "[]");
  } catch {
    return [];
  }
}

function saveDocuments(arr) {
  localStorage.setItem("walajna_documents", JSON.stringify(arr));
}

function saveDocumentForApartment(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const documents = getDocuments();

    documents.push({
      id: "DOC" + Date.now(),
      apartmentId: aptId,
      name: "عقد الإيجار",
      fileName: file.name,
      fileData: e.target.result,
      uploadedAt: new Date().toISOString()
    });

    saveDocuments(documents);
  };

  reader.readAsDataURL(file);
}
  
  if (activeRole === "owner") {
    if (data.leaseStatus === "vacant") {
      if (mainActionBtn) mainActionBtn.textContent = "ربط مستأجر";
      hideElement(viewRequestsBtn);
      hideElement(paymentsBtn);
    } else if (data.leaseStatus === "ended") {
      if (mainActionBtn) mainActionBtn.textContent = "إدارة العقد";
      showElement(viewRequestsBtn);
      showElement(paymentsBtn);
    } else {
      if (mainActionBtn) mainActionBtn.textContent = "التواصل مع المستأجر";
      showElement(viewRequestsBtn);
      showElement(paymentsBtn);
    }
  } else {
    if (mainActionBtn) mainActionBtn.textContent = "طلب صيانة";
    showElement(viewRequestsBtn);

    if (data.leaseStatus === "vacant") {
      hideElement(mainActionBtn);
      hideElement(viewRequestsBtn);
      hideElement(paymentsBtn);
      hideElement(documentsBtn);
    }
  }

  if (documentsBtn) {
    documentsBtn.addEventListener("click", () => {

  const documents = getDocuments();
  const apartmentDocs = documents.filter(doc => doc.apartmentId === aptId);

  if (apartmentDocs.length === 0) {
    alert("لا توجد وثائق لهذه الشقة");
    return;
  }

  const list = apartmentDocs
    .map((d, i) => `${i + 1} - ${d.fileName}`)
    .join("\n");

  const choice = prompt("اختر رقم الوثيقة لفتحها:\n\n" + list);

  const doc = apartmentDocs[Number(choice) - 1];

  if (!doc) return;

  const win = window.open();
  win.document.write(`<iframe src="${doc.fileData}" width="100%" height="100%"></iframe>`);
    });
  }

  if (paymentsBtn) {
    paymentsBtn.addEventListener("click", () => {
      window.location.href = `../tenants/tenant_payment.html?id=${encodeURIComponent(aptId)}`;
    });
  }

  /* =========================
     7) TENANT REQUEST MODAL
     ========================= */
  const modal = document.getElementById("requestModal");
  const openModalBtn = document.getElementById("mainActionBtn");
  const closeModalBtn = document.getElementById("closeRequestModal");
  const cancelBtn = document.getElementById("cancelRequestModal");
  const listEl = document.getElementById("requestTypeList");

  const messageBox = document.getElementById("requestMessageBox");
  const messageInput = document.getElementById("requestMessage");
  const charCount = document.getElementById("charCount");
  const submitBtn = document.getElementById("submitRequestBtn");

  const requestTypes = [
    { id: "complaint", title: "شكوى", desc: "بلاغ أو ملاحظة تحتاج متابعة", color: "#ef4444" },
    { id: "maintenance", title: "صيانة", desc: "مشكلة فنية داخل الشقة أو المرافق", color: "#f59e0b" },
    { id: "suggestion", title: "اقتراح", desc: "فكرة لتحسين السكن أو الخدمات", color: "#3b82f6" },
    { id: "request", title: "طلب", desc: "طلب عام (وثائق، تمديد، استفسار)", color: "#16a34a" },
  ];

  let selectedRequestType = null;

  function getRequests() {
    return getLocalArray("walajna_requests");
  }

  function saveRequests(arr) {
    saveLocalArray("walajna_requests", arr);
  }

  function renderList(items) {
    if (!listEl) return;

    listEl.innerHTML = items.map((x) => `
      <div class="wl-item" role="option" tabindex="0" data-type="${x.id}">
        <div class="wl-item__left">
          <span class="wl-dot" style="background:${x.color}"></span>
          <div>
            <div class="wl-item__title">${x.title}</div>
            <div class="wl-item__desc">${x.desc}</div>
          </div>
        </div>
        <span class="wl-badge">${x.id}</span>
      </div>
    `).join("");
  }

  function resetMessageUI() {
    selectedRequestType = null;
    if (messageBox) messageBox.style.display = "none";
    if (messageInput) messageInput.value = "";
    if (charCount) charCount.textContent = "0";
  }

  function openModal() {
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    resetMessageUI();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    resetMessageUI();
  }

  /* =========================
     8) VIEW REQUESTS MODAL
     ========================= */
  const viewRequestsModal = document.getElementById("viewRequestsModal");
  const viewRequestsList = document.getElementById("viewRequestsList");
  const closeViewRequestsModal = document.getElementById("closeViewRequestsModal");
  const cancelViewRequestsModal = document.getElementById("cancelViewRequestsModal");
  const viewRequestsSubtitle = document.getElementById("viewRequestsSubtitle");

  const ownerReplyBox = document.getElementById("ownerReplyBox");
  const ownerReplyMessage = document.getElementById("ownerReplyMessage");
  const ownerReplyCharCount = document.getElementById("ownerReplyCharCount");
  const submitOwnerReplyBtn = document.getElementById("submitOwnerReplyBtn");

  let selectedOwnerRequestId = null;

  function openViewRequestsModal() {
    if (!viewRequestsModal) return;

    renderViewRequests();
    resetOwnerReplyUI();

    viewRequestsModal.classList.add("is-open");
    viewRequestsModal.setAttribute("aria-hidden", "false");
  }

  function closeViewRequestsModalFn() {
    if (!viewRequestsModal) return;

    viewRequestsModal.classList.remove("is-open");
    viewRequestsModal.setAttribute("aria-hidden", "true");
    resetOwnerReplyUI();
  }

  function resetOwnerReplyUI() {
    selectedOwnerRequestId = null;
    if (ownerReplyBox) ownerReplyBox.style.display = "none";
    if (ownerReplyMessage) ownerReplyMessage.value = "";
    if (ownerReplyCharCount) ownerReplyCharCount.textContent = "0";
  }

  function renderViewRequests() {
    if (!viewRequestsList) return;

    const allRequests = getRequests();
    const apartmentRequests = allRequests.filter((req) => req.apartmentId === aptId);

    if (viewRequestsSubtitle) {
      viewRequestsSubtitle.textContent =
        activeRole === "owner"
          ? "عرض طلبات المستأجر والرد عليها"
          : "عرض طلباتك السابقة";
    }

    if (ownerReplyBox) {
      ownerReplyBox.style.display = "none";
    }

    if (apartmentRequests.length === 0) {
      viewRequestsList.innerHTML = `
        <div class="wl-item">
          <div>
            <div class="wl-item__title">لا توجد طلبات</div>
            <div class="wl-item__desc">لا توجد طلبات لهذه الشقة حتى الآن</div>
          </div>
        </div>
      `;
      return;
    }

    viewRequestsList.innerHTML = apartmentRequests.map((req) => `
      <div class="wl-item" tabindex="0" data-request-id="${req.id}">
        <div class="wl-item__left">
          <span class="wl-dot" style="background:${req.typeColor || "#94a3b8"}"></span>
          <div>
            <div class="wl-item__title">${req.typeTitle || "طلب"}</div>
            <div class="wl-item__desc">${req.message || "—"}</div>
            <div class="wl-item__desc">تاريخ الإرسال: ${new Date(req.createdAt).toLocaleString("ar-SA")}</div>
            <div class="wl-item__desc">الحالة: ${req.status === "replied" ? "تم الرد" : "جديد"}</div>
            ${req.ownerReply ? `<div class="wl-item__desc"><strong>رد المالك:</strong> ${req.ownerReply}</div>` : ""}
          </div>
        </div>
        <span class="wl-badge">${req.typeId || "request"}</span>
      </div>
    `).join("");
  }

  if (viewRequestsBtn) {
    viewRequestsBtn.addEventListener("click", openViewRequestsModal);
  }

  if (closeViewRequestsModal) {
    closeViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }

  if (cancelViewRequestsModal) {
    cancelViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }

  if (viewRequestsModal) {
    viewRequestsModal.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.viewClose === "true") {
        closeViewRequestsModalFn();
      }
    });
  }

  if (viewRequestsList) {
    viewRequestsList.addEventListener("click", (e) => {
      if (activeRole !== "owner") return;

      const item = e.target.closest(".wl-item");
      if (!item) return;

      selectedOwnerRequestId = item.dataset.requestId;
      if (ownerReplyBox) ownerReplyBox.style.display = "block";
      if (ownerReplyMessage) ownerReplyMessage.focus();
    });

    viewRequestsList.addEventListener("keydown", (e) => {
      if (activeRole !== "owner" || e.key !== "Enter") return;

      const item = e.target.closest(".wl-item");
      if (!item) return;

      selectedOwnerRequestId = item.dataset.requestId;
      if (ownerReplyBox) ownerReplyBox.style.display = "block";
      if (ownerReplyMessage) ownerReplyMessage.focus();
    });
  }

  if (ownerReplyMessage && ownerReplyCharCount) {
    ownerReplyMessage.addEventListener("input", () => {
      ownerReplyCharCount.textContent = String(ownerReplyMessage.value.length);
    });
  }

  if (submitOwnerReplyBtn) {
    submitOwnerReplyBtn.addEventListener("click", () => {
      if (activeRole !== "owner") return;

      if (!selectedOwnerRequestId) {
        alert("اختر طلبًا أولاً");
        return;
      }

      const reply = (ownerReplyMessage?.value || "").trim();
      if (!reply) {
        alert("اكتب الرد أولاً");
        return;
      }

      const allRequests = getRequests();

      const updatedRequests = allRequests.map((req) => {
        if (req.id === selectedOwnerRequestId) {
          return {
            ...req,
            ownerReply: reply,
            repliedAt: new Date().toISOString(),
            status: "replied"
          };
        }
        return req;
      });

      saveRequests(updatedRequests);
      renderViewRequests();
      resetOwnerReplyUI();
      alert("تم إرسال الرد بنجاح ✅");
    });
  }

  /* =========================
     9) MAIN ACTION
     ========================= */
  if (activeRole === "tenant") {
    renderList(requestTypes);

    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => {
        if (data.leaseStatus === "vacant") {
          alert("هذه الشقة غير مرتبطة بعقد حاليًا");
          return;
        }
        openModal();
      });
    }

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target && e.target.dataset && e.target.dataset.close === "true") {
          closeModal();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && modal.classList.contains("is-open")) {
        closeModal();
      }
    });

    if (listEl) {
      listEl.addEventListener("click", (e) => {
        const item = e.target.closest(".wl-item");
        if (!item) return;

        selectedRequestType = item.dataset.type;
        if (messageBox) messageBox.style.display = "block";
        if (messageInput) messageInput.focus();
      });

      listEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const item = e.target.closest(".wl-item");
        if (!item) return;

        selectedRequestType = item.dataset.type;
        if (messageBox) messageBox.style.display = "block";
        if (messageInput) messageInput.focus();
      });
    }

    if (messageInput && charCount) {
      messageInput.addEventListener("input", () => {
        charCount.textContent = String(messageInput.value.length);
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        if (!selectedRequestType) {
          alert("اختر نوع الطلب أولاً");
          return;
        }

        const message = (messageInput?.value || "").trim();
        if (!message) {
          alert("اكتب تفاصيل الطلب");
          return;
        }

        const chosen = requestTypes.find((t) => t.id === selectedRequestType);
        const all = getRequests();

        const newReq = {
          id: "R" + Date.now(),
          apartmentId: aptId,
          tenantNationalId: currentUser?.nationalId || null,
          typeId: chosen?.id || selectedRequestType,
          typeTitle: chosen?.title || "",
          typeColor: chosen?.color || "#94a3b8",
          message: message,
          createdAt: new Date().toISOString(),
          status: "new"
        };

        all.unshift(newReq);
        saveRequests(all);

        closeModal();
        alert("تم إرسال الطلب بنجاح ✅");
      });
    }
    } else {
    if (modal) modal.style.display = "none";

    if (mainActionBtn) {
      mainActionBtn.addEventListener("click", () => {
        if (data.leaseStatus === "vacant") {
          openLinkTenantModal();
          return;
        }

        if (data.leaseStatus === "ended") {
          alert("هنا سنضيف لاحقًا: تجديد العقد / إزالة المستأجر / سجل المستأجرين");
          return;
        }

        alert("سيتم فتح صفحة التواصل مع المستأجر لاحقًا");
        
      });
    }
  }
    if (closeLinkTenantModal) {
    closeLinkTenantModal.addEventListener("click", closeLinkTenantModalFn);
  }

  if (cancelLinkTenantModal) {
    cancelLinkTenantModal.addEventListener("click", closeLinkTenantModalFn);
  }

  if (linkTenantModal) {
    linkTenantModal.addEventListener("click", (e) => {
      if (e.target && e.target.dataset && e.target.dataset.linkClose === "true") {
        closeLinkTenantModalFn();
      }
    });
  }

  if (saveLinkedTenantBtn) {
    saveLinkedTenantBtn.addEventListener("click", linkTenantToApartment);
  }
  if (saveLinkedTenantBtn) {
  saveLinkedTenantBtn.addEventListener("click", linkTenantToApartment);
}

if (extractContractBtn) {
  extractContractBtn.addEventListener("click", () => {

    if (!contractFile || contractFile.files.length === 0) {
      alert("اختر ملف العقد أولاً");
      return;
    }

    const file = contractFile.files[0];

    const reader = new FileReader();

    reader.onload = function (e) {

      const text = e.target.result;

      const nationalId = text.match(/\b\d{10}\b/);
      const phone = text.match(/05\d{8}/);

      if (nationalId && linkNationalId) {
        linkNationalId.value = nationalId[0];
      }

      if (phone && linkPhoneNumber) {
        linkPhoneNumber.value = phone[0];
      }

      alert("تم استخراج بعض البيانات من العقد");
    };

    reader.readAsText(file);

  });
}
});