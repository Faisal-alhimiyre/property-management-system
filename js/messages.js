document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEYS = {
    USERS: "walajna_users",
    CURRENT_USER: "walajna_current_user",
    MESSAGES: "walajna_messages",
    ACTIVE_ROLE: "activeRole"
  };

  const pageTitle = document.getElementById("pageTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const composeBtn = document.getElementById("composeBtn");
  const messagesList = document.getElementById("messagesList");
  const emptyState = document.getElementById("emptyState");
  const emptyText = document.getElementById("emptyText");

  const searchInput = document.getElementById("searchInput");
  const typeFilter = document.getElementById("typeFilter");
  const statusFilter = document.getElementById("statusFilter");
  const sortFilter = document.getElementById("sortFilter");

  const detailsModal = document.getElementById("detailsModal");
  const composeModal = document.getElementById("composeModal");
  const detailsContent = document.getElementById("detailsContent");
  const composeForm = document.getElementById("composeForm");
  const receiverLandlord = document.getElementById("receiverLandlord");

  let allUsers = getLocalArray(STORAGE_KEYS.USERS);
  let currentUser = getLocalObject(STORAGE_KEYS.CURRENT_USER);
  let allMessages = getLocalArray(STORAGE_KEYS.MESSAGES);
  let activeRole = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) || "";
  let visibleMessages = [];

  seedSampleMessagesIfNeeded();
  allMessages = getLocalArray(STORAGE_KEYS.MESSAGES);

  if (!currentUser) {
    alert("لا يوجد مستخدم مسجل دخول حالياً");
    window.location.href = "login.html";
    return;
  }

  if (!activeRole) {
    activeRole = normalizeRole(currentUser.role || currentUser.accountType || "");
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ROLE, activeRole);
  }

  setupRoleView();
  populateLandlords();
  renderMessages();
  bindEvents();

  function bindEvents() {
    searchInput.addEventListener("input", renderMessages);
    typeFilter.addEventListener("change", renderMessages);
    statusFilter.addEventListener("change", renderMessages);
    sortFilter.addEventListener("change", renderMessages);

    composeBtn.addEventListener("click", () => openModal(composeModal));

    composeForm.addEventListener("submit", handleComposeSubmit);

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
        closeModal(composeModal);
      }
    });
  }

  function setupRoleView() {
    if (activeRole === "landlord") {
      pageTitle.textContent = "صندوق رسائل المالك";
      pageSubtitle.textContent = "استعراض الرسائل الواردة من المستأجرين حسب العقار والوحدة";
      composeBtn.classList.add("hidden");
    } else {
      pageTitle.textContent = "رسائل المستأجر";
      pageSubtitle.textContent = "إدارة الرسائل المرسلة إلى المالك بخصوص العقار أو الشقة";
      composeBtn.classList.remove("hidden");
    }
  }

  function populateLandlords() {
    receiverLandlord.innerHTML = `<option value="">اختر المالك</option>`;

    const landlords = allUsers.filter(user => normalizeRole(user.role || user.accountType || "") === "landlord");

    landlords.forEach(landlord => {
      const option = document.createElement("option");
      option.value = landlord.id || landlord.email || landlord.username;
      option.textContent = landlord.fullName || landlord.name || landlord.username || landlord.email || "مالك";
      receiverLandlord.appendChild(option);
    });
  }

  function renderMessages() {
    let filtered = getMessagesForCurrentRole();

    const searchValue = searchInput.value.trim().toLowerCase();
    const typeValue = typeFilter.value;
    const statusValue = statusFilter.value;
    const sortValue = sortFilter.value;

    filtered = filtered.filter(msg => {
      const matchesSearch =
        !searchValue ||
        (msg.buildingName || "").toLowerCase().includes(searchValue) ||
        (msg.buildingNumber || "").toLowerCase().includes(searchValue) ||
        (msg.apartmentNumber || "").toLowerCase().includes(searchValue) ||
        (msg.subject || "").toLowerCase().includes(searchValue) ||
        (msg.senderName || "").toLowerCase().includes(searchValue) ||
        (msg.receiverName || "").toLowerCase().includes(searchValue);

      const matchesType = typeValue === "all" || msg.type === typeValue;
      const matchesStatus = statusValue === "all" || msg.status === statusValue;

      return matchesSearch && matchesType && matchesStatus;
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.dateSent).getTime();
      const dateB = new Date(b.dateSent).getTime();
      return sortValue === "oldest" ? dateA - dateB : dateB - dateA;
    });

    visibleMessages = filtered;
    messagesList.innerHTML = "";

    if (!filtered.length) {
      emptyState.classList.remove("hidden");
      emptyText.textContent =
        activeRole === "landlord"
          ? "لا توجد رسائل واردة مطابقة حالياً."
          : "لا توجد رسائل مرسلة مطابقة حالياً.";
      return;
    }

    emptyState.classList.add("hidden");

    filtered.forEach(msg => {
      const card = document.createElement("article");
      card.className = `message-card ${msg.type}`;

      card.innerHTML = `
        <div class="message-color-bar"></div>

        <div class="message-content">
          <div class="message-top">
            <div>
              <h3 class="message-subject">${escapeHtml(msg.subject || "بدون عنوان")}</h3>
            </div>

            <div class="message-badges">
              <span class="type-badge ${msg.type}">${getTypeLabel(msg.type)}</span>
              <span class="status-badge ${msg.status}">${msg.status === "read" ? "مقروء" : "غير مقروء"}</span>
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
            <span class="message-date">تاريخ الإرسال: ${formatDate(msg.dateSent)}</span>

            <div class="message-actions-right">
              <button class="action-btn view-btn" data-id="${msg.id}">عرض التفاصيل</button>
              ${activeRole === "landlord" && msg.status === "unread"
                ? `<button class="action-btn mark-btn" data-id="${msg.id}">تحديد كمقروء</button>`
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
        const message = allMessages.find(m => String(m.id) === String(id));
        if (!message) return;

        if (activeRole === "landlord" && message.status === "unread") {
          message.status = "read";
          saveMessages();
        }

        openDetailsModal(message);
        renderMessages();
      });
    });

    document.querySelectorAll(".mark-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const message = allMessages.find(m => String(m.id) === String(id));
        if (!message) return;

        message.status = "read";
        saveMessages();
        renderMessages();
      });
    });
  }

  function handleComposeSubmit(e) {
    e.preventDefault();

    if (activeRole !== "tenant") {
      alert("فقط المستأجر يمكنه إرسال رسالة جديدة من هذه الصفحة.");
      return;
    }

    const type = document.getElementById("messageType").value.trim();
    const buildingName = document.getElementById("buildingName").value.trim();
    const buildingNumber = document.getElementById("buildingNumber").value.trim();
    const apartmentNumber = document.getElementById("apartmentNumber").value.trim();
    const landlordId = receiverLandlord.value;
    const subject = document.getElementById("messageSubject").value.trim();
    const body = document.getElementById("messageBody").value.trim();

    if (!type || !buildingName || !buildingNumber || !apartmentNumber || !landlordId || !subject || !body) {
      alert("يرجى تعبئة جميع الحقول.");
      return;
    }

    const landlord = allUsers.find(user => String(user.id || user.email || user.username) === String(landlordId));
    if (!landlord) {
      alert("تعذر العثور على المالك المحدد.");
      return;
    }

    const newMessage = {
      id: generateId(),
      type,
      subject,
      body,
      buildingName,
      buildingNumber,
      apartmentNumber,
      senderId: currentUser.id || currentUser.email || currentUser.username,
      senderName: currentUser.fullName || currentUser.name || currentUser.username || currentUser.email || "مستأجر",
      senderRole: "tenant",
      receiverId: landlord.id || landlord.email || landlord.username,
      receiverName: landlord.fullName || landlord.name || landlord.username || landlord.email || "مالك",
      receiverRole: "landlord",
      status: "unread",
      dateSent: new Date().toISOString()
    };

    allMessages.unshift(newMessage);
    saveMessages();

    composeForm.reset();
    closeModal(composeModal);
    renderMessages();

    alert("تم إرسال الرسالة بنجاح.");
  }

  function openDetailsModal(message) {
    detailsContent.innerHTML = `
      <div class="details-grid">
        <div class="details-header">
          <div>
            <h3 class="details-subject">${escapeHtml(message.subject || "بدون عنوان")}</h3>
          </div>

          <div class="message-badges">
            <span class="type-badge ${message.type}">${getTypeLabel(message.type)}</span>
            <span class="status-badge ${message.status}">${message.status === "read" ? "مقروء" : "غير مقروء"}</span>
          </div>
        </div>

        <div class="details-meta">
          <div class="meta-item">
            <span class="meta-label">${activeRole === "landlord" ? "المرسل" : "المرسل إليه"}</span>
            <span class="meta-value">${escapeHtml(activeRole === "landlord" ? message.senderName : message.receiverName)}</span>
          </div>

          <div class="meta-item">
            <span class="meta-label">تاريخ الإرسال</span>
            <span class="meta-value">${formatDate(message.dateSent)}</span>
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
            <span class="meta-value">${getTypeLabel(message.type)}</span>
          </div>
        </div>

        <div class="details-body-box">
          <h4>محتوى الرسالة</h4>
          <p>${escapeHtml(message.body || "")}</p>
        </div>
      </div>
    `;

    openModal(detailsModal);
  }

  function getMessagesForCurrentRole() {
    const currentId = String(currentUser.id || currentUser.email || currentUser.username || "");

    if (activeRole === "landlord") {
      return allMessages.filter(msg => String(msg.receiverId) === currentId || normalizeRole(msg.receiverRole) === "landlord" && String(msg.receiverName) === String(currentUser.fullName || currentUser.name || currentUser.username || currentUser.email));
    }

    return allMessages.filter(msg => String(msg.senderId) === currentId || normalizeRole(msg.senderRole) === "tenant" && String(msg.senderName) === String(currentUser.fullName || currentUser.name || currentUser.username || currentUser.email));
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

    if (
      r === "landlord" ||
      r === "owner" ||
      r === "مالك" ||
      r === "مؤجر"
    ) return "landlord";

    if (
      r === "tenant" ||
      r === "renter" ||
      r === "مستأجر"
    ) return "tenant";

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

    const role = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROLE) || normalizeRole(current.role || current.accountType || "");
    const users = getLocalArray(STORAGE_KEYS.USERS);

    const tenantUser =
      normalizeRole(current.role || current.accountType || "") === "tenant"
        ? current
        : users.find(u => normalizeRole(u.role || u.accountType || "") === "tenant");

    const landlordUser =
      normalizeRole(current.role || current.accountType || "") === "landlord"
        ? current
        : users.find(u => normalizeRole(u.role || u.accountType || "") === "landlord");

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
        senderId: tenantUser.id || tenantUser.email || tenantUser.username,
        senderName: tenantUser.fullName || tenantUser.name || tenantUser.username || tenantUser.email,
        senderRole: "tenant",
        receiverId: landlordUser.id || landlordUser.email || landlordUser.username,
        receiverName: landlordUser.fullName || landlordUser.name || landlordUser.username || landlordUser.email,
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
        senderId: tenantUser.id || tenantUser.email || tenantUser.username,
        senderName: tenantUser.fullName || tenantUser.name || tenantUser.username || tenantUser.email,
        senderRole: "tenant",
        receiverId: landlordUser.id || landlordUser.email || landlordUser.username,
        receiverName: landlordUser.fullName || landlordUser.name || landlordUser.username || landlordUser.email,
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
        senderId: tenantUser.id || tenantUser.email || tenantUser.username,
        senderName: tenantUser.fullName || tenantUser.name || tenantUser.username || tenantUser.email,
        senderRole: "tenant",
        receiverId: landlordUser.id || landlordUser.email || landlordUser.username,
        receiverName: landlordUser.fullName || landlordUser.name || landlordUser.username || landlordUser.email,
        receiverRole: "landlord",
        status: "read",
        dateSent: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
      }
    ];

    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(sample));
  }
});