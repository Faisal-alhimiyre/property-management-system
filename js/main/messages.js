document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    USERS: "walajna_users",
    CURRENT_USER: "walajna_current_user",
    MESSAGES: "walajna_messages",
    ACTIVE_ROLE: "activeRole"
  };

  const REQUEST_STORAGE_CANDIDATES = [
    "walajna_requests",
    "walajna_apartment_requests",
    "apartment_requests",
    "requests"
  ];

  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const messagesList = document.getElementById("messagesList");
  const emptyState = document.getElementById("emptyState");
  const emptyText = document.getElementById("emptyText");

  const searchInput = document.getElementById("searchInput");
  const typeFilter = document.getElementById("typeFilter");
  const statusFilter = document.getElementById("statusFilter");
  const sortFilter = document.getElementById("sortFilter");

  const detailsModal = document.getElementById("detailsModal");
  const detailsContent = document.getElementById("detailsContent");

  const sidebarUserName = document.getElementById("sidebarUserName");
  const sidebarUserRole = document.getElementById("sidebarUserRole");

  let allUsers = getLocalArray(STORAGE_KEYS.USERS);
  let loggedInUser = getLocalObject(STORAGE_KEYS.CURRENT_USER);
  let allMessages = getLocalArray(STORAGE_KEYS.MESSAGES);
  let activeRole = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) || "";
  let currentUser = null;
  let visibleMessages = [];

  seedSampleMessagesIfNeeded();

  allUsers = getLocalArray(STORAGE_KEYS.USERS);
  allMessages = getLocalArray(STORAGE_KEYS.MESSAGES);
  loggedInUser = getLocalObject(STORAGE_KEYS.CURRENT_USER);

  if (!loggedInUser) {
    alert("لا يوجد مستخدم مسجل دخول حالياً");
    window.location.href = "login.html";
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
    alert("تعذر تحديد المستخدم الحالي حسب الدور النشط.");
    return;
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
    if (activeRole === "landlord") {
      pageTitle.textContent = "صندوق رسائل المالك";
      pageSubtitle.textContent = "استعراض الرسائل والتنبيهات الواردة من المستأجرين حسب العقار والوحدة";
    } else {
      pageTitle.textContent = "صندوق الرسائل";
      pageSubtitle.textContent = "استعراض الرسائل والتنبيهات المتعلقة بالعقار أو الشقة";
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
      const dateA = new Date(a.dateSent || a.createdAt || 0).getTime();
      const dateB = new Date(b.dateSent || b.createdAt || 0).getTime();
      return sortValue === "oldest" ? dateA - dateB : dateB - dateA;
    });

    visibleMessages = filtered;
    messagesList.innerHTML = "";

    if (!filtered.length) {
      emptyState.classList.remove("hidden");
      emptyText.textContent =
        activeRole === "landlord"
          ? "لا توجد رسائل أو تنبيهات واردة مطابقة حالياً."
          : "لا توجد رسائل أو تنبيهات مطابقة حالياً.";
      return;
    }

    emptyState.classList.add("hidden");

    filtered.forEach(msg => {
      const card = document.createElement("article");
      card.className = `message-card ${msg.type || ""} ${msg.sourceType === "request" ? "request-notification" : ""}`;

      const sourceBadge = msg.sourceType === "request"
        ? `<span class="type-badge ${escapeHtml(msg.type || "")}">تنبيه طلب</span>`
        : `<span class="type-badge ${escapeHtml(msg.type || "")}">${getTypeLabel(msg.type)}</span>`;

      const replyAlertBadge = msg.hasReplyAlert
        ? `<span class="reply-alert-dot" aria-label="يوجد رد جديد"></span>`
        : "";

      card.innerHTML = `
        <div class="message-color-bar"></div>

        <div class="message-content">
          <div class="message-top">
            <div>
              <h3 class="message-subject">${escapeHtml(msg.subject || "بدون عنوان")}</h3>
            </div>

            <div class="message-badges">
              ${sourceBadge}
              ${replyAlertBadge}
              <span class="status-badge ${escapeHtml(msg.status || "unread")}">
                ${msg.status === "read" ? "مقروء" : "غير مقروء"}
              </span>
            </div>
          </div>

          <div class="message-meta">
            <div class="meta-item">
              <span class="meta-label">${activeRole === "landlord" ? "من" : "إلى"}</span>
              <span class="meta-value">${escapeHtml(activeRole === "landlord" ? msg.senderName : msg.receiverName)}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">اسم المبنى</span>
              <span class="meta-value">${escapeHtml(msg.buildingName || "-")}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">رقم المبنى</span>
              <span class="meta-value">${escapeHtml(msg.buildingNumber || "-")}</span>
            </div>

            <div class="meta-item">
              <span class="meta-label">رقم الشقة</span>
              <span class="meta-value">${escapeHtml(msg.apartmentNumber || "-")}</span>
            </div>
          </div>

          <p class="message-preview">${escapeHtml(truncateText(msg.body || "", 150))}</p>

          <div class="message-actions">
            <span class="message-date">تاريخ الإرسال: ${formatDate(msg.dateSent || msg.createdAt)}</span>

            <div class="message-actions-right">
              <button class="action-btn view-btn" data-id="${escapeHtml(msg.id)}" data-source="${escapeHtml(msg.sourceType || "message")}" type="button">
                عرض التفاصيل
              </button>
              ${msg.status === "unread"
                ? `<button class="action-btn mark-btn" data-id="${escapeHtml(msg.id)}" data-source="${escapeHtml(msg.sourceType || "message")}" type="button">تحديد كمقروء</button>`
                : ""}
            </div>
          </div>
        </div>
      `;

      messagesList.appendChild(card);
    });

    bindCardButtons();
  }

  function bindCardButtons() {
    document.querySelectorAll(".view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const source = btn.dataset.source || "message";
        const item = visibleMessages.find(
          m => String(m.id) === String(id) && String(m.sourceType || "message") === source
        );
        if (!item) return;

        if (item.status === "unread") {
          markItemAsRead(item);
        }

        openDetailsModal(item);
        renderMessages();
      });
    });

    document.querySelectorAll(".mark-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const source = btn.dataset.source || "message";
        const item = visibleMessages.find(
          m => String(m.id) === String(id) && String(m.sourceType || "message") === source
        );
        if (!item) return;

        markItemAsRead(item);
        renderMessages();
      });
    });
  }

  function openDetailsModal(message) {
    const extraRequestInfo = message.sourceType === "request"
      ? `
        <div class="details-body-box">
          <h4>تفاصيل الطلب</h4>
          <p><strong>نوع الطلب:</strong> ${escapeHtml(getTypeLabel(message.type))}</p>
          <p><strong>حالة الطلب:</strong> ${escapeHtml(message.requestStatusLabel || "-")}</p>
          ${message.ownerReply ? `<p><strong>رد المالك:</strong> ${escapeHtml(message.ownerReply)}</p>` : ""}
          ${message.repliedAt ? `<p><strong>تاريخ الرد:</strong> ${escapeHtml(formatDate(message.repliedAt))}</p>` : ""}
          ${message.resolvedAt ? `<p><strong>تاريخ المعالجة:</strong> ${escapeHtml(formatDate(message.resolvedAt))}</p>` : ""}
        </div>
      `
      : "";

    detailsContent.innerHTML = `
      <div class="details-grid">
        <div class="details-header">
          <div>
            <h3 class="details-subject">${escapeHtml(message.subject || "بدون عنوان")}</h3>
          </div>

          <div class="message-badges">
            <span class="type-badge ${escapeHtml(message.type || "")}">
              ${message.sourceType === "request" ? "تنبيه طلب" : getTypeLabel(message.type)}
            </span>
            ${message.hasReplyAlert ? `<span class="reply-alert-dot" aria-label="يوجد رد جديد"></span>` : ""}
            <span class="status-badge ${escapeHtml(message.status || "unread")}">
              ${message.status === "read" ? "مقروء" : "غير مقروء"}
            </span>
          </div>
        </div>

        <div class="details-meta">
          <div class="meta-item">
            <span class="meta-label">${activeRole === "landlord" ? "المرسل" : "المرسل إليه"}</span>
            <span class="meta-value">${escapeHtml(activeRole === "landlord" ? message.senderName : message.receiverName)}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">تاريخ الإرسال</span>
            <span class="meta-value">${formatDate(message.dateSent || message.createdAt)}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">اسم المبنى</span>
            <span class="meta-value">${escapeHtml(message.buildingName || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">رقم المبنى</span>
            <span class="meta-value">${escapeHtml(message.buildingNumber || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">رقم الشقة</span>
            <span class="meta-value">${escapeHtml(message.apartmentNumber || "-")}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">نوع الرسالة</span>
            <span class="meta-value">${escapeHtml(getTypeLabel(message.type))}</span>
          </div>
        </div>

        <div class="details-body-box">
          <h4>${message.sourceType === "request" ? "محتوى الطلب" : "محتوى الرسالة"}</h4>
          <p>${escapeHtml(message.body || "")}</p>
        </div>

        ${extraRequestInfo}
      </div>
    `;

    openModal(detailsModal);
  }

  function getMessagesForCurrentRole() {
    const normalMessages = getNormalMessagesForCurrentRole();
    const requestNotifications = getRequestNotificationsForCurrentRole();
    return [...normalMessages, ...requestNotifications];
  }

  function setupSidebarUser() {
    if (!currentUser) return;

    if (sidebarUserName) {
      sidebarUserName.textContent =
        currentUser.fullName ||
        currentUser.name ||
        currentUser.username ||
        "المستخدم";
    }

    if (sidebarUserRole) {
      sidebarUserRole.textContent =
        activeRole === "landlord" ? "مالك" : "مستأجر";
    }
  }

  function getNormalMessagesForCurrentRole() {
    const currentId = String(getUserIdentifier(currentUser) || "");
    const currentName = String(getUserDisplayName(currentUser) || "");

    if (activeRole === "landlord") {
      return allMessages
        .filter(msg => {
          const receiverId = String(msg.receiverId || "");
          const receiverName = String(msg.receiverName || "");
          const receiverRole = normalizeRole(msg.receiverRole || "");

          return (
            (receiverId && receiverId === currentId) ||
            (receiverName && receiverName === currentName) ||
            (receiverRole === "landlord" && (receiverId === currentId || receiverName === currentName))
          );
        })
        .map(msg => ({
          ...msg,
          sourceType: "message"
        }));
    }

    return allMessages
      .filter(msg => {
        const senderId = String(msg.senderId || "");
        const senderName = String(msg.senderName || "");
        const senderRole = normalizeRole(msg.senderRole || "");

        return (
          (senderId && senderId === currentId) ||
          (senderName && senderName === currentName) ||
          (senderRole === "tenant" && (senderId === currentId || senderName === currentName))
        );
      })
      .map(msg => ({
        ...msg,
        sourceType: "message"
      }));
  }

  function getRequestNotificationsForCurrentRole() {
    const requests = getRequests();
    if (!requests.length) return [];

    const buildings = getLocalArray("walajna_buildings");
    const users = getLocalArray(STORAGE_KEYS.USERS);
    const apartments = getLocalArray("walajna_apartments");

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
        ownerUser?.username ||
        "المالك";

      const tenantDisplayName =
        req.tenantName ||
        tenantUser?.fullName ||
        tenantUser?.name ||
        tenantUser?.username ||
        matchedApartment?.tenantInfo?.fullName ||
        "المستأجر";

      const seen = activeRole === "landlord"
        ? !!req.ownerSeen
        : !!req.tenantSeen;

      const requestStatusLabel =
        req.status === "resolved"
          ? "تمت المعالجة"
          : req.status === "replied"
          ? "تم الرد"
          : "جديد";

      return {
        id: String(req.id),
        sourceType: "request",
        type: req.typeId || "request",
        subject:
          activeRole === "landlord"
            ? `تنبيه طلب: ${req.typeTitle || getTypeLabel(req.typeId || "request")}`
            : `تم إرسال طلب: ${req.typeTitle || getTypeLabel(req.typeId || "request")}`,
        body: req.message || "",
        buildingName: req.buildingName || "-",
        buildingNumber: resolvedBuildingNumber,
        apartmentNumber: req.apartmentNumber || "-",
        apartmentId: req.apartmentId || "",

        senderId:
          activeRole === "landlord"
            ? String(req.tenantNationalId || "")
            : "system",

        senderName:
          activeRole === "landlord"
            ? tenantDisplayName
            : landlordName,

        senderRole:
          activeRole === "landlord"
            ? "tenant"
            : "landlord",

        receiverId:
          activeRole === "landlord"
            ? getUserIdentifier(currentUser)
            : String(matchedBuilding?.ownerId || ""),

        receiverName: landlordName,
        receiverRole: "landlord",

        status: seen ? "read" : "unread",
        createdAt: req.createdAt,
        dateSent: req.createdAt,
        ownerReply: req.ownerReply || "",
        repliedAt: req.repliedAt || "",
        resolvedAt: req.resolvedAt || "",
        rawRequestStatus: req.status || "new",
        requestStatusLabel,

        hasReplyAlert:
          activeRole === "tenant" &&
          !!req.ownerReply &&
          !req.tenantSeen
      };
    });
  }

  function markItemAsRead(item) {
    if (!item) return;

    if ((item.sourceType || "message") === "request") {
      markRequestNotificationAsRead(item.id);
      return;
    }

    const message = allMessages.find(m => String(m.id) === String(item.id));
    if (!message) return;

    message.status = "read";
    saveMessages();
  }

  function markRequestNotificationAsRead(requestId) {
    const requests = getRequests();
    const updated = requests.map(req => {
      if (String(req.id) !== String(requestId)) return req;

      if (activeRole === "landlord") {
        return { ...req, ownerSeen: true };
      }

      return { ...req, tenantSeen: true };
    });

    saveRequests(updated);
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
    return String(user.id || user.email || user.username || "");
  }

  function getUserDisplayName(user) {
    if (!user) return "";
    return String(user.fullName || user.name || user.username || user.email || "");
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add("is-open");
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
  }

  function saveMessages() {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
  }

  function detectRequestStorageKey() {
    for (const key of REQUEST_STORAGE_CANDIDATES) {
      const parsed = getParsedStorageValue(key);
      if (Array.isArray(parsed)) return key;
    }
    return REQUEST_STORAGE_CANDIDATES[0];
  }

  function getRequests() {
    const key = detectRequestStorageKey();
    return getLocalArray(key);
  }

  function saveRequests(requests) {
    const key = detectRequestStorageKey();
    localStorage.setItem(key, JSON.stringify(requests));
  }

  function getParsedStorageValue(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
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

    if (r === "landlord" || r === "owner" || r === "مالك" || r === "مؤجر") return "landlord";
    if (r === "tenant" || r === "renter" || r === "مستأجر") return "tenant";

    return r;
  }

  function getTypeLabel(type) {
    switch (type) {
      case "complaint": return "شكوى";
      case "maintenance": return "صيانة";
      case "suggestion": return "اقتراح";
      case "request": return "طلب";
      default: return "غير محدد";
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "-";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return new Intl.DateTimeFormat("ar-SA", {
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

  function generateId() {
    return "msg_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function seedSampleMessagesIfNeeded() {
    const existing = getLocalArray(STORAGE_KEYS.MESSAGES);
    if (existing.length) return;

    const current = getLocalObject(STORAGE_KEYS.CURRENT_USER);
    if (!current) return;

    const roleFromStorage =
      localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) || getUserRole(current);
    const role = normalizeRole(roleFromStorage);
    const users = getLocalArray(STORAGE_KEYS.USERS);

    const tenantUser =
      getUserRole(current) === "tenant"
        ? current
        : users.find(u => getUserRole(u) === "tenant");

    const landlordUser =
      getUserRole(current) === "landlord"
        ? current
        : users.find(u => getUserRole(u) === "landlord");

    if (!tenantUser || !landlordUser) return;

    const sample = [
      {
        id: generateId(),
        type: "complaint",
        subject: "مشكلة في تسرب المياه",
        body: "يوجد تسرب مياه في المطبخ منذ يومين ونحتاج إلى حل المشكلة في أسرع وقت ممكن.",
        buildingName: "برج الروضة",
        buildingNumber: "B-12",
        apartmentNumber: "A-203",
        senderId: getUserIdentifier(tenantUser),
        senderName: getUserDisplayName(tenantUser),
        senderRole: "tenant",
        receiverId: getUserIdentifier(landlordUser),
        receiverName: getUserDisplayName(landlordUser),
        receiverRole: "landlord",
        status: role === "landlord" ? "unread" : "read",
        dateSent: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
      },
      {
        id: generateId(),
        type: "maintenance",
        subject: "طلب صيانة للمكيف",
        body: "المكيف لا يبرد بالشكل المطلوب، ونرغب بزيارة فني للكشف والصيانة.",
        buildingName: "مبنى الياسمين",
        buildingNumber: "C-04",
        apartmentNumber: "12",
        senderId: getUserIdentifier(tenantUser),
        senderName: getUserDisplayName(tenantUser),
        senderRole: "tenant",
        receiverId: getUserIdentifier(landlordUser),
        receiverName: getUserDisplayName(landlordUser),
        receiverRole: "landlord",
        status: "read",
        dateSent: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
      },
      {
        id: generateId(),
        type: "suggestion",
        subject: "اقتراح تحسين المدخل",
        body: "أقترح إضافة إضاءة أفضل عند مدخل المبنى لتحسين الشكل العام وزيادة الأمان.",
        buildingName: "برج الروضة",
        buildingNumber: "B-12",
        apartmentNumber: "A-203",
        senderId: getUserIdentifier(tenantUser),
        senderName: getUserDisplayName(tenantUser),
        senderRole: "tenant",
        receiverId: getUserIdentifier(landlordUser),
        receiverName: getUserDisplayName(landlordUser),
        receiverRole: "landlord",
        status: "read",
        dateSent: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
      }
    ];

    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(sample));
  }
});