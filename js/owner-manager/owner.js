document.addEventListener("DOMContentLoaded", async () => {
  requireAuth();
  requireRole('owner');
  ensureRoleSetup();

  const container = document.getElementById("buildingsContainer");
  const emptyState = document.getElementById("emptyState");
  const globalRequestsAlert = document.getElementById("globalRequestsAlert");

  async function getServerBuildings() {
    try {
      const response = await fetch(`${WalajnaAuth.API_BASE}/api/buildings`, {
        headers: WalajnaAuth.getAuthHeaders()
      });
      if (response.ok) {
        const serverBuildings = await response.json();
        const localBuildings = getLocalArray("walajna_buildings");

        // Normalize snake_case (API) and camelCase (local) into one shape used by the dashboard.
        const normalized = serverBuildings.map((building) => {
          const localMatch = localBuildings.find(
            (item) => String(item.id) === String(building.id)
          );

          return {
            ...localMatch,
            ...building,
            ownerId: building.ownerId ?? building.owner_id ?? localMatch?.ownerId ?? null,
            createdAt: building.createdAt ?? building.created_at ?? localMatch?.createdAt ?? null,
            apartmentCount:
              building.apartmentCount ?? building.apartments_count ?? localMatch?.apartmentCount ?? 0,
            totalFloors:
              building.totalFloors ?? building.total_floors ?? localMatch?.totalFloors ?? null,
            id: building.id,
            name: building.name,
            city: building.city,
            code: building.code ?? localMatch?.code ?? null,
          };
        });

        setLocalArray("walajna_buildings", normalized);
        return normalized;
      }
    } catch (e) {
      console.warn("Could not fetch server buildings", e);
    }
    return getLocalArray("walajna_buildings");
  }

  async function ensureServerApartmentsSeeded(buildings) {
    for (const building of buildings) {
      try {
        await fetch(`${WalajnaAuth.API_BASE}/api/buildings/${building.id}/seed-apartments`, {
          method: "POST",
          headers: WalajnaAuth.getAuthHeaders(),
        });
      } catch (error) {
        console.warn("Could not seed server apartments for building", building.id, error);
      }
    }
  }


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

  async function syncApartmentsToServer(apartmentsToSync, buildingInfo, ownerId) {
    if (!Number.isFinite(Number(ownerId))) return;

    try {
      const listRes = await fetch(`${WalajnaAuth.API_BASE}/api/apartments`, {
        headers: WalajnaAuth.getAuthHeaders(),
      });

      const existing = listRes.ok ? await listRes.json() : [];
      const existingKeys = new Set();

      existing.forEach((apt) => {
        const description = String(apt.description || "");
        if (!description.startsWith("WALAJNA_META:")) return;

        const metaRaw = description.replace("WALAJNA_META:", "");
        try {
          const meta = JSON.parse(metaRaw);
          existingKeys.add(`${String(meta.buildingId)}:${String(meta.apartmentNumber)}`);
        } catch {
          // Ignore malformed records.
        }
      });

      for (const apartment of apartmentsToSync) {
        const apartmentNumber = String(apartment.number || apartment.id || "");
        const dedupeKey = `${String(buildingInfo.id)}:${apartmentNumber}`;
        if (existingKeys.has(dedupeKey)) continue;

        const meta = {
          buildingId: String(buildingInfo.id),
          buildingCode: buildingInfo.code || null,
          apartmentNumber,
          floorNumber: Number(apartment.floorNumber || 1),
        };

        const payload = {
          owner_id: Number(ownerId),
          address: `${buildingInfo.name} - شقة ${apartmentNumber}`,
          description: `WALAJNA_META:${JSON.stringify(meta)}`,
          rent: Number(apartment.rent || 0),
        };

        const createRes = await fetch(`${WalajnaAuth.API_BASE}/api/apartments`, {
          method: "POST",
          headers: WalajnaAuth.getAuthHeaders(),
          body: JSON.stringify(payload),
        });

        if (createRes.ok) {
          existingKeys.add(dedupeKey);
        }
      }
    } catch (error) {
      console.warn("Could not sync backfilled apartments to server", error);
    }
  }

  async function syncAllLocalApartmentsToServer(buildings, allApartments, ownerId) {
    for (const building of buildings) {
      const buildingApartments = getApartmentsForBuilding(building.id, allApartments);
      if (!buildingApartments.length) continue;
      await syncApartmentsToServer(buildingApartments, building, ownerId);
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

  function getApartmentCurrentContractId(apartment) {
    if (!apartment) return null;

    return (
      apartment.currentContractId ||
      apartment.contractId ||
      apartment.contract?.id ||
      null
    );
  }

  function isApartmentOccupied(apartment) {
    return !!(
      apartment?.tenantUserId ||
      apartment?.tenantNationalId ||
      apartment?.tenantInfo?.fullName ||
      apartment?.tenantInfo?.phoneNumber ||
      apartment?.tenantInfo?.nationality ||
      apartment?.tenantInfo?.tenantType ||
      apartment?.currentContractId ||
      apartment?.contractId ||
      apartment?.contract?.id ||
      apartment?.contract?.startDate ||
      apartment?.contract?.endDate ||
      apartment?.contract?.rentAmount ||
      apartment?.contract?.paymentCycle ||
      apartment?.contract?.meterNumber
    );
  }

  function getOpenRequests(apartment, allRequests) {
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!currentContractId) {
      return [];
    }

    return allRequests.filter(
      (request) =>
        request.contractId === currentContractId &&
        request.status !== "resolved"
    );
  }

  function getHighestPriorityRequest(apartment, allRequests) {
    const openRequests = getOpenRequests(apartment, allRequests);

    if (!openRequests.length) return null;

    return [...openRequests].sort(
      (a, b) => getRequestPriority(a.typeId) - getRequestPriority(b.typeId)
    )[0];
  }

  function isApartmentRentOverdue(apartment, allPayments) {
    const currentContractId = getApartmentCurrentContractId(apartment);

    if (!currentContractId) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allPayments.some((payment) => {
      if (payment.contractId !== currentContractId) return false;
      if (payment.status === "paid" || payment.status === "cancelled") return false;
      if (!payment.dueDate) return false;

      const dueDate = new Date(payment.dueDate);
      if (Number.isNaN(dueDate.getTime())) return false;

      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });
  }

  function getApartmentStatusClass(apartment, allRequests, allPayments) {
    if (!isApartmentOccupied(apartment)) {
      return "none";
    }

    if (isApartmentRentOverdue(apartment, allPayments)) {
      return "rent-overdue";
    }

    const highestPriorityRequest = getHighestPriorityRequest(apartment, allRequests);

    if (!highestPriorityRequest) {
      return "none";
    }

    return highestPriorityRequest.typeId;
  }

  function isApartmentRented(apartment) {
    return isApartmentOccupied(apartment);
  }

  function editBuilding(buildingId) {
    window.location.href = `owner_edit.html?buildingId=${encodeURIComponent(
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

    setLocalArray("walajna_buildings", updatedBuildings);
    setLocalArray("walajna_apartments", updatedApartments);
    setLocalArray("walajna_requests", updatedRequests);
    setLocalArray("walajna_payments", updatedPayments);
    setLocalArray("walajna_costs", updatedCosts);
    setLocalArray("walajna_documents", updatedDocuments);

    alert("تم حذف العمارة بنجاح");
    window.location.reload();
  }

  function isBuildingPinned(building) {
    return !!building?.isPinned;
  }

  function toggleBuildingPin(buildingId) {
    const allBuildings = getLocalArray("walajna_buildings");

    const updatedBuildings = allBuildings.map((building) => {
      if (building.id !== buildingId) return building;

      const nextPinnedState = !building.isPinned;

      return {
        ...building,
        isPinned: nextPinnedState,
        pinnedAt: nextPinnedState ? new Date().toISOString() : null,
      };
    });

    setLocalArray("walajna_buildings", updatedBuildings);
    window.location.reload();
  }

  function closeAllBuildingMenus() {
    document.querySelectorAll(".building-card-menu").forEach((menu) => {
      menu.classList.remove("is-open");
    });
  }

  function getApartmentsForBuilding(buildingId, allApartments) {
    const target = String(buildingId);
    const building = allBuildings.find((item) => String(item.id) === target);
    const buildingCode = building?.code ? String(building.code) : null;

    // Support both old local linkage (building code) and new linkage (building numeric id).
    return allApartments.filter((apartment) => {
      const apartmentBuildingId = String(apartment.buildingId ?? "");
      return apartmentBuildingId === target || (buildingCode && apartmentBuildingId === buildingCode);
    });
  }

  function buildGeneratedApartment(building, apartmentNumber, floorNumber) {
    return {
      id: `${building.id}-A${apartmentNumber}`,
      buildingId: String(building.id),
      buildingName: building.name,
      number: String(apartmentNumber),
      floorNumber: Number(floorNumber) || 1,
      leaseStatus: "vacant",
      status: "فارغة",
      rent: "",
      tenantUserId: null,
      tenantNationalId: null,
      tenantInfo: null,
      contract: null,
      tenantHistory: [],
      createdAt: new Date().toISOString(),
    };
  }

  async function backfillMissingApartmentsFromBuildings(buildings, allApartments, ownerId) {
    const generated = [];

    buildings.forEach((building) => {
      const existing = getApartmentsForBuilding(building.id, allApartments);
      if (existing.length > 0) return;

      const apartmentCount = Number(building.apartmentCount ?? building.apartments_count ?? 0);
      const totalFloors = Number(building.totalFloors ?? building.total_floors ?? 0);

      if (!apartmentCount || apartmentCount < 1 || !totalFloors || totalFloors < 1) return;

      const apartmentsPerFloor = Math.ceil(apartmentCount / totalFloors);
      let currentApartment = 1;

      for (let floor = 1; floor <= totalFloors; floor++) {
        for (let unit = 1; unit <= apartmentsPerFloor; unit++) {
          if (currentApartment > apartmentCount) break;
          generated.push(buildGeneratedApartment(building, currentApartment, floor));
          currentApartment += 1;
        }
      }
    });

    if (generated.length > 0) {
      const merged = [...allApartments, ...generated];
      setLocalArray("walajna_apartments", merged);

      return merged;
    }

    return allApartments;
  }

  function isRequestNewForOwner(request) {
    return request.status === "new" && request.ownerSeen !== true;
  }

  function getNewRequestsForBuilding(buildingId, allApartments, allRequests) {
    const buildingApartments = getApartmentsForBuilding(buildingId, allApartments);

    return allRequests.filter((request) => {
      if (!isRequestNewForOwner(request)) return false;

      return buildingApartments.some((apartment) => {
        const currentContractId = getApartmentCurrentContractId(apartment);
        return currentContractId && request.contractId === currentContractId;
      });
    });
  }

  function getNewRequestsCountForBuilding(buildingId, allApartments, allRequests) {
    return getNewRequestsForBuilding(buildingId, allApartments, allRequests).length;
  }

  function markBuildingRequestsAsSeen(buildingId, allApartments) {
    const requests = getLocalArray("walajna_requests");
    const buildingApartments = getApartmentsForBuilding(buildingId, allApartments);

    const currentContractIds = buildingApartments
      .map((apartment) => getApartmentCurrentContractId(apartment))
      .filter(Boolean);

    const updatedRequests = requests.map((request) => {
      if (
        currentContractIds.includes(request.contractId) &&
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

  function getBuildingSizeClass(apartmentCount) {
    if (apartmentCount > 16) return "size-large";
    if (apartmentCount > 8) return "size-medium";
    return "size-small";
  }

  const currentUser = getCurrentUser();
  const allBuildings = await getServerBuildings();
  let apartments = getLocalArray("walajna_apartments");
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
    .filter(
      (building) => String(building.ownerId ?? building.owner_id ?? "") === String(currentUser.id)
    )
    .sort((a, b) => {
      const aPinned = !!a.isPinned;
      const bPinned = !!b.isPinned;

      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      if (aPinned && bPinned) {
        const pinnedCompare = (b.pinnedAt || "").localeCompare(a.pinnedAt || "");
        if (pinnedCompare !== 0) return pinnedCompare;
      }

      const aNewCount = getNewRequestsCountForBuilding(a.id, apartments, requests);
      const bNewCount = getNewRequestsCountForBuilding(b.id, apartments, requests);

      if (bNewCount !== aNewCount) {
        return bNewCount - aNewCount;
      }

      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  apartments = await backfillMissingApartmentsFromBuildings(buildings, apartments, currentUser.id);

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
      const buildingApartments = getApartmentsForBuilding(building.id, apartments);

      const newRequestsCount = getNewRequestsCountForBuilding(
        building.id,
        apartments,
        requests
      );

      const sizeClass = getBuildingSizeClass(buildingApartments.length);

      const floorsMap = new Map();

      buildingApartments.forEach((apartment) => {
        const floorNumber = Number(apartment.floorNumber || 0);

        if (!floorsMap.has(floorNumber)) {
          floorsMap.set(floorNumber, []);
        }

        floorsMap.get(floorNumber).push(apartment);
      });

      const sortedFloorNumbers = [...floorsMap.keys()].sort((a, b) => b - a);

      const squaresHtml = sortedFloorNumbers
        .map((floorNumber) => {
          const floorApartments = floorsMap.get(floorNumber) || [];

          const sortedFloorApartments = floorApartments.sort((a, b) => {
            const aNum = Number(a.number || 0);
            const bNum = Number(b.number || 0);
            return aNum - bNum;
          });
           const isWide = sortedFloorApartments.length >= 6;
          const floorSquares = sortedFloorApartments
            .map((apartment) => {
              const typeClass = getApartmentStatusClass(apartment, requests, payments);

              const rentedClass =
                isApartmentRented(apartment) && typeClass === "none"
                  ? "rented"
                  : "";

              return `
                <div
                  class="apartment-square ${typeClass} ${rentedClass}"
                  title="شقة ${apartment.number} - الدور ${floorNumber}">
                </div>
              `;
            })
            .join("");
return `
  <div class="apartment-floor ${isWide ? "wide-floor" : ""}" data-floor="${floorNumber}">
    ${floorSquares}
  </div>
`;
        })
        .join("");

      return `
        <article
          class="building-card ${sizeClass} ${newRequestsCount > 0 ? "has-notifications" : ""} ${isBuildingPinned(building) ? "is-pinned" : ""}"
          data-building-id="${building.id}"
        >
          ${
            newRequestsCount > 0
              ? `<span class="building-notification-badge">${newRequestsCount}</span>`
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
                data-action="toggle-pin-building"
                data-building-id="${building.id}"
              >
                ${building.isPinned ? "إلغاء التثبيت" : "تثبيت العمارة"}
              </button>

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
            <h3 class="building-title">${building.isPinned ? "📌 " : ""}${building.name}</h3>
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

  document.querySelectorAll('[data-action="toggle-pin-building"]').forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const buildingId = btn.dataset.buildingId;
      closeAllBuildingMenus();
      toggleBuildingPin(buildingId);
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