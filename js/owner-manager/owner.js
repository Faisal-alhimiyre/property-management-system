document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");
  const globalRequestsAlert = document.getElementById("globalRequestsAlert");

  if (!container) return;

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function setLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem("walajna_current_user") || "null");
    } catch {
      return null;
    }
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

  function getOpenRequests(apartmentId, allRequests) {
    return allRequests.filter(
      (request) =>
        request.apartmentId === apartmentId &&
        request.status !== "resolved"
    );
  }

  function getHighestPriorityRequest(apartmentId, allRequests) {
    const openRequests = getOpenRequests(apartmentId, allRequests);

    if (!openRequests.length) return null;

    return [...openRequests].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartmentId, allPayments) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allPayments.some((payment) => {
      if (payment.apartmentId !== apartmentId) return false;
      if (payment.status === "paid") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      return dueDate < today;
    });
  }

  function getApartmentStatusClass(apartment, allRequests, allPayments) {
    if (isApartmentRentOverdue(apartment.id, allPayments)) {
      return "rent-overdue";
    }

    const highestPriorityRequest = getHighestPriorityRequest(
      apartment.id,
      allRequests
    );

    if (!highestPriorityRequest) {
      return "none";
    }

    return highestPriorityRequest.typeId;
  }

  function isApartmentRented(apartment) {
    return (
      apartment.leaseStatus !== "vacant" ||
      !!apartment.tenantUserId ||
      !!apartment.tenantNationalId ||
      !!apartment.tenantInfo?.fullName
    );
  }

  function editBuilding(buildingId) {
    window.location.href = `../owners/owner_edit.html?buildingId=${encodeURIComponent(
      buildingId
    )}&mode=edit`;
  }

  function deleteBuilding(buildingId) {
    const confirmed = confirm(
      "هل أنت متأكد من حذف العمارة؟ سيتم حذف جميع الشقق والبيانات المرتبطة بها."
    );
    if (!confirmed) return;

    const allBuildings = getLocalArray("walajna_buildings");
    const allApartments = getLocalArray("walajna_apartments");
    const allRequests = getLocalArray("walajna_requests");
    const allPayments = getLocalArray("walajna_payments");
    const allCosts = getLocalArray("walajna_costs");
    const allDocuments = getLocalArray("walajna_documents");

    const buildingApartments = allApartments.filter(
      (apartment) => apartment.buildingId === buildingId
    );

    const apartmentIds = buildingApartments.map((apartment) => apartment.id);

    const updatedBuildings = allBuildings.filter(
      (building) => building.id !== buildingId
    );

    const updatedApartments = allApartments.filter(
      (apartment) => apartment.buildingId !== buildingId
    );

    const updatedRequests = allRequests.filter(
      (request) => !apartmentIds.includes(request.apartmentId)
    );

    const updatedPayments = allPayments.filter(
      (payment) => !apartmentIds.includes(payment.apartmentId)
    );

    const updatedCosts = allCosts.filter(
      (cost) => !apartmentIds.includes(cost.apartmentId)
    );

    const updatedDocuments = allDocuments.filter(
      (document) => !apartmentIds.includes(document.apartmentId)
    );

    localStorage.setItem("walajna_buildings", JSON.stringify(updatedBuildings));
    localStorage.setItem("walajna_apartments", JSON.stringify(updatedApartments));
    localStorage.setItem("walajna_requests", JSON.stringify(updatedRequests));
    localStorage.setItem("walajna_payments", JSON.stringify(updatedPayments));
    localStorage.setItem("walajna_costs", JSON.stringify(updatedCosts));
    localStorage.setItem("walajna_documents", JSON.stringify(updatedDocuments));

    alert("تم حذف العمارة بنجاح");
    window.location.reload();
  }

  function closeAllBuildingMenus() {
    document.querySelectorAll(".building-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });
  }

  function getApartmentIdsForBuilding(buildingId, allApartments) {
    return allApartments
      .filter((apartment) => apartment.buildingId === buildingId)
      .map((apartment) => apartment.id);
  }

  function isRequestNewForOwner(request) {
    return request.status === "new" && request.ownerSeen !== true;
  }

  function getNewRequestsForBuilding(buildingId, allApartments, allRequests) {
    const buildingApartmentIds = getApartmentIdsForBuilding(buildingId, allApartments);

    return allRequests.filter(
      (request) =>
        buildingApartmentIds.includes(request.apartmentId) &&
        isRequestNewForOwner(request)
    );
  }

  function getNewRequestsCountForBuilding(buildingId, allApartments, allRequests) {
    return getNewRequestsForBuilding(buildingId, allApartments, allRequests).length;
  }

  function markBuildingRequestsAsSeen(buildingId, allApartments) {
    const requests = getLocalArray("walajna_requests");
    const buildingApartmentIds = getApartmentIdsForBuilding(buildingId, allApartments);

    const updatedRequests = requests.map((request) => {
      if (
        buildingApartmentIds.includes(request.apartmentId) &&
        request.status === "new" &&
        request.ownerSeen !== true
      ) {
        return {
          ...request,
          ownerSeen: true,
          ownerSeenAt: new Date().toISOString(),
        };
      }

      return request;
    });

    setLocalArray("walajna_requests", updatedRequests);
  }

  const currentUser = getCurrentUser();
  const allBuildings = getLocalArray("walajna_buildings");
  const apartments = getLocalArray("walajna_apartments");
  const requests = getLocalArray("walajna_requests");
  const payments = getLocalArray("walajna_payments");

  if (!currentUser) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لم يتم العثور على المستخدم الحالي";
    }
    return;
  }

  const buildings = allBuildings
    .filter((building) => building.ownerId === currentUser.id)
    .sort((a, b) => {
      const aNewCount = getNewRequestsCountForBuilding(a.id, apartments, requests);
      const bNewCount = getNewRequestsCountForBuilding(b.id, apartments, requests);

      if (bNewCount !== aNewCount) {
        return bNewCount - aNewCount;
      }

      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  if (!buildings.length) {
    if (emptyState) {
      emptyState.style.display = "block";
      emptyState.textContent = "لا توجد عمائر مرتبطة بهذا المالك";
    }
    return;
  }

  const totalNewRequests = buildings.reduce((sum, building) => {
    return sum + getNewRequestsCountForBuilding(building.id, apartments, requests);
  }, 0);

  if (globalRequestsAlert) {
    if (totalNewRequests > 0) {
      globalRequestsAlert.innerHTML = `يوجد ${totalNewRequests} طلبات جديدة`;
      globalRequestsAlert.style.display = "flex";
    } else {
      globalRequestsAlert.style.display = "none";
    }
  }

  container.innerHTML = buildings
    .map((building) => {
      const buildingApartments = apartments.filter(
        (apartment) => apartment.buildingId === building.id
      );

      const newRequestsCount = getNewRequestsCountForBuilding(
        building.id,
        apartments,
        requests
      );

      const squaresHtml = buildingApartments
        .map((apartment) => {
          const typeClass = getApartmentStatusClass(
            apartment,
            requests,
            payments
          );

          const rentedClass =
            isApartmentRented(apartment) && typeClass === "none"
              ? "rented"
              : "";

          return `
            <div
              class="apartment-square ${typeClass} ${rentedClass}"
              title="شقة ${apartment.number}">
            </div>
          `;
        })
        .join("");

      return `
        <article
          class="building-card ${newRequestsCount > 0 ? "has-notifications" : ""}"
          data-building-id="${building.id}"
        >
          ${
            newRequestsCount > 0
              ? `
                <span class="building-notification-badge">${newRequestsCount}</span>
              `
              : ""
          }

          <div class="building-menu-wrap">
            <button
              type="button"
              class="building-more-btn"
              data-menu-btn="true"
              data-building-id="${building.id}"
              aria-label="خيارات العمارة"
            >
              ⋮
            </button>

            <div class="building-card-menu" data-menu="${building.id}">
              <button
                type="button"
                data-action="edit-building"
                data-building-id="${building.id}"
              >
                تعديل
              </button>

              <button
                type="button"
                class="danger"
                data-action="delete-building"
                data-building-id="${building.id}"
              >
                حذف
              </button>
            </div>
          </div>

          <div class="building-card__head">
            <h3 class="building-title">${building.name}</h3>
            <span class="building-count">${buildingApartments.length} شقة</span>
          </div>

          <div class="apartments-grid">
            ${squaresHtml}
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-menu-btn]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      const menu = document.querySelector(`[data-menu="${buildingId}"]`);
      const isOpen = menu?.classList.contains("is-open");

      closeAllBuildingMenus();

      if (menu && !isOpen) {
        menu.classList.add("is-open");
      }
    });
  });

  document.querySelectorAll('[data-action="edit-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      editBuilding(buildingId);
    });
  });

  document.querySelectorAll('[data-action="delete-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      deleteBuilding(buildingId);
    });
  });

  document.querySelectorAll(".building-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest(".building-menu-wrap")) return;

      const buildingId = card.dataset.buildingId;

      markBuildingRequestsAsSeen(buildingId, apartments);

      window.location.href = `owner_building.html?buildingId=${encodeURIComponent(
        buildingId
      )}`;
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".building-menu-wrap")) {
      closeAllBuildingMenus();
    }
  });
});