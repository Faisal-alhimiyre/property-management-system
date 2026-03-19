/* ========================================
   Apartment Requests System
   ======================================== */

function initRequestsSystem(aptId, activeRole, currentUser, leaseStatus) {
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

  const requestTypes = [
    { id: "maintenance", title: "صيانة", desc: "مشكلة فنية داخل الشقة أو المرافق", color: "#f59e0b" },
    { id: "complaint", title: "شكوى", desc: "بلاغ أو ملاحظة تحتاج متابعة", color: "#facc15" },
    { id: "suggestion", title: "اقتراح", desc: "فكرة لتحسين السكن أو الخدمات", color: "#3b82f6" },
    { id: "request", title: "طلب", desc: "طلب عام (وثائق، تمديد، استفسار)", color: "#22c55e" }
  ];

  let selectedRequestType = null;
  let selectedOwnerRequestId = null;

  /* =========================
     Helpers
     ========================= */

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function getApartmentById() {
    const apartments =
      typeof getApartments === "function"
        ? getApartments()
        : getLocalArray("walajna_apartments");

    return apartments.find((a) => a.id === aptId) || null;
  }

  function getBuildingById(buildingId) {
    const buildings = getLocalArray("walajna_buildings");
    return buildings.find((b) => b.id === buildingId) || null;
  }

  function getCurrentContractId() {
    const apartment = getApartmentById();

    return (
      apartment?.currentContractId ||
      apartment?.contract?.id ||
      apartment?.contractId ||
      null
    );
  }

  function getCurrentTenantDisplayName() {
    const apartment = getApartmentById();

    return (
      currentUser?.fullName ||
      currentUser?.name ||
      apartment?.tenantInfo?.fullName ||
      "المستأجر"
    );
  }

  function getCurrentOwnerDisplayName() {
    const apartment = getApartmentById();

    if (activeRole === "owner") {
      return (
        currentUser?.fullName ||
        currentUser?.name ||
        currentUser?.username ||
        "المالك"
      );
    }

    const users =
      typeof getUsers === "function"
        ? getUsers()
        : getLocalArray("walajna_users");

    const owner = users.find((u) => u.id === apartment?.ownerId);

    return owner?.fullName || owner?.name || owner?.username || "المالك";
  }

  function getRequestsForCurrentContext() {
    const allRequests = getRequests();
    const currentContractId = getCurrentContractId();

    // 🔥 مهم: لا fallback على apartmentId إذا يوجد عقد حالي
    if (currentContractId) {
      return allRequests.filter((req) => req.contractId === currentContractId);
    }

    // إذا ما فيه عقد حالي، لا نعرض طلبات قديمة
    return [];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* =========================
     Render request types
     ========================= */

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

  /* =========================
     Reset UI
     ========================= */

  function resetMessageUI() {
    selectedRequestType = null;

    if (messageBox) messageBox.style.display = "none";
    if (messageInput) messageInput.value = "";
    if (charCount) charCount.textContent = "0";
  }

  function resetOwnerReplyUI() {
    selectedOwnerRequestId = null;

    if (ownerReplyBox) ownerReplyBox.style.display = "none";
    if (ownerReplyMessage) ownerReplyMessage.value = "";
    if (ownerReplyCharCount) ownerReplyCharCount.textContent = "0";
  }

  /* =========================
     Open / Close Request Modal
     ========================= */

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
     Open / Close View Requests
     ========================= */

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

  /* =========================
     Render Requests List
     ========================= */

  function renderViewRequests() {
    if (!viewRequestsList) return;

    const apartmentRequests = getRequestsForCurrentContext();

    if (viewRequestsSubtitle) {
      viewRequestsSubtitle.textContent =
        activeRole === "owner"
          ? "عرض طلبات المستأجر الحالية والرد عليها"
          : "عرض طلباتك الخاصة بالعقد الحالي";
    }

    if (apartmentRequests.length === 0) {
      viewRequestsList.innerHTML = `
        <div class="wl-item">
          <div>
            <div class="wl-item__title">لا توجد طلبات</div>
            <div class="wl-item__desc">لا توجد طلبات مرتبطة بالعقد الحالي حتى الآن</div>
          </div>
        </div>
      `;
      return;
    }

    viewRequestsList.innerHTML = apartmentRequests
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map((req) => `
        <div class="wl-item" tabindex="0" data-request-id="${req.id}">
          <div class="wl-item__left">
            <span class="wl-dot" style="background:${req.typeColor || "#94a3b8"}"></span>

            <div>
              <div class="wl-item__title">${req.typeTitle || "طلب"}</div>
              <div class="wl-item__desc">${escapeHtml(req.message || "—")}</div>

              <div class="wl-item__desc">
                تاريخ الإرسال: ${new Date(req.createdAt).toLocaleString("ar-SA")}
              </div>

              <div class="wl-item__desc">
                من: ${escapeHtml(req.senderName || "—")}
              </div>

              <div class="wl-item__desc">
                إلى: ${escapeHtml(req.receiverName || "—")}
              </div>

              <div class="wl-item__desc">
                الحالة:
                ${
                  req.status === "resolved"
                    ? "تمت المعالجة"
                    : req.status === "replied"
                    ? "تم الرد"
                    : "جديد"
                }
              </div>

              ${
                activeRole === "tenant" && req.status === "replied" && !req.tenantReplySeenAt
                  ? `<div class="wl-item__desc"><strong>🔔 تم الرد على طلبك</strong></div>`
                  : ""
              }

              ${
                req.ownerReply
                  ? `<div class="wl-item__desc"><strong>رد المالك:</strong> ${escapeHtml(req.ownerReply)}</div>`
                  : ""
              }

              ${
                activeRole === "owner" && req.status !== "resolved"
                  ? `
                    <div style="margin-top:10px;">
                      <button
                        type="button"
                        class="resolve-request-btn"
                        data-resolve-id="${req.id}"
                      >
                        تمت المعالجة
                      </button>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>

          <span class="wl-badge">${req.typeId || "request"}</span>
        </div>
      `)
      .join("");

    if (activeRole === "tenant") {
      markTenantRepliesAsSeen(apartmentRequests);
    }
  }

  function markTenantRepliesAsSeen(currentRequests) {
    const targetIds = currentRequests
      .filter((req) => req.status === "replied" && !req.tenantReplySeenAt)
      .map((req) => req.id);

    if (!targetIds.length) return;

    const allRequests = getRequests();

    const updatedRequests = allRequests.map((req) => {
      if (!targetIds.includes(req.id)) return req;

      return {
        ...req,
        tenantReplySeenAt: new Date().toISOString(),
      };
    });

    saveRequests(updatedRequests);
  }

  /* =========================
     Tenant Request Logic
     ========================= */

  if (activeRole === "tenant") {
    renderList(requestTypes);

    if (openModalBtn) {
      openModalBtn.addEventListener("click", () => {
        if (leaseStatus === "vacant") {
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
        if (e.target.dataset.close === "true") {
          closeModal();
        }
      });
    }

    if (listEl) {
      listEl.addEventListener("click", (e) => {
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

        const apartment = getApartmentById();
        const building = getBuildingById(apartment?.buildingId);
        const currentContractId = getCurrentContractId();

        if (!currentContractId) {
          alert("تعذر تحديد العقد الحالي لهذه الشقة");
          return;
        }

        const chosen = requestTypes.find((t) => t.id === selectedRequestType);
        const all = getRequests();

        const newReq = {
          id: "R" + Date.now(),

          apartmentId: aptId,
          contractId: currentContractId,

          apartmentNumber: apartment?.number || apartment?.apartmentNumber || "-",

          buildingId: apartment?.buildingId || null,
          buildingName: building?.name || apartment?.buildingName || "-",
          buildingNumber: building?.number || "-",

          tenantUserId: currentUser?.id || apartment?.tenantUserId || null,
          tenantNationalId: currentUser?.nationalId || apartment?.tenantNationalId || null,

          senderRole: "tenant",
          senderName: getCurrentTenantDisplayName(),
          receiverRole: "owner",
          receiverName: getCurrentOwnerDisplayName(),

          typeId: chosen?.id || selectedRequestType,
          typeTitle: chosen?.title || "",
          typeColor: chosen?.color || "#94a3b8",

          message: message,
          createdAt: new Date().toISOString(),

          status: "new",
          ownerSeen: false,
          ownerSeenAt: null,

          ownerReply: "",
          repliedAt: null,
          tenantReplySeenAt: null,
          resolvedAt: null,
        };

        all.unshift(newReq);
        saveRequests(all);

        closeModal();
        alert("تم إرسال الطلب بنجاح ✅");
      });
    }
  }

  /* =========================
     View Requests
     ========================= */

  if (viewRequestsBtn) {
    viewRequestsBtn.addEventListener("click", openViewRequestsModal);
  }

  if (closeViewRequestsModal) {
    closeViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }

  if (cancelViewRequestsModal) {
    cancelViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }

  if (viewRequestsList) {
    viewRequestsList.addEventListener("click", (e) => {
      if (activeRole !== "owner") return;

      const resolveBtn = e.target.closest(".resolve-request-btn");

      if (resolveBtn) {
        const requestId = resolveBtn.dataset.resolveId;
        const allRequests = getRequests();

        const updatedRequests = allRequests.map((req) => {
          if (req.id === requestId) {
            return {
              ...req,
              status: "resolved",
              resolvedAt: new Date().toISOString(),
            };
          }
          return req;
        });

        saveRequests(updatedRequests);
        renderViewRequests();
        resetOwnerReplyUI();

        alert("تمت معالجة الطلب ✅");
        return;
      }

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

      const updated = allRequests.map((req) => {
        if (req.id === selectedOwnerRequestId) {
          return {
            ...req,
            ownerReply: reply,
            receiverRole: "tenant",
            receiverName: req.senderName || "المستأجر",
            repliedAt: new Date().toISOString(),
            status: "replied",
            tenantReplySeenAt: null,
          };
        }

        return req;
      });

      saveRequests(updated);

      renderViewRequests();
      resetOwnerReplyUI();

      alert("تم إرسال الرد بنجاح ✅");
    });
  }
}