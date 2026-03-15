document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");

  if (!apartmentId) {
    alert("تعذر تحديد الشقة");
    return;
  }

  const COSTS_KEY = "walajna_costs";

  const pageSub = document.getElementById("pageSub");
  const searchInput = document.getElementById("searchInput");
  const costsSummary = document.getElementById("costsSummary");
  const costsTableContainer = document.getElementById("costsTableContainer");
  const costsCount = document.getElementById("costsCount");

  const openCostModalBtn = document.getElementById("openCostModalBtn");
  const recordCostModal = document.getElementById("recordCostModal");
  const closeRecordCostModal = document.getElementById("closeRecordCostModal");
  const cancelRecordCostModal = document.getElementById("cancelRecordCostModal");
  const costBackdrop = document.querySelector("[data-record-cost-close='true']");

  const selectedCostInfo = document.getElementById("selectedCostInfo");
  const costTypeInput = document.getElementById("costTypeInput");
  const costAmountInput = document.getElementById("costAmountInput");
  const costStatusInput = document.getElementById("costStatusInput");
  const costDateInput = document.getElementById("costDateInput");
  const costNotesInput = document.getElementById("costNotesInput");
  const saveCostBtn = document.getElementById("saveCostBtn");

  const COST_TYPES = {
    maintenance: "صيانة",
    repair: "إصلاح",
    discount: "تخفيض",
    adjustment: "تعديل",
    service: "خدمة",
    replacement: "استبدال",
    cleaning: "تنظيف",
    other: "أخرى"
  };

  const STATUS_LABELS = {
    approved: "معتمد",
    pending: "معلق",
    cancelled: "ملغي"
  };

  function getApartments() {
    return JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  }

  function getApartment() {
    const apartments = getApartments();
    return apartments.find((apt) => apt.id === apartmentId) || null;
  }

  function getCosts() {
    return JSON.parse(localStorage.getItem(COSTS_KEY) || "[]");
  }

  function saveCosts(costs) {
    localStorage.setItem(COSTS_KEY, JSON.stringify(costs));
  }

  function getApartmentCosts() {
    return getCosts().filter((item) => item.apartmentId === apartmentId);
  }

  function formatAmount(value) {
    return `${Number(value || 0).toLocaleString("en-US")} ريال`;
  }

  function openModal() {
    recordCostModal.setAttribute("aria-hidden", "false");
    selectedCostInfo.textContent = `تسجيل مصروف جديد للشقة ${apartmentId}`;
    costDateInput.value = new Date().toISOString().slice(0, 10);
  }

  function closeModal() {
    recordCostModal.setAttribute("aria-hidden", "true");
    costTypeInput.value = "";
    costAmountInput.value = "";
    costStatusInput.value = "approved";
    costDateInput.value = "";
    costNotesInput.value = "";
  }

  function renderSummary(costs) {
    const total = costs.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const approved = costs
      .filter((item) => item.status === "approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = costs
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const cancelled = costs
      .filter((item) => item.status === "cancelled")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    costsSummary.innerHTML = `
      <div class="sum-card">
        <span class="sum-label">إجمالي المصروفات</span>
        <div class="sum-value">${formatAmount(total)}</div>
      </div>

      <div class="sum-card">
        <span class="sum-label">المعتمد</span>
        <div class="sum-value">${formatAmount(approved)}</div>
      </div>

      <div class="sum-card">
        <span class="sum-label">المعلق</span>
        <div class="sum-value">${formatAmount(pending)}</div>
      </div>

      <div class="sum-card">
        <span class="sum-label">الملغي</span>
        <div class="sum-value">${formatAmount(cancelled)}</div>
      </div>
    `;
  }

  function renderTable(costs) {
    if (!costs.length) {
      costsTableContainer.innerHTML = `<div class="empty-state">لا يوجد مصروفات مسجلة حاليًا</div>`;
      return;
    }

    costsTableContainer.innerHTML = `
      <table class="costs-table">
        <thead>
          <tr>
            <th>تاريخ المصروف</th>
            <th>المبلغ</th>
            <th>النوع</th>
            <th>الحالة</th>
            <th>تاريخ التسجيل</th>
            <th>ملاحظات</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          ${costs.map((item) => `
            <tr>
              <td>${item.expenseDate || "—"}</td>
              <td>${formatAmount(item.amount)}</td>
              <td>${item.typeLabel || COST_TYPES[item.type] || "—"}</td>
              <td>
                <span class="badge ${item.status}">
                  ${STATUS_LABELS[item.status] || "—"}
                </span>
              </td>
              <td>${item.createdAt || "—"}</td>
              <td>${item.notes || "—"}</td>
              <td>
                <button class="delete-btn" data-id="${item.id}">حذف</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    costsTableContainer.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const confirmed = confirm("هل أنت متأكد من حذف المصروف؟");
        if (!confirmed) return;

        const updatedCosts = getCosts().filter((item) => item.id !== id);
        saveCosts(updatedCosts);
        renderPage();
      });
    });
  }

  function renderPage() {
    const apartment = getApartment();
    const allCosts = getApartmentCosts();
    const keyword = (searchInput.value || "").trim().toLowerCase();

    if (apartment) {
      pageSub.textContent = `عرض مصروفات الشقة ${apartment.number} - ${apartment.buildingName || ""}`;
    }

    let filteredCosts = allCosts;

    if (keyword) {
      filteredCosts = allCosts.filter((item) => {
        return (
          String(item.amount || "").includes(keyword) ||
          String(item.expenseDate || "").toLowerCase().includes(keyword) ||
          String(item.createdAt || "").toLowerCase().includes(keyword) ||
          String(item.notes || "").toLowerCase().includes(keyword) ||
          String(item.typeLabel || "").toLowerCase().includes(keyword) ||
          String(STATUS_LABELS[item.status] || "").toLowerCase().includes(keyword)
        );
      });
    }

    costsCount.textContent = `عدد المصروفات: ${allCosts.length}`;
    renderSummary(allCosts);
    renderTable(filteredCosts);
  }

  openCostModalBtn?.addEventListener("click", openModal);
  closeRecordCostModal?.addEventListener("click", closeModal);
  cancelRecordCostModal?.addEventListener("click", closeModal);
  costBackdrop?.addEventListener("click", closeModal);

  searchInput?.addEventListener("input", renderPage);

  saveCostBtn?.addEventListener("click", () => {
    const type = costTypeInput.value;
    const amount = Number(costAmountInput.value);
    const status = costStatusInput.value;
    const expenseDate = costDateInput.value;
    const notes = costNotesInput.value.trim();

    if (!type || !amount || amount <= 0 || !expenseDate) {
      alert("يرجى تعبئة الحقول المطلوبة");
      return;
    }

    const costs = getCosts();

    const newCost = {
      id: `COST-${Date.now()}`,
      apartmentId,
      type,
      typeLabel: COST_TYPES[type] || "أخرى",
      amount,
      status,
      expenseDate,
      createdAt: new Date().toISOString().slice(0, 10),
      notes
    };

    costs.unshift(newCost);
    saveCosts(costs);
    closeModal();
    renderPage();
  });

  renderPage();
});