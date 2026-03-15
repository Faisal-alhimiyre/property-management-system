document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("buildingTitle");
  const grid = document.getElementById("apartmentsGrid");

  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const buildingId = params.get("buildingId");

  if (!buildingId) {
    if (title) title.textContent = "لم يتم العثور على العمارة";
    return;
  }

  const buildings = JSON.parse(localStorage.getItem("walajna_buildings") || "[]");
  const apartments = JSON.parse(localStorage.getItem("walajna_apartments") || "[]");
  const requests = JSON.parse(localStorage.getItem("walajna_requests") || "[]");
  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");
  const costs = JSON.parse(localStorage.getItem("walajna_costs") || "[]");

  const building = buildings.find((b) => b.id === buildingId);

  if (building && title) {
    title.textContent = building.name;
  } else if (title) {
    title.textContent = "لم يتم العثور على العمارة";
  }

  const buildingApartments = apartments.filter((a) => a.buildingId === buildingId);

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString("en-US")} ريال`;
  }

  function getRequestPriority(typeId) {
    const priorities = {
      maintenance: 2,
      complaint: 3,
      suggestion: 4,
      request: 5,
    };

    return priorities[typeId] || 99;
  }

  function getOpenRequests(apartmentId) {
    return requests.filter((request) => {
      return request.apartmentId === apartmentId && request.status !== "resolved";
    });
  }

  function getHighestPriorityRequest(apartmentId) {
    const openRequests = getOpenRequests(apartmentId);

    if (!openRequests.length) return null;

    return [...openRequests].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartmentId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return payments.some((payment) => {
      if (payment.apartmentId !== apartmentId) return false;
      if (payment.status === "paid") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;

      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });
  }

  function getBuildingFinancialSummary() {
    const apartmentIds = buildingApartments.map((a) => a.id);

    const monthlyIncome = buildingApartments.reduce((sum, apartment) => {
      const monthlyRent = Number(apartment?.contract?.rentAmount || 0);
      return sum + monthlyRent;
    }, 0);

    const expenses = costs
      .filter((cost) => apartmentIds.includes(cost.apartmentId))
      .reduce((sum, cost) => sum + Number(cost.amount || 0), 0);

    const profit = monthlyIncome - expenses;

    const occupiedUnits = buildingApartments.filter((apartment) => {
      return (
        apartment.leaseStatus !== "vacant" ||
        !!apartment.tenantUserId ||
        !!apartment.tenantNationalId ||
        !!apartment.tenantInfo?.fullName
      );
    }).length;

    const lateUnits = buildingApartments.filter((apartment) => {
      return isApartmentRentOverdue(apartment.id);
    }).length;

    return {
      monthlyIncome,
      expenses,
      profit,
      occupiedUnits,
      totalUnits: buildingApartments.length,
      lateUnits,
    };
  }

  function renderBuildingFinancialSummary() {
    const incomeEl = document.getElementById("buildingIncome");
    const costsEl = document.getElementById("buildingCosts");
    const profitEl = document.getElementById("buildingProfit");
    const occupiedEl = document.getElementById("buildingOccupiedUnits");
    const lateEl = document.getElementById("buildingLateUnits");

    const summary = getBuildingFinancialSummary();

    if (incomeEl) {
      incomeEl.textContent = formatMoney(summary.monthlyIncome);
    }

    if (costsEl) {
      costsEl.textContent = formatMoney(summary.expenses);
    }

    if (profitEl) {
      profitEl.textContent = formatMoney(summary.profit);
      profitEl.classList.remove("profit-positive", "profit-negative");

      if (summary.profit > 0) {
        profitEl.classList.add("profit-positive");
      } else if (summary.profit < 0) {
        profitEl.classList.add("profit-negative");
      }
    }

    if (occupiedEl) {
      occupiedEl.textContent = `${summary.occupiedUnits} / ${summary.totalUnits}`;
    }

    if (lateEl) {
      lateEl.textContent = String(summary.lateUnits);
    }
  }

  renderBuildingFinancialSummary();

  const floors = {};

  buildingApartments.forEach((apartment) => {
    const floor = Number(apartment.floorNumber || 1);

    if (!floors[floor]) {
      floors[floor] = [];
    }

    floors[floor].push(apartment);
  });

  const sortedFloors = Object.keys(floors)
    .map(Number)
    .sort((a, b) => a - b);

  grid.innerHTML = sortedFloors
    .map((floorNumber) => {
      const floorApartments = floors[floorNumber].sort((a, b) => {
        const aNum = Number(a.number || 0);
        const bNum = Number(b.number || 0);
        return aNum - bNum;
      });

      const apartmentsHtml = floorApartments
        .map((apartment) => {
          const openRequests = getOpenRequests(apartment.id);
          const highestPriorityRequest = getHighestPriorityRequest(apartment.id);
          const isOverdue = isApartmentRentOverdue(apartment.id);

          let typeClass = "none";

          const isRented =
            apartment.leaseStatus !== "vacant" ||
            !!apartment.tenantUserId ||
            !!apartment.tenantNationalId ||
            !!apartment.tenantInfo?.fullName;

          const rentedBadge = isRented
            ? `<span class="apartment-badge rented-badge">مؤجرة</span>`
            : "";

          if (isOverdue) {
            typeClass = "rent-overdue";
          } else if (highestPriorityRequest) {
            typeClass = highestPriorityRequest.typeId;
          }

          let badgesHtml = "";

          if (openRequests.length) {
            badgesHtml = `
              <div class="apartment-badges">
                ${openRequests
                  .map(
                    (req) => `
                      <span class="apartment-badge badge-${req.typeId}">
                        <span class="badge-dot"></span>
                        ${req.typeTitle}
                      </span>
                    `
                  )
                  .join("")}
              </div>
            `;
          }

          return `
            <div class="apartment-card ${typeClass}" data-id="${apartment.id}">
              <div class="apartment-number-row">
                <div class="apartment-number">
                  شقة ${apartment.number}
                </div>
                ${rentedBadge}
              </div>

              <div class="apartment-tenant">
                ${apartment.tenantInfo?.fullName || "بدون مستأجر"}
              </div>

              ${badgesHtml}
            </div>
          `;
        })
        .join("");

      return `
        <div class="floor-section">
          <div class="floor-title">الدور ${floorNumber}</div>

          <div class="floor-apartments">
            ${apartmentsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll(".apartment-card").forEach((card) => {
    card.addEventListener("click", () => {
      const aptId = card.dataset.id;
      window.location.href = `../main/apartment_info.html?id=${encodeURIComponent(aptId)}`;
    });
  });
});