document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");
  const tenantsBtn = document.getElementById("tenantsBtn");
  const maintenanceBtn = document.getElementById("maintenanceBtn");
  const sectionTitle = document.getElementById("sectionTitle");
  const pageSubtitle = document.getElementById("pageSubtitle");

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("apartmentId");

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("ar-SA");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getApartmentNumber(apartment) {
    return apartment?.number || apartment?.apartmentNumber || "—";
  }

  function getTenantName(historyItem) {
    return (
      historyItem?.tenantInfo?.fullName ||
      historyItem?.tenantInfo?.name ||
      "—"
    );
  }

  function getHistoryContractId(historyItem) {
    return (
      historyItem?.contractId ||
      historyItem?.contract?.id ||
      historyItem?.currentContractId ||
      null
    );
  }

  const apartments = getLocalArray("walajna_apartments");
  const costs = getLocalArray("walajna_costs");

  const apartment = apartments.find((a) => String(a.id) === String(apartmentId));

  if (!apartment) {
    if (sectionTitle) {
      sectionTitle.textContent = "تعذر العثور على الشقة";
    }

    if (content) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>الشقة غير موجودة</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">ملاحظة</span>
              <strong>الرابط غير صحيح أو تم حذف الشقة</strong>
            </div>
          </div>
        </div>
      `;
    }
    return;
  }

  const buildingName = apartment.buildingName || "—";
  const aptNumber = getApartmentNumber(apartment);

  if (pageSubtitle) {
    pageSubtitle.textContent = `شقة ${aptNumber} - ${buildingName}`;
  }

  function renderTenants() {
    if (tenantsBtn) tenantsBtn.classList.add("active");
    if (maintenanceBtn) maintenanceBtn.classList.remove("active");

    if (sectionTitle) {
      sectionTitle.textContent = "سجل المستأجرين";
    }

    const history = Array.isArray(apartment.tenantHistory)
      ? apartment.tenantHistory
          .slice()
          .sort((a, b) => {
            const aTime = new Date(a.archivedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.archivedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          })
      : [];

    if (!history.length) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>لا يوجد مستأجرين سابقين</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">الحالة</span>
              <strong>لم يتم حفظ أي سجل سابق لهذه الشقة حتى الآن</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    content.innerHTML = history
      .map((h) => {
        const tenantName = getTenantName(h);
        const nationalId = h.tenantNationalId || "—";
        const startDate = formatDate(h.contract?.startDate || h.startDate);
        const endDate = formatDate(h.contract?.endDate || h.endDate);
        const contractId = getHistoryContractId(h);

        return `
          <div class="card" data-history-id="${escapeHtml(h.historyId || "")}">
            <div class="card-header">
              <h3>${escapeHtml(tenantName)}</h3>
            </div>

            <div class="card-body">
              <div class="info-box">
                <span class="label">رقم الهوية</span>
                <strong>${escapeHtml(nationalId)}</strong>
              </div>

              <div class="info-box">
                <span class="label">بداية العقد</span>
                <strong>${escapeHtml(startDate)}</strong>
              </div>

              <div class="info-box">
                <span class="label">نهاية العقد</span>
                <strong>${escapeHtml(endDate)}</strong>
              </div>

              ${
                contractId
                  ? `
                    <div class="info-box">
                      <span class="label">رقم العقد</span>
                      <strong>${escapeHtml(contractId)}</strong>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderMaintenance() {
    if (maintenanceBtn) maintenanceBtn.classList.add("active");
    if (tenantsBtn) tenantsBtn.classList.remove("active");

    if (sectionTitle) {
      sectionTitle.textContent = "سجل الصيانات";
    }

    const apartmentCosts = costs
      .filter((c) => String(c.apartmentId) === String(apartmentId))
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.date || a.createdAt || 0).getTime();
        const bTime = new Date(b.date || b.createdAt || 0).getTime();
        return bTime - aTime;
      });

    if (!apartmentCosts.length) {
      content.innerHTML = `
        <div class="card empty-card">
          <div class="card-header">
            <h3>لا توجد صيانة مسجلة</h3>
          </div>
          <div class="card-body">
            <div class="info-box">
              <span class="label">الحالة</span>
              <strong>لا توجد تكاليف أو صيانات محفوظة لهذه الشقة</strong>
            </div>
          </div>
        </div>
      `;
      return;
    }

    content.innerHTML = apartmentCosts
      .map((cost) => {
        const title = cost.title || cost.category || cost.type || "صيانة";
        const description = cost.description || cost.notes || "—";
        const createdAt = formatDate(cost.date || cost.createdAt);
        const tenantName = cost.tenantName || "—";
        const tenantNationalId = cost.tenantNationalId || "—";
        const contractId = cost.contractId || "—";

        return `
          <div class="card maintenance-card">
            <div class="card-header">
              <h3>${escapeHtml(title)}</h3>
            </div>

            <div class="card-body">
              <div class="info-box">
                <span class="label">الوصف</span>
                <strong>${escapeHtml(description)}</strong>
              </div>

              <div class="info-box">
                <span class="label">تاريخ التسجيل</span>
                <strong>${escapeHtml(createdAt)}</strong>
              </div>

              ${
                tenantName !== "—"
                  ? `
                    <div class="info-box">
                      <span class="label">المستأجر المرتبط</span>
                      <strong>${escapeHtml(tenantName)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                tenantNationalId !== "—"
                  ? `
                    <div class="info-box">
                      <span class="label">رقم الهوية</span>
                      <strong>${escapeHtml(tenantNationalId)}</strong>
                    </div>
                  `
                  : ""
              }

              ${
                contractId !== "—"
                  ? `
                    <div class="info-box">
                      <span class="label">رقم العقد</span>
                      <strong>${escapeHtml(contractId)}</strong>
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  if (tenantsBtn) {
    tenantsBtn.addEventListener("click", renderTenants);
  }

  if (maintenanceBtn) {
    maintenanceBtn.addEventListener("click", renderMaintenance);
  }

  if (content) {
    content.addEventListener("click", (e) => {
      const card = e.target.closest("[data-history-id]");
      if (!card) return;

      const historyId = card.dataset.historyId;
      if (!historyId) return;

      window.location.href =
        `apartment_history_details.html?apartmentId=${encodeURIComponent(apartmentId)}` +
        `&historyId=${encodeURIComponent(historyId)}`;
    });
  }

  renderTenants();
});