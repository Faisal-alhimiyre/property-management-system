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
  const number = document.getElementById("aptNumber");
  const building = document.getElementById("buildingName");
  const status = document.getElementById("leaseStatus");
  const rent = document.getElementById("rentAmount");

  // extra fields (if you have them in HTML later)
  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const meterNumber = document.getElementById("meterNumber");
  const notes = document.getElementById("notes");

  // If not on details page, stop
  if (!title && !number && !building && !status && !rent) return;

  const params = new URLSearchParams(window.location.search);
  const aptId = params.get("id");

  if (!aptId) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  // Temporary demo data (replace later with localStorage list)
  const apartments = {
    A101: {
      number: "A101",
      building: "عمارة السلامة 1",
      status: "نشط",
      rent: "1500 ريال",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      meterNumber: "M-77881",
      notes: "—"
    },
    A102: {
      number: "A102",
      building: "عمارة السلامة 1",
      status: "قريب الانتهاء",
      rent: "1600 ريال",
      startDate: "2025-06-01",
      endDate: "2026-06-01",
      meterNumber: "M-77882",
      notes: "يرجى متابعة فاتورة الكهرباء"
    }
  };

  const data = apartments[aptId];

  if (!data) {
    if (title) title.textContent = "لم يتم العثور على الشقة";
    return;
  }

  // Fill UI
  if (title) title.textContent = `تفاصيل ${data.number}`;
  if (number) number.textContent = data.number ?? "—";
  if (building) building.textContent = data.building ?? "—";
  if (status) status.textContent = data.status ?? "—";
  if (rent) rent.textContent = data.rent ?? "—";

  if (startDate) startDate.textContent = data.startDate ?? "—";
  if (endDate) endDate.textContent = data.endDate ?? "—";
  if (meterNumber) meterNumber.textContent = data.meterNumber ?? "—";
  if (notes) notes.textContent = data.notes ?? "—";

  // Status badge coloring
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
  const paymentsBtn = document.getElementById("paymentsBtn");
  const messageBtn = document.getElementById("messageBtn");

  if (paymentsBtn) {
    paymentsBtn.addEventListener("click", () => {
      window.location.href = `../tenants/tenant_payment.html?id=${encodeURIComponent(aptId)}`;
    });
  }

  if (messageBtn) {
    messageBtn.addEventListener("click", () => {
      window.location.href = `chat-owner.html?id=${encodeURIComponent(aptId)}`;
    });
  }

  /* =========================
     3) REQUEST TYPE MODAL + MESSAGE (150 chars)
     ========================= */

  const openModalBtn = document.getElementById("openRequestModal");
  const modal = document.getElementById("requestModal");
  const closeModalBtn = document.getElementById("closeRequestModal");
  const cancelBtn = document.getElementById("cancelRequestModal");
  const listEl = document.getElementById("requestTypeList");
 

  const messageBox = document.getElementById("requestMessageBox");
  const messageInput = document.getElementById("requestMessage");
  const charCount = document.getElementById("charCount");
  const submitBtn = document.getElementById("submitRequestBtn");

  // If modal isn't on this page, stop modal logic
  if (!modal || !listEl || !openModalBtn) return;

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

  function renderList(items, q) {
    const query = (q || "").trim().toLowerCase();

    const filtered = items.filter(x =>
      x.title.toLowerCase().includes(query) ||
      x.desc.toLowerCase().includes(query)
    );

    if (!filtered.length) {
      listEl.innerHTML = `
        <div style="padding:14px;color:#667085;font-weight:800;">
          لا توجد نتائج
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(x => `
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
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    resetMessageUI();
  
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    resetMessageUI();
  }

  // Open/Close handlers
  openModalBtn.addEventListener("click", openModal);
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.close === "true") {
      closeModal();
    }
  });

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });


  // Select type (click)
  listEl.addEventListener("click", (e) => {
    const item = e.target.closest(".wl-item");
    if (!item) return;

    selectedRequestType = item.dataset.type;

    if (messageBox) messageBox.style.display = "block";
    if (messageInput) messageInput.focus();
  });

  // Select type (Enter)
  listEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const item = e.target.closest(".wl-item");
    if (!item) return;

    selectedRequestType = item.dataset.type;

    if (messageBox) messageBox.style.display = "block";
    if (messageInput) messageInput.focus();
  });

  // 150-char counter
  if (messageInput && charCount) {
    messageInput.addEventListener("input", () => {
      charCount.textContent = String(messageInput.value.length);
    });
  }

  // Submit request (with message)
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

  
  renderList(requestTypes);
});