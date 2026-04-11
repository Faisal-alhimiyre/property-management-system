/* ========================================
   Apartment Requests — server-only (maintenance_requests)
   ======================================== */

function initRequestsSystem(aptId, activeRole, currentUser, leaseStatus, pageApartment) {
  const serverApartmentOverlay =
    pageApartment && typeof pageApartment === "object" ? pageApartment : null;

  const W = () =>
    typeof WalajnaTenantRequests !== "undefined" ? WalajnaTenantRequests : null;

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
    { id: "request", title: "طلب", desc: "طلب عام (وثائق، تمديد، استفسار)", color: "#22c55e" },
  ];

  let selectedRequestType = null;
  let selectedOwnerRequestId = null;
  /** @type {Array<object>} UI-shaped rows from WalajnaTenantRequests.mapRowToUi */
  let cachedRequests = [];

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

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

  function getApartmentById() {
    const apartments =
      typeof getApartments === "function" ? getApartments() : getLocalArray("walajna_apartments");
    const apartment = apartments.find((a) => a.id === aptId) || null;
    const base = normalizeApartmentContract(apartment);
    if (serverApartmentOverlay) {
      return normalizeApartmentContract({ ...(base || {}), ...serverApartmentOverlay });
    }
    return base;
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
      return currentUser?.fullName || currentUser?.name || currentUser?.username || "المالك";
    }
    const users = typeof getUsers === "function" ? getUsers() : getLocalArray("walajna_users");
    const owner = users.find((u) => u.id === apartment?.ownerId);
    return owner?.fullName || owner?.name || owner?.username || "المالك";
  }

  function serverApartmentNumericId() {
    const apartment = getApartmentById();
    const raw =
      apartment?.apiId ??
      apartment?.id ??
      serverApartmentOverlay?.apiId ??
      serverApartmentOverlay?.id;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && Number.isInteger(n) ? n : null;
  }

  async function refreshRequests() {
    const api = W();
    if (!api || typeof WalajnaAuth === "undefined" || !WalajnaAuth.fetchWithAuth) {
      cachedRequests = [];
      return;
    }
    const aid = serverApartmentNumericId();
    if (aid == null) {
      cachedRequests = [];
      return;
    }
    try {
      const rows = await api.list(aid);
      const ctx = {
        senderName: getCurrentTenantDisplayName(),
        receiverName: getCurrentOwnerDisplayName(),
      };
      cachedRequests = (rows || []).map((r) => api.mapRowToUi(r, ctx));
    } catch (e) {
      console.warn("[requests] refresh failed", e);
      cachedRequests = [];
    }
  }

  function getRequestsForCurrentContext() {
    // `cachedRequests` is already scoped to this apartment (GET /api/maintenance?apartment_id=…).
    const currentContractId = getCurrentContractId();
    if (!currentContractId) {
      // No lease id on the client (stale cache / API gap): still show this apartment's rows.
      return cachedRequests.slice();
    }
    return cachedRequests.filter((req) => {
      // Match current lease, or legacy rows saved without contract_id (minimal insert / older clients).
      if (req.contractId == null || req.contractId === "") {
        return true;
      }
      return String(req.contractId) === String(currentContractId);
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderList(items) {
    if (!listEl) return;
    listEl.innerHTML = items
      .map(
        (x) => `
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
    `
      )
      .join("");
  }

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

  async function openViewRequestsModal() {
    if (!viewRequestsModal) return;
    await refreshRequests();
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
      .map(
        (req) => `
        <div class="wl-item" tabindex="0" data-request-id="${escapeHtml(req.id)}">
          <div class="wl-item__left">
            <span class="wl-dot" style="background:${req.typeColor || "#94a3b8"}"></span>
            <div>
              <div class="wl-item__title">${escapeHtml(req.typeTitle || "طلب")}</div>
              <div class="wl-item__desc">${escapeHtml(req.message || "—")}</div>
              <div class="wl-item__desc">
                تاريخ الإرسال: ${new Date(req.createdAt).toLocaleString("ar-SA")}
              </div>
              <div class="wl-item__desc">من: ${escapeHtml(req.senderName || "—")}</div>
              <div class="wl-item__desc">إلى: ${escapeHtml(req.receiverName || "—")}</div>
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
                activeRole === "tenant" &&
                req.status === "replied" &&
                !req.tenantReplySeenAt
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
                      <button type="button" class="resolve-request-btn" data-resolve-id="${escapeHtml(req.id)}">
                        تمت المعالجة
                      </button>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
          <span class="wl-badge">${escapeHtml(req.typeId || "request")}</span>
        </div>
      `
      )
      .join("");

    if (activeRole === "tenant") {
      void markTenantRepliesAsSeen(apartmentRequests);
    }
  }

  async function markTenantRepliesAsSeen(currentRequests) {
    const api = W();
    if (!api) return;
    const targets = currentRequests.filter(
      (req) => req.status === "replied" && !req.tenantReplySeenAt && req.serverId != null
    );
    for (const req of targets) {
      try {
        await api.patch(req.serverId, { tenant_reply_seen: true });
      } catch (e) {
        console.warn(e);
      }
    }
    if (targets.length) await refreshRequests();
  }

  void refreshRequests();

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
        if (e.target.dataset.close === "true") closeModal();
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
      submitBtn.addEventListener("click", async () => {
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
        const currentContractId = getCurrentContractId();
        if (!currentContractId) {
          alert("تعذر تحديد العقد الحالي لهذه الشقة");
          return;
        }
        const chosen = requestTypes.find((t) => t.id === selectedRequestType);
        const api = W();
        const apartmentIdNum = serverApartmentNumericId();
        if (apartmentIdNum == null) {
          alert("تعذر حفظ الطلب: رقم الشقة غير معروف على الخادم.");
          return;
        }
        if (!api) {
          alert("تعذر تحميل واجهة الطلبات.");
          return;
        }
        try {
          await api.create({
            apartment_id: apartmentIdNum,
            title: (chosen?.title || selectedRequestType || "طلب").slice(0, 250),
            description: message,
            priority: "medium",
            request_type: selectedRequestType,
            contract_id: Number(currentContractId) || null,
          });
        } catch (e) {
          alert("تعذر حفظ الطلب: " + (e?.message || e));
          return;
        }

        await refreshRequests();
        closeModal();
        alert("تم إرسال الطلب بنجاح ✅");
      });
    }
  }

  if (viewRequestsBtn) {
    viewRequestsBtn.addEventListener("click", () => void openViewRequestsModal());
  }
  if (closeViewRequestsModal) {
    closeViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }
  if (cancelViewRequestsModal) {
    cancelViewRequestsModal.addEventListener("click", closeViewRequestsModalFn);
  }

  if (viewRequestsList) {
    viewRequestsList.addEventListener("click", async (e) => {
      if (activeRole !== "owner") return;
      const resolveBtn = e.target.closest(".resolve-request-btn");

      if (resolveBtn) {
        const requestId = resolveBtn.dataset.resolveId;
        const target = cachedRequests.find((r) => String(r.id) === String(requestId));
        const sid = target?.serverId;
        const api = W();
        if (sid != null && api) {
          try {
            await api.putStatus(sid, "resolved");
          } catch (err) {
            alert("تعذر تحديث حالة الطلب: " + (err?.message || err));
            return;
          }
        }
        await refreshRequests();
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
    submitOwnerReplyBtn.addEventListener("click", async () => {
      if (!selectedOwnerRequestId) {
        alert("اختر طلبًا أولاً");
        return;
      }
      const reply = (ownerReplyMessage?.value || "").trim();
      if (!reply) {
        alert("اكتب الرد أولاً");
        return;
      }
      const target = cachedRequests.find((r) => String(r.id) === String(selectedOwnerRequestId));
      const api = W();
      if (!target?.serverId || !api) {
        alert("تعذر إرسال الرد على الخادم.");
        return;
      }
      try {
        await api.patch(target.serverId, { owner_reply: reply });
      } catch (e) {
        alert("تعذر إرسال الرد: " + (e?.message || e));
        return;
      }
      await refreshRequests();
      renderViewRequests();
      resetOwnerReplyUI();
      alert("تم إرسال الرد بنجاح ✅");
    });
  }
}
