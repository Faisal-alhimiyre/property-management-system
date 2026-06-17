/* ========================================
   Apartment Requests — server-only (maintenance_requests)
   ======================================== */

function initRequestsSystem(aptId, activeRole, currentUser, leaseStatus, pageApartment) {
  const serverApartmentOverlay =
    pageApartment && typeof pageApartment === "object" ? pageApartment : null;

  const W = () =>
    typeof WalajnaTenantRequests !== "undefined" ? WalajnaTenantRequests : null;

  const T = (key, params) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(key, params)
      : key;

  function localeForDates() {
    return window.walajna_language && typeof window.walajna_language.localeForDates === "function"
      ? window.walajna_language.localeForDates()
      : window.walajna_language && window.walajna_language.get() === "en"
        ? "en-GB-u-nu-latn"
        : "ar-SA-u-nu-latn";
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
  /** @type {Array<object>} UI-shaped rows from WalajnaTenantRequests.mapRowToUi */
  let cachedRequests = [];
  let tenantSubmitInFlight = false;
  let ownerReplyInFlight = false;
  let ownerResolveInFlight = false;

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
    const buildings = typeof getBuildings === "function" ? getBuildings() : [];
    return (
      buildings.find((b) => String(b.id) === String(buildingId)) || null
    );
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
        T("common.landlord")
      );
    }
    const users = typeof getUsers === "function" ? getUsers() : getLocalArray("walajna_users");
    const owner = users.find((u) => u.id === apartment?.ownerId);
    return owner?.fullName || owner?.name || T("common.landlord");
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
    const currentContractId = getCurrentContractId();
    if (!currentContractId) {
      return cachedRequests.slice();
    }
    return cachedRequests.filter((req) => {
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
      <div class="wl-item" role="option" tabindex="0" data-type="${escapeHtml(x.id)}">
        <div class="wl-item__left">
          <span class="wl-dot" style="background:${x.color}"></span>
          <div>
            <div class="wl-item__title">${escapeHtml(requestTypeLabel(x.id))}</div>
            <div class="wl-item__desc">${escapeHtml(T(x.descKey))}</div>
          </div>
        </div>
        <span class="wl-badge">${escapeHtml(requestTypeLabel(x.id))}</span>
      </div>
    `
      )
      .join("");
  }

  function setButtonBusy(button, busy, busyLabelKey) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent || "";
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      if (busyLabelKey) {
        button.textContent = T(busyLabelKey);
      }
      return;
    }
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
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
      .map(
        (req) => `
        <div class="wl-item" tabindex="0" data-request-id="${escapeHtml(req.id)}">
          <div class="wl-item__left">
            <span class="wl-dot" style="background:${req.typeColor || "#94a3b8"}"></span>
            <div>
              <div class="wl-item__title">${escapeHtml(
                requestTypeLabel(req.typeId) || req.typeTitle || T("messages.type.request")
              )}</div>
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
                        data-resolve-id="${escapeHtml(req.id)}"
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
        if (tenantSubmitInFlight) return;
        if (!selectedRequestType) {
          alert(T("aptReq.alert.pickType"));
          return;
        }
        const message = (messageInput?.value || "").trim();
        if (!message) {
          alert(T("aptReq.alert.writeMessage"));
          return;
        }
        const currentContractId = getCurrentContractId();
        if (!currentContractId) {
          alert(T("aptReq.alert.noContract"));
          return;
        }
        const chosen = requestTypes.find((t) => t.id === selectedRequestType);
        const api = W();
        const apartmentIdNum = serverApartmentNumericId();
        if (apartmentIdNum == null) {
          alert(T("aptReq.alert.noServerApt"));
          return;
        }
        if (!api) {
          alert(T("aptReq.alert.noRequestApi"));
          return;
        }
        tenantSubmitInFlight = true;
        setButtonBusy(submitBtn, true);
        try {
          await api.create({
            apartment_id: apartmentIdNum,
            title: requestTypeLabel(chosen?.id || selectedRequestType).slice(0, 250),
            description: message,
            priority: "medium",
            request_type: chosen?.id || selectedRequestType || "maintenance",
            contract_id: Number(currentContractId) || null,
          });
        } catch (e) {
          alert(String(e?.message || e));
          tenantSubmitInFlight = false;
          setButtonBusy(submitBtn, false);
          return;
        }

        await refreshRequests();
        tenantSubmitInFlight = false;
        setButtonBusy(submitBtn, false);
        closeModal();
        alert(T("aptReq.alert.sentSuccess"));
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
        if (ownerResolveInFlight) return;
        const requestId = resolveBtn.dataset.resolveId;
        const target = cachedRequests.find((r) => String(r.id) === String(requestId));
        const sid = target?.serverId;
        const api = W();
        if (sid != null && api) {
          ownerResolveInFlight = true;
          setButtonBusy(resolveBtn, true);
          try {
            await api.putStatus(sid, "resolved");
          } catch (err) {
            alert(String(err?.message || err));
            ownerResolveInFlight = false;
            setButtonBusy(resolveBtn, false);
            return;
          }
          ownerResolveInFlight = false;
          setButtonBusy(resolveBtn, false);
        }
        await refreshRequests();
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
    submitOwnerReplyBtn.addEventListener("click", async () => {
      if (ownerReplyInFlight) return;
      if (!selectedOwnerRequestId) {
        alert(T("aptReq.alert.pickRequestFirst"));
        return;
      }
      const reply = (ownerReplyMessage?.value || "").trim();
      if (!reply) {
        alert(T("aptReq.alert.writeReplyFirst"));
        return;
      }
      const target = cachedRequests.find((r) => String(r.id) === String(selectedOwnerRequestId));
      const api = W();
      if (!api) {
        alert(T("aptReq.alert.noRequestApi"));
        return;
      }
      if (!target?.serverId) {
        alert(T("aptReq.alert.pickRequestFirst"));
        return;
      }
      ownerReplyInFlight = true;
      setButtonBusy(submitOwnerReplyBtn, true);
      try {
        await api.patch(target.serverId, { owner_reply: reply });
      } catch (e) {
        alert(String(e?.message || e));
        ownerReplyInFlight = false;
        setButtonBusy(submitOwnerReplyBtn, false);
        return;
      }
      ownerReplyInFlight = false;
      setButtonBusy(submitOwnerReplyBtn, false);
      await refreshRequests();
      renderViewRequests();
      resetOwnerReplyUI();
      alert(T("aptReq.alert.replySuccess"));
    });
  }
}
