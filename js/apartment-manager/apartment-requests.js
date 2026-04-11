/* ========================================
   Apartment Requests System
   ======================================== */

function initRequestsSystem(aptId, activeRole, currentUser, leaseStatus) {
  const T = (key, params) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(key, params)
      : key;

  function localeForDates() {
    return window.walajna_language && typeof window.walajna_language.localeForDates === "function"
      ? window.walajna_language.localeForDates()
      : window.walajna_language && window.walajna_language.get() === "en"
        ? "en-GB"
        : "ar-SA";
  }

  function formatRequestDateTime(iso) {
    if (!iso) return T("common.dash");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(localeForDates());
  }

  function requestTypeLabel(typeId) {
    const id =
      typeId && ["maintenance", "complaint", "suggestion", "request"].includes(typeId)
        ? typeId
        : "request";
    return T("messages.type." + id);
  }

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
    { id: "maintenance", descKey: "aptReq.desc.maintenance", color: "#f59e0b" },
    { id: "complaint", descKey: "aptReq.desc.complaint", color: "#facc15" },
    { id: "suggestion", descKey: "aptReq.desc.suggestion", color: "#3b82f6" },
    { id: "request", descKey: "aptReq.desc.request", color: "#22c55e" },
  ];

  let selectedRequestType = null;
  let selectedOwnerRequestId = null;

  /* =========================
     Helpers
     ========================= */
function normalizeApartmentContract(apartment) {
  if (!apartment) return apartment;

  const resolved =
    apartment.currentContractId ||
    apartment.contract?.id ||
    apartment.contractId ||
    
    null;

  if (resolved) {
    apartment.currentContractId = resolved;
    apartment.contractId = resolved;

    if (!apartment.contract) apartment.contract = {};
    apartment.contract.id = resolved;
  }

  return apartment;
}
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

  const apartment = apartments.find((a) => a.id === aptId) || null;

  return normalizeApartmentContract(apartment);
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
      T("common.tenant")
    );
  }

  function getCurrentOwnerDisplayName() {
    const apartment = getApartmentById();

    if (activeRole === "owner") {
      return (
        currentUser?.fullName ||
        currentUser?.name ||
        currentUser?.username ||
        T("common.landlord")
      );
    }

    const users =
      typeof getUsers === "function"
        ? getUsers()
        : getLocalArray("walajna_users");

    const owner = users.find((u) => u.id === apartment?.ownerId);

    return owner?.fullName || owner?.name || owner?.username || T("common.landlord");
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
            <div class="wl-item__title">${escapeHtml(requestTypeLabel(x.id))}</div>
            <div class="wl-item__desc">${escapeHtml(T(x.descKey))}</div>
          </div>
        </div>
        <span class="wl-badge">${escapeHtml(requestTypeLabel(x.id))}</span>
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
          ? T("aptReq.modal.viewSub.owner")
          : T("aptReq.modal.viewSub.tenant");
    }

    if (apartmentRequests.length === 0) {
      viewRequestsList.innerHTML = `
        <div class="wl-item">
          <div>
            <div class="wl-item__title">${escapeHtml(T("aptReq.list.emptyTitle"))}</div>
            <div class="wl-item__desc">${escapeHtml(T("aptReq.list.emptyDesc"))}</div>
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
              <div class="wl-item__title">${escapeHtml(requestTypeLabel(req.typeId) || req.typeTitle || T("messages.type.request"))}</div>
              <div class="wl-item__desc">${escapeHtml(req.message || T("common.dash"))}</div>

              <div class="wl-item__desc">
                ${escapeHtml(T("messages.sentAt"))}: ${escapeHtml(formatRequestDateTime(req.createdAt))}
              </div>

              <div class="wl-item__desc">
                ${escapeHtml(T("messages.metaFrom"))}: ${escapeHtml(req.senderName || T("common.dash"))}
              </div>

              <div class="wl-item__desc">
                ${escapeHtml(T("messages.metaTo"))}: ${escapeHtml(req.receiverName || T("common.dash"))}
              </div>

              <div class="wl-item__desc">
                ${escapeHtml(T("aptReq.label.status"))}:
                ${
                  req.status === "resolved"
                    ? escapeHtml(T("messages.statusResolved"))
                    : req.status === "replied"
                    ? escapeHtml(T("messages.statusReplied"))
                    : escapeHtml(T("messages.statusNew"))
                }
              </div>

              ${
                activeRole === "tenant" && req.status === "replied" && !req.tenantReplySeenAt
                  ? `<div class="wl-item__desc"><strong>${escapeHtml(T("messages.tenantReplyNotif"))}</strong></div>`
                  : ""
              }

              ${
                req.ownerReply
                  ? `<div class="wl-item__desc"><strong>${escapeHtml(T("messages.ownerReply"))}:</strong> ${escapeHtml(req.ownerReply)}</div>`
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
                        ${escapeHtml(T("messages.statusResolved"))}
                      </button>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>

          <span class="wl-badge">${escapeHtml(requestTypeLabel(req.typeId))}</span>
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
          alert(T("aptReq.alert.vacant"));
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
          alert(T("aptReq.alert.pickType"));
          return;
        }

        const message = (messageInput?.value || "").trim();

        if (!message) {
          alert(T("aptReq.alert.writeMessage"));
          return;
        }

        const apartment = getApartmentById();
        const building = getBuildingById(apartment?.buildingId);
        const currentContractId = getCurrentContractId();

        if (!currentContractId) {
          alert(T("aptReq.alert.noContract"));
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
          typeTitle: requestTypeLabel(chosen?.id || selectedRequestType),
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
        alert(T("aptReq.alert.sentSuccess"));
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

        alert(T("aptReq.alert.resolvedSuccess"));
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
        alert(T("aptReq.alert.pickRequestFirst"));
        return;
      }

      const reply = (ownerReplyMessage?.value || "").trim();

      if (!reply) {
        alert(T("aptReq.alert.writeReplyFirst"));
        return;
      }

      const allRequests = getRequests();

      const updated = allRequests.map((req) => {
        if (req.id === selectedOwnerRequestId) {
          return {
            ...req,
            ownerReply: reply,
            receiverRole: "tenant",
            receiverName: req.senderName || T("common.tenant"),
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

      alert(T("aptReq.alert.replySuccess"));
    });
  }
}