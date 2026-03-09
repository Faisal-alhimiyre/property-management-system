document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     1) CLICKABLE CARDS (GLOBAL)
     ========================= */
  document.querySelectorAll(".clickable-card").forEach(card => {
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
     2) APARTMENT DETAILS PAGE
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
  
   
  if (!title && !number && !building && !status && !rent) return;

  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");

  const activeRole = localStorage.getItem("activeRole") || "tenant";

  if (!aptId) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  /* =========================
     Demo data
     Replace later with localStorage
     ========================= */
  const apartments = {
    A101: {
      number: "A101",
      building: "عمارة السلامة 1",
      status: "نشط",
      rent: "1500 ريال",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      meterNumber: "M-77881",
      notes: "—",
      nationality: "سعودي",
      tenantType: "عوائل",
      insurancePaid: "2000 ريال",
      phoneNumber: "0551234567",
      identityNumber: "1023456789"
    },
    A102: {
      number: "A102",
      building: "عمارة السلامة 1",
      status: "قريب الانتهاء",
      rent: "1600 ريال",
      startDate: "2025-06-01",
      endDate: "2026-06-01",
      meterNumber: "M-77882",
      notes: "يرجى متابعة فاتورة الكهرباء",
      nationality: "مقيم",
      tenantType: "أفراد",
      insurancePaid: "1500 ريال",
      phoneNumber: "0569876543",
      identityNumber: "2456789012"
    }
  };

  const data = apartments[aptId];

  if (!data) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  /* =========================
     Fill UI
     ========================= */
  if (title) title.textContent = `تفاصيل ${data.number}`;
  if (roleLabel) {
    roleLabel.textContent = activeRole === "owner" ? "عرض المالك" : "عرض المستأجر";
  }

  if (number) number.textContent = data.number ?? "—";
  if (building) building.textContent = data.building ?? "—";
  if (status) status.textContent = data.status ?? "—";
  if (rent) rent.textContent = data.rent ?? "—";

  if (startDate) startDate.textContent = data.startDate ?? "—";
  if (endDate) endDate.textContent = data.endDate ?? "—";
  if (meterNumber) meterNumber.textContent = data.meterNumber ?? "—";
  if (notes) notes.textContent = data.notes ?? "—";

  if (tenantNationality) tenantNationality.textContent = data.nationality ?? "—";
  if (tenantType) tenantType.textContent = data.tenantType ?? "—";
  if (insurancePaid) insurancePaid.textContent = data.insurancePaid ?? "—";
  if (phoneNumber) phoneNumber.textContent = data.phoneNumber ?? "—";
  if (identityNumber) identityNumber.textContent = data.identityNumber ?? "—";

  /* =========================
     Status badge coloring
     ========================= */
  if (status) {
    status.classList.remove("ok", "warn", "danger");
    const s = (data.status || "").trim();

    if (s === "نشط") status.classList.add("ok");
    else if (s === "قريب الانتهاء") status.classList.add("warn");
    else if (s === "منتهي") status.classList.add("danger");
  }

  /* =========================
     2.5) ACTION BUTTONS
     ========================= */
  const mainActionBtn = document.getElementById("mainActionBtn");
  const paymentsBtn = document.getElementById("paymentsBtn");
  const documentsBtn = document.getElementById("documentsBtn");

  if (mainActionBtn) {
    if (activeRole === "owner") {
      mainActionBtn.textContent = "التواصل مع المستأجر";
    } else {
      mainActionBtn.textContent = "طلب صيانة";
    }
  }

  if (paymentsBtn) {
    paymentsBtn.addEventListener("click", () => {
      window.location.href = `../tenants/tenant_payment.html?id=${encodeURIComponent(aptId)}`;
    });
  }

  if (documentsBtn) {
    documentsBtn.addEventListener("click", () => {
      alert("صفحة الوثائق لاحقًا");
    });
  }

  /* =========================
     3) TENANT REQUEST MODAL
     Only for tenant
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
  const viewRequestsBtn = document.getElementById("viewRequestsBtn");

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

  const requestTypes = [
    { id: "complaint",   title: "شكوى",   desc: "بلاغ أو ملاحظة تحتاج متابعة", color: "#ef4444" },
    { id: "maintenance", title: "صيانة",  desc: "مشكلة فنية داخل الشقة أو المرافق", color: "#f59e0b" },
    { id: "suggestion",  title: "اقتراح", desc: "فكرة لتحسين السكن أو الخدمات", color: "#3b82f6" },
    { id: "request",     title: "طلب",    desc: "طلب عام (وثائق، تمديد، استفسار)", color: "#16a34a" },
  ];

  let selectedRequestType = null;

  function getRequests() {
    try {
      return JSON.parse(localStorage.getItem("walajna_requests") || "[]");
    } catch {
      return [];
    }
  }

  function saveRequests(arr) {
    localStorage.setItem("walajna_requests", JSON.stringify(arr));
  }
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
  const apartmentRequests = allRequests.filter(req => req.apartmentId === aptId);

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

  viewRequestsList.innerHTML = apartmentRequests.map(req => `
    <div class="wl-item" tabindex="0" data-request-id="${req.id}">
      <div class="wl-item__left">
        <span class="wl-dot" style="background:${req.typeColor || "#94a3b8"}"></span>
        <div>
          <div class="wl-item__title">${req.typeTitle || "طلب"}</div>
          <div class="wl-item__desc">${req.message || "—"}</div>
          <div class="wl-item__desc">تاريخ الإرسال: ${new Date(req.createdAt).toLocaleString("ar-SA")}</div>
          <div class="wl-item__desc">الحالة: ${req.status === "replied" ? "تم الرد" : "جديد"}</div>
          ${
            req.ownerReply
              ? `<div class="wl-item__desc"><strong>رد المالك:</strong> ${req.ownerReply}</div>`
              : ""
          }
        </div>
      </div>
      <span class="wl-badge">${req.typeId || "request"}</span>
    </div>
  `).join("");
}
  function renderList(items) {
    if (!listEl) return;

    listEl.innerHTML = items.map(x => `
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

    const updatedRequests = allRequests.map(req => {
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

  if (activeRole === "tenant") {
    renderList(requestTypes);

    if (openModalBtn) {
      openModalBtn.addEventListener("click", openModal);
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
          
        const chosen = requestTypes.find(t => t.id === selectedRequestType);
        const all = getRequests();

        const newReq = {
          id: "R" + Date.now(),
          apartmentId: aptId,
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
        alert("سيتم فتح صفحة التواصل مع المستأجر لاحقًا");
      });
    }
  }
});