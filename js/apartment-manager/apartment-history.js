document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");
  const tenantsBtn = document.getElementById("tenantsBtn");
  const maintenanceBtn = document.getElementById("maintenanceBtn");
  const sectionTitle = document.getElementById("sectionTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("apartmentId");

  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  const apartment = apartments.find(a => a.id === apartmentId);

  if (!apartment) {
    content.innerHTML = "<p>الشقة غير موجودة</p>";
    return;
  }

  // 🔥 عنوان الصفحة
  const buildingName = apartment.buildingName || "";
  const aptNumber = apartment.number || "";

  if (pageSubtitle) {
    pageSubtitle.textContent = `شقة ${aptNumber} - ${buildingName}`;
  }

  /* =========================
     المستأجرين
     ========================= */
  function renderTenants() {
    tenantsBtn.classList.add("active");
    maintenanceBtn.classList.remove("active");

    sectionTitle.textContent = "سجل المستأجرين";

    const history = apartment.tenantHistory || [];

    if (!history.length) {
      content.innerHTML = `
        <div class="card">
          لا يوجد مستأجرين سابقين
        </div>
      `;
      return;
    }

    content.innerHTML = history
      .map(h => `
        <div class="card" data-history-id="${h.historyId}">
          <h3>${h.tenantInfo?.fullName || "-"}</h3>

          <p>🪪 الهوية: ${h.tenantNationalId || "-"}</p>

          <p>📅 بداية العقد: ${h.contract?.startDate || "-"}</p>

          <p>📅 نهاية العقد: ${h.contract?.endDate || "-"}</p>
        </div>
      `)
      .join("");
  }

  /* =========================
     الصيانات
     ========================= */
  function renderMaintenance() {
    maintenanceBtn.classList.add("active");
    tenantsBtn.classList.remove("active");

    sectionTitle.textContent = "سجل الصيانات";

    const apartmentCosts = costs.filter(c => c.apartmentId === apartmentId);

    if (!apartmentCosts.length) {
      content.innerHTML = `
        <div class="card">
          لا توجد صيانة مسجلة
        </div>
      `;
      return;
    }

    content.innerHTML = apartmentCosts
      .map(c => `
        <div class="card">
          <h3>${c.title || "صيانة"}</h3>

          <p>${c.description || "-"}</p>

          <p>📅 ${c.createdAt || "-"}</p>
        </div>
      `)
      .join("");
  }

  /* =========================
     EVENTS
     ========================= */
  tenantsBtn.onclick = renderTenants;
  maintenanceBtn.onclick = renderMaintenance;

  // 🔥 الضغط على كرت مستأجر
  content.addEventListener("click", (e) => {
    const card = e.target.closest("[data-history-id]");
    if (!card) return;

    const historyId = card.dataset.historyId;

    window.location.href =
      `apartment_history_details.html?apartmentId=${apartmentId}&historyId=${historyId}`;
  });

  /* =========================
     INIT
     ========================= */
  renderTenants();
});