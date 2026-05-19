/**
 * Messages page — streamlined communication: lists only `maintenance_requests`
 * (via GET /api/maintenance), including description and owner_reply. No separate
 * direct-messaging table.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const STORAGE_KEYS = {
    USERS: "walajna_users",
    CURRENT_USER: "walajna_current_user",
    ACTIVE_ROLE: "activeRole"
  };

  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const messagesList = document.getElementById("messagesList");
  const emptyState = document.getElementById("emptyState");
  const emptyText = document.getElementById("emptyText");
  const replyAlertsBadge = document.getElementById("replyAlertsBadge");

  const searchInput = document.getElementById("searchInput");
  const typeFilter = document.getElementById("typeFilter");
  const statusFilter = document.getElementById("statusFilter");
  const sortFilter = document.getElementById("sortFilter");

  const detailsModal = document.getElementById("detailsModal");
  const detailsContent = document.getElementById("detailsContent");

  const sidebarUserName = document.getElementById("sidebarUserName");
  const sidebarUserRole = document.getElementById("sidebarUserRole");

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
    } catch (e) {
      console.warn("[messages] apartments cache failed", e);
    }
  }

  function getSessionStoredUser() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER) || "null");
    } catch {
      return null;
    }
  }

  let loggedInUser =
    (typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser && WalajnaAuth.getCurrentUser()) ||
    getSessionStoredUser() ||
    getLocalObject(STORAGE_KEYS.CURRENT_USER);

  let allUsers = getLocalArray(STORAGE_KEYS.USERS);
  let activeRole = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) || "";
  let currentUser = null;
  let visibleMessages = [];
  /** @type {Array<object>} Raw rows from GET /api/maintenance */
  let apiRequestRows = [];
  /** @type {Array<object>} Raw rows from GET /api/notifications */
  let apiNotificationRows = [];

  if (!loggedInUser) {
    alert(T("messages.alertNoUser"));
    window.location.href = "../auth/login.html";
    return;
  }

  if (!activeRole) {
    activeRole = getUserRole(loggedInUser);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROLE, activeRole);
  } else {
    activeRole = normalizeRole(activeRole);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROLE, activeRole);
  }

  currentUser = resolveCurrentUserByRole(loggedInUser, activeRole, allUsers);

  if (!currentUser) {
    alert(T("messages.alertRole"));
    return;
  }

  if (typeof WalajnaTenantRequests !== "undefined" && WalajnaAuth?.fetchWithAuth) {
    try {
      apiRequestRows = await WalajnaTenantRequests.list();
    } catch (e) {
      console.warn("[messages] requests fetch", e);
    }
  }
  if (WalajnaAuth?.fetchWithAuth && WalajnaAuth?.API_BASE) {
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/notifications`,
        { method: "GET" }
      );
      if (res.ok) {
        const rows = await res.json();
        apiNotificationRows = Array.isArray(rows) ? rows : [];
      }
    } catch (e) {
      console.warn("[messages] notifications fetch", e);
    }
  }

  setupRoleView();
  setupSidebarUser();
  renderMessages();
  bindEvents();

  function bindEvents() {
    if (searchInput) searchInput.addEventListener("input", renderMessages);
    if (typeFilter) typeFilter.addEventListener("change", renderMessages);
    if (statusFilter) statusFilter.addEventListener("change", renderMessages);
    if (sortFilter) sortFilter.addEventListener("change", renderMessages);

    document.querySelectorAll("[data-close]").forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        closeModal(modal);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(detailsModal);
      }
    });
  }

  function setupRoleView() {
    if (activeRole === "owner") {
      pageTitle.textContent = T("messages.pageTitleOwner");
      pageSubtitle.textContent = T("messages.pageSubOwner");
    } else {
      pageTitle.textContent = T("messages.pageTitleTenant");
      pageSubtitle.textContent = T("messages.pageSubTenant");
    }
  }

  function renderMessages() {
    let filtered = getMessagesForCurrentRole();

    const searchValue = (searchInput?.value || "").trim().toLowerCase();
    const typeValue = typeFilter?.value || "all";
    const statusValue = statusFilter?.value || "all";
    const sortValue = sortFilter?.value || "newest";

    filtered = filtered.filter(msg => {
      const matchesSearch =
        !searchValue ||
        String(msg.buildingName || "").toLowerCase().includes(searchValue) ||
        String(msg.tenantNationalId || "").toLowerCase().includes(searchValue) ||
        String(msg.ownerNationalId || "").toLowerCase().includes(searchValue) ||
        String(msg.nationalId || "").toLowerCase().includes(searchValue) ||
        String(msg.buildingNumber || "").toLowerCase().includes(searchValue) ||
        String(msg.apartmentNumber || "").toLowerCase().includes(searchValue) ||
        String(msg.subject || "").toLowerCase().includes(searchValue) ||
        String(msg.body || "").toLowerCase().includes(searchValue) ||
        String(msg.senderName || "").toLowerCase().includes(searchValue) ||
        String(msg.receiverName || "").toLowerCase().includes(searchValue);

      const matchesType = typeValue === "all" || msg.type === typeValue;
      const matchesStatus = statusValue === "all" || msg.status === statusValue;

      return matchesSearch && matchesType && matchesStatus;
    });

    filtered.sort((a, b) => {
      const aHasPriority = a.hasReplyAlert ? 1 : 0;
      const bHasPriority = b.hasReplyAlert ? 1 : 0;

      if (aHasPriority !== bHasPriority) {
        return bHasPriority - aHasPriority;
      }

      const aPriorityDate = new Date(a.repliedAt || a.dateSent || a.createdAt || 0).getTime();
      const bPriorityDate = new Date(b.repliedAt || b.dateSent || b.createdAt || 0).getTime();

      return sortValue === "oldest"
        ? aPriorityDate - bPriorityDate
        : bPriorityDate - aPriorityDate;
    });

    visibleMessages = filtered;
    messagesList.innerHTML = "";

    updateReplyAlertsBadge(filtered);

    if (!filtered.length) {
      emptyState.classList.remove("hidden");
      emptyText.textContent =
        activeRole === "landlord" || activeRole === "owner"
          ? T("messages.emptyOwner")
          : T("messages.emptyDefault");
      return;
    }

    emptyState.classList.add("hidden");

    filtered.forEach(msg => {
      const card = document.createElement("article");
      card.className = `message-card ${msg.type || ""} ${msg.sourceType === "request" ? "request-notification" : ""} ${msg.hasReplyAlert ? "has-reply-highlight" : ""} ${msg.status === "read" ? "is-read" : ""}`;
      card.style.position = "relative";

      const sourceBadge = msg.sourceType === "request"
        ? `<span class="type-badge ${escapeHtml(msg.type || "")}">${escapeHtml(T("messages.requestAlert"))}</span>`
        : `<span class="type-badge ${escapeHtml(msg.type || "")}">${escapeHtml(getTypeLabel(msg.type))}</span>`;

      const globalReplyAlert = msg.hasReplyAlert
        ? `
          <span
            title="${escapeHtml(T("messages.newReplyTitle"))}"
            style="
              position:absolute;
              top:14px;
              left:14px;
              width:16px;
              height:16px;
              background:#ff3b30;
              border-radius:50%;
              border:2px solid #ffffff;
              box-shadow:0 0 10px rgba(255,59,48,0.75);
              z-index:9999;
              display:block;
            "
          ></span>
        `
        : "";

      card.innerHTML = `
        <div class="message-color-bar"></div>
        ${globalReplyAlert}

        <div class="message-content">
          <div class="message-top">
            <div>
              <h3 class="message-subject">${escapeHtml(msg.subject || T("messages.noSubject"))}</h3>
            </div>

            <div class="message-badges">
              ${sourceBadge}
              <span class="status-badge ${escapeHtml(msg.status || "unread")}">
                ${msg.status === "read" ? escapeHtml(T("messages.status.read")) : escapeHtml(T("messages.status.unread"))}
              </span>
            </div>
          </div>

          <div class="message-meta">
            <div class="meta-item">
              <span class="meta-label">${activeRole === "owner" ? escapeHtml(T("messages.metaFrom")) : escapeHtml(T("messages.metaTo"))}</span>
              <span class="meta-value">${escapeHtml(activeRole === "owner" ? msg.senderName : msg.receiverName)}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">${escapeHtml(T("messages.buildingName"))}</span>
              <span class="meta-value">${escapeHtml(msg.buildingName || "-")}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">${escapeHtml(T("messages.buildingNumber"))}</span>
              <span class="meta-value">${escapeHtml(msg.buildingNumber || "-")}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">${escapeHtml(T("messages.apartmentNumber"))}</span>
              <span class="meta-value">${escapeHtml(msg.apartmentNumber || "-")}</span>
            </div>
          </div>

          <div class="message-body">
            <p class="message-preview">${escapeHtml(truncateText(msg.body || "", 150)) || escapeHtml(T("common.dash"))}</p>
          </div>

          <div class="message-actions">
            <span class="message-date">${escapeHtml(T("messages.sentAt"))}: ${formatDate(msg.dateSent || msg.createdAt)}</span>

            <div class="message-actions-right">
              <button class="action-btn view-btn" data-id="${escapeHtml(msg.id)}" data-source="${escapeHtml(msg.sourceType || "message")}" type="button">
                ${escapeHtml(T("messages.viewDetails"))}
              </button>
              ${msg.status === "unread"
                ? `<button class="action-btn mark-btn" data-id="${escapeHtml(msg.id)}" data-source="${escapeHtml(msg.sourceType || "message")}" type="button">${escapeHtml(T("messages.markRead"))}</button>`
                : ""}
            </div>
          </div>
        </div>
      `;

      messagesList.appendChild(card);
    });

    bindCardButtons();
  }

  function updateReplyAlertsBadge(messages) {
    if (!replyAlertsBadge) return;

    const count = messages.filter(msg => msg.hasReplyAlert).length;

    if (count > 0) {
      replyAlertsBadge.textContent = String(count);
      replyAlertsBadge.classList.remove("hidden");
    } else {
      replyAlertsBadge.textContent = "0";
      replyAlertsBadge.classList.add("hidden");
    }
  }

  function bindCardButtons() {
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const source = btn.dataset.source || "message";
        const item = visibleMessages.find(
          m => String(m.id) === String(id) && String(m.sourceType || "message") === source
        );
        if (!item) return;

        openDetailsModal(item);
      });
    });

    document.querySelectorAll(".mark-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const source = btn.dataset.source || "message";
        const item = visibleMessages.find(
          m => String(m.id) === String(id) && String(m.sourceType || "message") === source
        );
        if (!item) return;

        await markItemAsRead(item);
        renderMessages();
      });
    });
  }

  function openDetailsModal(message) {
    const extraRequestInfo = message.sourceType === "request"
      ? `
        <div class="details-body-box">
          <h4>${escapeHtml(T("messages.requestDetails"))}</h4>
          <p><strong>${escapeHtml(T("messages.requestType"))}:</strong> ${escapeHtml(getTypeLabel(message.type))}</p>
          <p><strong>${escapeHtml(T("messages.requestStatus"))}:</strong> ${escapeHtml(message.requestStatusLabel || "-")}</p>
          ${message.ownerReply ? `<p><strong>${escapeHtml(T("messages.ownerReply"))}:</strong> ${escapeHtml(message.ownerReply)}</p>` : ""}
          ${message.repliedAt ? `<p><strong>${escapeHtml(T("messages.replyDate"))}:</strong> ${escapeHtml(formatDate(message.repliedAt))}</p>` : ""}
          ${message.resolvedAt ? `<p><strong>${escapeHtml(T("messages.resolvedDate"))}:</strong> ${escapeHtml(formatDate(message.resolvedAt))}</p>` : ""}
        </div>
      `
      : "";

    detailsContent.innerHTML = `
      <div class="details-grid">
        <div class="details-header">
          <div>
            <h3 class="details-subject">${escapeHtml(message.subject || T("messages.noSubject"))}</h3>
          </div>

          <div class="message-badges">
            <span class="type-badge ${escapeHtml(message.type || "")}">
              ${message.sourceType === "request" ? escapeHtml(T("messages.requestAlert")) : escapeHtml(getTypeLabel(message.type))}
            </span>
            <span class="status-badge ${escapeHtml(message.status || "unread")}">
              ${message.status === "read" ? escapeHtml(T("messages.status.read")) : escapeHtml(T("messages.status.unread"))}
            </span>
          </div>
        </div>

        <div class="details-meta">
          <div class="meta-item">
            <span class="meta-label">${activeRole === "owner" ? escapeHtml(T("messages.sender")) : escapeHtml(T("messages.receiver"))}</span>
            <span class="meta-value">${escapeHtml(activeRole === "owner" ? message.senderName : message.receiverName)}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">${escapeHtml(T("messages.sentAt"))}</span>
            <span class="meta-value">${formatDate(message.dateSent || message.createdAt)}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">${escapeHtml(T("messages.buildingName"))}</span>
            <span class="meta-value">${escapeHtml(message.buildingName || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">${escapeHtml(T("messages.buildingNumber"))}</span>
            <span class="meta-value">${escapeHtml(message.buildingNumber || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">${escapeHtml(T("messages.apartmentNumber"))}</span>
            <span class="meta-value">${escapeHtml(message.apartmentNumber || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">${escapeHtml(T("messages.msgType"))}</span>
            <span class="meta-value">${escapeHtml(getTypeLabel(message.type))}</span>
          </div>
        </div>

        <div class="details-body-box">
          <h4>${message.sourceType === "request" ? escapeHtml(T("messages.bodyRequest")) : escapeHtml(T("messages.bodyMessage"))}</h4>
          <p>${escapeHtml(message.body || "")}</p>
        </div>

        ${extraRequestInfo}
      </div>
    `;

    openModal(detailsModal);
  }

  function getMessagesForCurrentRole() {
    const req = getRequestNotificationsForCurrentRole();
    const pay = getPaymentNotificationsForCurrentRole();
    return [...req, ...pay];
  }

  function setupSidebarUser() {
    if (!currentUser) return;

    if (sidebarUserName) {
      sidebarUserName.textContent =
        currentUser.fullName ||
        currentUser.name ||
        currentUser.email ||
        T("common.user");
    }

    if (sidebarUserRole) {
      sidebarUserRole.textContent =
        activeRole === "owner" ? T("common.owner") : T("common.tenantRole");
    }
  }

  function mapApiRowToLegacyRequest(row) {
    const mapSt =
      typeof WalajnaTenantRequests !== "undefined" && WalajnaTenantRequests.mapStatusToUi
        ? WalajnaTenantRequests.mapStatusToUi(row.status)
        : "new";
    const statusLegacy =
      mapSt === "resolved" ? "resolved" : mapSt === "replied" ? "replied" : "new";
    return {
      id: String(row.id),
      apartmentId: String(row.apartment_id ?? ""),
      contractId: row.contract_id ?? null,
      buildingId: String(row.building_id ?? ""),
      buildingName: row.building_name || "",
      apartmentNumber:
        row.apartment_number != null && row.apartment_number !== ""
          ? String(row.apartment_number)
          : "",
      tenantNationalId: String(row.tenant_national_id ?? ""),
      typeId: row.request_type || "request",
      typeTitle: row.title || "",
      message: row.description || "",
      ownerReply: row.owner_reply || "",
      status: statusLegacy,
      ownerSeen: !!row.owner_seen,
      tenantSeen: !!row.tenant_reply_seen_at,
      createdAt: row.created_at,
      repliedAt: row.replied_at,
      resolvedAt: row.resolved_at
    };
  }

  function getRequests() {
    if (!Array.isArray(apiRequestRows)) return [];
    return apiRequestRows.map(mapApiRowToLegacyRequest);
  }

  function getPaymentNotificationsForCurrentRole() {
    if (!Array.isArray(apiNotificationRows) || !apiNotificationRows.length) return [];
    const roleTitle =
      activeRole === "owner" ? "PAYMENT_OWNER_RECEIVED" : "PAYMENT_TENANT_PAID";
    const rows = apiNotificationRows.filter(
      (n) => String(n?.title || "").trim() === roleTitle
    );
    return rows.map((n) => {
      const paymentMeta = parsePaymentNotificationRow(n);
      return {
        id: String(n.id),
        sourceType: "payment",
        type: "payment",
        subject:
          activeRole === "owner"
            ? T("messages.paymentReceivedOwner")
            : T("messages.paymentPaidTenant"),
        body: paymentMeta.body,
        buildingName: paymentMeta.buildingName,
        buildingNumber: paymentMeta.buildingNumber,
        apartmentNumber: paymentMeta.apartmentNumber,
        apartmentId: "",
        senderId: "system",
        senderName:
          activeRole === "owner" ? T("common.tenant") : T("common.landlord"),
        senderRole:
          activeRole === "owner" ? "tenant" : "landlord",
        receiverId: getUserIdentifier(currentUser),
        receiverName: getUserDisplayName(currentUser) || T("common.user"),
        receiverRole: activeRole,
        nationalId: String(currentUser?.nationalId || ""),
        status: n.is_read ? "read" : "unread",
        createdAt: n.created_at || "",
        dateSent: n.created_at || "",
        ownerReply: "",
        repliedAt: "",
        resolvedAt: "",
        rawRequestStatus: "",
        requestStatusLabel: "",
        hasReplyAlert: false
      };
    });
  }

  function parsePaymentNotificationRow(row) {
    const rawMessage = row?.message;
    const fallback = {
      body: String(rawMessage || ""),
      buildingName: "-",
      buildingNumber: "-",
      apartmentNumber: "-"
    };
    const explicitBuildingName = String(row?.building_name || "").trim();
    const explicitBuildingNumber = String(
      row?.building_number || row?.building_id || ""
    ).trim();
    const explicitApartmentNumber = String(row?.apartment_number || "").trim();
    const explicitAmount = row?.amount;
    const explicitDueDate = row?.due_date;
    if (
      explicitBuildingName ||
      explicitBuildingNumber ||
      explicitApartmentNumber ||
      explicitAmount != null
    ) {
      const amount = Number(explicitAmount || 0);
      const amountText = Number.isFinite(amount)
        ? amount.toLocaleString(
            window.walajna_language?.localeForNumbers?.() || "ar-SA-u-nu-latn"
          )
        : String(explicitAmount || "0");
      const dueDate = String(explicitDueDate || "");
      return {
        body:
          String(rawMessage || "").trim() ||
          (activeRole === "owner"
            ? `${T("messages.paymentBodyOwner")}: ${amountText} (${T("messages.paymentDue")}: ${dueDate || "-"})`
            : `${T("messages.paymentBodyTenant")}: ${amountText}`),
        buildingName: explicitBuildingName || "-",
        buildingNumber: explicitBuildingNumber || "-",
        apartmentNumber: explicitApartmentNumber || "-"
      };
    }
    if (!rawMessage || typeof rawMessage !== "string") return fallback;
    try {
      const parsed = JSON.parse(rawMessage);
      if (!parsed || parsed.kind !== "payment") return fallback;
      const amount = Number(parsed.amount || 0);
      const amountText = Number.isFinite(amount)
        ? amount.toLocaleString(
            window.walajna_language?.localeForNumbers?.() || "ar-SA-u-nu-latn"
          )
        : String(parsed.amount || "0");
      const dueDate = String(parsed.due_date || "");
      const body =
        activeRole === "owner"
          ? `${T("messages.paymentBodyOwner")}: ${amountText} (${T("messages.paymentDue")}: ${dueDate || "-"})`
          : `${T("messages.paymentBodyTenant")}: ${amountText}`;
      return {
        body,
        buildingName: String(parsed.building_name || "-"),
        buildingNumber: String(parsed.building_number || parsed.building_id || "-"),
        apartmentNumber: String(parsed.apartment_number || "-")
      };
    } catch {
      return fallback;
    }
  }

  function getRequestNotificationsForCurrentRole() {
    const requests = getRequests();
    if (!requests.length) return [];

    const buildings =
      typeof getBuildings === "function" ? getBuildings() : [];
    const users = getLocalArray(STORAGE_KEYS.USERS);
    const apartments =
      typeof getApartments === "function"
        ? getApartments()
        : getLocalArray("walajna_apartments");

    const currentNationalId = String(currentUser?.nationalId || "");

    let filteredRequests = [];

    if (activeRole === "tenant") {
      filteredRequests = requests.filter(req => {
        const reqNationalId = String(req.tenantNationalId || "");
        return currentNationalId && reqNationalId === currentNationalId;
      });
    } else {
      filteredRequests = requests;
    }

    return filteredRequests.map(req => {
      const matchedBuilding = buildings.find(
        b =>
          String(b.name || "").trim() === String(req.buildingName || "").trim() ||
          String(b.id || "").trim() === String(req.buildingId || "").trim()
      );

      const matchedApartment = apartments.find(
        a =>
          String(a.id || "").trim() === String(req.apartmentId || "").trim() ||
          (
            String(a.buildingName || "").trim() === String(req.buildingName || "").trim() &&
            String(a.number || "").trim() === String(req.apartmentNumber || "").trim()
          )
      );

      const resolvedBuildingNumber = matchedBuilding?.id || "-";

      const ownerUser = users.find(
        u => String(u.id || "") === String(matchedBuilding?.ownerId || "")
      );

      const tenantUser = users.find(
        u => String(u.nationalId || "") === String(req.tenantNationalId || "")
      );

      const landlordName =
        ownerUser?.fullName ||
        ownerUser?.name ||
        T("common.landlord");

      const tenantDisplayName =
        req.tenantName ||
        tenantUser?.fullName ||
        tenantUser?.name ||
        matchedApartment?.tenantInfo?.fullName ||
        T("common.tenant");

      const seen = activeRole === "owner"
        ? !!req.ownerSeen
        : !!req.tenantSeen;

      const hasReplyAlert =
        activeRole === "tenant" &&
        (
          !!req.ownerReply ||
          req.status === "replied" ||
          req.status === "resolved"
        ) &&
        !req.tenantSeen;

      const requestStatusLabel =
        req.status === "resolved"
          ? T("messages.statusResolved")
          : req.status === "replied"
            ? T("messages.statusReplied")
            : T("messages.statusNew");

      return {
        id: String(req.id),
        sourceType: "request",
        type: req.typeId || "request",
        subject:
          activeRole === "owner"
            ? `${T("messages.requestAlertPrefix")}: ${req.typeTitle || getTypeLabel(req.typeId || "request")}`
            : (
                hasReplyAlert
                  ? `${T("messages.replyOnRequest")}: ${req.typeTitle || getTypeLabel(req.typeId || "request")}`
                  : `${T("messages.sentRequest")}: ${req.typeTitle || getTypeLabel(req.typeId || "request")}`
              ),
        body: req.message || "",
        buildingName: req.buildingName || "-",
        buildingNumber: resolvedBuildingNumber,
        apartmentNumber: req.apartmentNumber || "-",
        apartmentId: req.apartmentId || "",
        tenantNationalId: String(req.tenantNationalId || ""),

        senderId:
          activeRole === "owner"
            ? String(req.tenantNationalId || "")
            : "system",

        senderName:
          activeRole === "owner"
            ? tenantDisplayName
            : landlordName,

        senderRole:
          activeRole === "owner"
            ? "tenant"
            : "landlord",

        receiverId:
          activeRole === "owner"
            ? getUserIdentifier(currentUser)
            : String(matchedBuilding?.ownerId || ""),

        receiverName: landlordName,
        receiverRole: "owner",
        ownerNationalId: String(ownerUser?.nationalId || ""),

        status: seen ? "read" : "unread",
        createdAt: req.createdAt,
        dateSent: req.createdAt,
        ownerReply: req.ownerReply || "",
        repliedAt: req.repliedAt || "",
        resolvedAt: req.resolvedAt || "",
        rawRequestStatus: req.status || "new",
        requestStatusLabel,
        hasReplyAlert
      };
    });
  }

  async function markItemAsRead(item) {
    if (!item) return;
    if (item.sourceType === "payment") {
      await markPaymentNotificationAsRead(item.id);
      return;
    }
    await markRequestNotificationAsRead(item.id);
  }

  async function markRequestNotificationAsRead(requestId) {
    if (typeof WalajnaTenantRequests === "undefined" || !WalajnaAuth?.fetchWithAuth) {
      return;
    }
    try {
      if (activeRole === "owner") {
        await WalajnaTenantRequests.patch(requestId, { owner_seen: true });
      } else {
        await WalajnaTenantRequests.patch(requestId, { tenant_reply_seen: true });
      }
      apiRequestRows = await WalajnaTenantRequests.list();
    } catch (e) {
      console.warn("[messages] mark request read", e);
    }
  }

  async function markPaymentNotificationAsRead(notificationId) {
    if (!WalajnaAuth?.fetchWithAuth || !WalajnaAuth?.API_BASE) return;
    try {
      await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "PUT" }
      );
      apiNotificationRows = apiNotificationRows.map((row) =>
        String(row?.id) === String(notificationId)
          ? { ...row, is_read: true }
          : row
      );
    } catch (e) {
      console.warn("[messages] mark payment notification read", e);
    }
  }

  function resolveCurrentUserByRole(loggedUser, role, users) {
    if (!loggedUser) return null;

    const loggedRole = getUserRole(loggedUser);

    if (loggedRole === role) {
      return loggedUser;
    }

    const sameRoleUser = users.find(user => getUserRole(user) === role);
    return sameRoleUser || loggedUser;
  }

  function getUserRole(user) {
    if (!user) return "";
    return normalizeRole(user.role || user.roles || user.accountType || "");
  }

  function getUserIdentifier(user) {
    if (!user) return "";
    return String(user.id || user.email || "");
  }

  function getUserDisplayName(user) {
    if (!user) return "";
    return String(user.fullName || user.name || user.email || "");
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("is-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function getLocalArray(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function getLocalObject(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();

  if (r === "landlord" || r === "owner" || r === "\u0645\u0627\u0644\u0643" || r === "\u0645\u0624\u062c\u0631") return "owner";
  if (r === "tenant" || r === "renter" || r === "\u0645\u0633\u062a\u0623\u062c\u0631") return "tenant";

  return r;
}

  function getTypeLabel(type) {
    switch (type) {
      case "complaint": return T("messages.type.complaint");
      case "maintenance": return T("messages.type.maintenance");
      case "suggestion": return T("messages.type.suggestion");
      case "request": return T("messages.type.request");
      case "payment": return T("messages.type.payment");
      default: return T("common.na");
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "-";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const loc =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-US"
          : "ar-SA-u-nu-latn";
    return new Intl.DateTimeFormat(loc, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function truncateText(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  document.addEventListener("walajna:i18n-applied", () => {
    setupRoleView();
    setupSidebarUser();
    renderMessages();
  });
});