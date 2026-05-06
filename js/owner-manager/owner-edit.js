document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  const TAr = (k, p) =>
    window.walajna_language && window.walajna_language.tAr
      ? window.walajna_language.tAr(k, p)
      : T(k, p);

  const form = document.getElementById("buildingForm");
  const message = document.getElementById("formMessage");
  const buildingCodeInput = document.getElementById("buildingCode");
  const defaultPaymentCycleInput = document.getElementById("defaultPaymentCycle");
  const buildingCitySelect = document.getElementById("building-city");
  const ownerFormTitle = document.getElementById("ownerFormTitle");
  const buildingLatInput = document.getElementById("buildingLat");
  const buildingLngInput = document.getElementById("buildingLng");
  const buildingLocationDisplay = document.getElementById("buildingLocationDisplay");
  const openMapPickerBtn = document.getElementById("openMapPickerBtn");
  const mapModal = document.getElementById("mapModal");
  const closeMapPickerBtn = document.getElementById("closeMapPickerBtn");
  const mapSearchInput = document.getElementById("mapSearchInput");
  const mapSearchBtn = document.getElementById("mapSearchBtn");
  const buildingNeighborhoodInput = document.getElementById("buildingNeighborhood");
  const buildingNeighborhoodReadout = document.getElementById("buildingNeighborhoodReadout");
  const confirmMapLocationBtn = document.getElementById("confirmMapLocationBtn");
  let buildingMap = null;
  let buildingMarker = null;
  /** Pending pin in the modal until user clicks «تأكيد الموقع». */
  let draftMapLatLng = null;
  let draftNeighborhoodHint = "";

  function updateMapConfirmState() {
    if (!confirmMapLocationBtn) return;
    const ok =
      draftMapLatLng &&
      Number.isFinite(draftMapLatLng.lat) &&
      Number.isFinite(draftMapLatLng.lng);
    confirmMapLocationBtn.disabled = !ok;
  }

  function syncMarkerFromSavedForm(mapInstance) {
    if (!mapInstance || typeof L === "undefined") return;
    const lat = parseFloat(buildingLatInput?.value || "");
    const lng = parseFloat(buildingLngInput?.value || "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      if (buildingMarker) {
        try {
          mapInstance.removeLayer(buildingMarker);
        } catch {
          /* ignore */
        }
        buildingMarker = null;
      }
      return;
    }
    const latlng = L.latLng(lat, lng);
    if (buildingMarker) {
      buildingMarker.setLatLng(latlng);
    } else {
      buildingMarker = L.marker(latlng).addTo(mapInstance);
    }
    mapInstance.setView(latlng, 15);
  }

  const NOMINATIM_HEADERS = {
    Accept: "application/json",
    "User-Agent": "WalajnaPropertyManagement/1.0 (local-dev; contact: app-owner)",
  };

  function pickNeighborhoodFromNominatimAddress(addr) {
    if (!addr || typeof addr !== "object") return "";
    const keys = [
      "neighbourhood",
      "suburb",
      "quarter",
      "city_district",
      "district",
      "village",
      "hamlet",
    ];
    for (const k of keys) {
      const v = addr[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function setNeighborhoodFromMap(value, options = {}) {
    const v = String(value || "").trim();
    if (buildingNeighborhoodInput) buildingNeighborhoodInput.value = v;
    if (!buildingNeighborhoodReadout) return;
    if (options.loading) {
      buildingNeighborhoodReadout.textContent = "جاري تحديد الحي من الخريطة…";
      return;
    }
    if (v) {
      buildingNeighborhoodReadout.textContent = `الحي (من الخريطة): ${v}`;
    } else {
      buildingNeighborhoodReadout.textContent =
        "تعذر تحديد اسم الحي من الإحداثيات — جرّب تحريك الدبوس قليلاً أو البحث باسم أدق.";
    }
  }

  async function reverseGeocodeNeighborhood(lat, lng) {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}&accept-language=ar&addressdetails=1`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return "";
    const data = await res.json();
    return pickNeighborhoodFromNominatimAddress(data.address);
  }

  async function applyMapLocation(lat, lng, neighborhoodHint) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setBuildingLocation(lat, lng);
    let nb = neighborhoodHint != null ? String(neighborhoodHint).trim() : "";
    if (!nb) {
      setNeighborhoodFromMap("", { loading: true });
      try {
        nb = await reverseGeocodeNeighborhood(lat, lng);
      } catch (e) {
        console.warn("Reverse geocode failed", e);
        nb = "";
      }
    }
    setNeighborhoodFromMap(nb);
  }

  const params = new URLSearchParams(window.location.search);
  const editBuildingId = params.get("buildingId");
  const pageMode = params.get("mode");
  const isEditMode = pageMode === "edit" && !!editBuildingId;

  if (!form) return;

  await WalajnaAuth.hydrateSession();

  const CITY_KEYS = [
    "owner.city.riyadh",
    "owner.city.jeddah",
    "owner.city.makkah",
    "owner.city.madinah",
    "owner.city.dammam",
    "owner.city.khobar",
    "owner.city.dhahran",
    "owner.city.taif",
    "owner.city.tabuk",
    "owner.city.abha",
    "owner.city.khamis",
    "owner.city.hail",
    "owner.city.buraidah",
    "owner.city.onaizah",
    "owner.city.najran",
    "owner.city.jazan",
    "owner.city.jubail",
    "owner.city.yanbu",
  ];

  function refreshFormChrome() {
    if (ownerFormTitle) {
      ownerFormTitle.textContent = T(
        isEditMode ? "owner.formTitleEdit" : "owner.formTitleAdd"
      );
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = T(
        isEditMode ? "owner.saveEdits" : "owner.saveBuilding"
      );
    }
  }

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function listApartmentsForEdit() {
    if (typeof getApartments === "function") return getApartments();
    return getLocalArray("walajna_apartments");
  }

  function saveLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function generateBuildingCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "BLD-";

    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
  }

  function generateUniqueBuildingCode(buildings) {
    let code;
    do {
      code = generateBuildingCode();
    } while (buildings.some((b) => b.id === code));
    return code;
  }

  function showError(text) {
    if (!message) return;
    message.textContent = text;
    message.style.color = "#dc2626";
  }

  function showSuccess(text) {
    if (!message) return;
    message.textContent = text;
    message.style.color = "#16a34a";
  }

  function populateCities() {
    if (!buildingCitySelect) return;

    const previous = buildingCitySelect.value;
    buildingCitySelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = T("owner.selectCity");
    buildingCitySelect.appendChild(placeholder);

    CITY_KEYS.forEach((key) => {
      const option = document.createElement("option");
      option.value = TAr(key);
      option.textContent = T(key);
      buildingCitySelect.appendChild(option);
    });

    if (previous && [...buildingCitySelect.options].some((o) => o.value === previous)) {
      buildingCitySelect.value = previous;
    }
  }

  function setBuildingLocation(lat, lng) {
    if (!buildingLatInput || !buildingLngInput || !buildingLocationDisplay) return;
    buildingLatInput.value = String(lat);
    buildingLngInput.value = String(lng);
    buildingLocationDisplay.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  function ensureMap() {
    if (!mapModal) return null;
    if (buildingMap) return buildingMap;
    if (typeof L === "undefined") {
      console.warn("Leaflet not loaded; cannot open map picker");
      return null;
    }
    const mapEl = document.getElementById("buildingMap");
    if (!mapEl) return null;
    buildingMap = L.map(mapEl).setView([24.7136, 46.6753], 11); // Default to Riyadh
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(buildingMap);

    buildingMap.on("click", (e) => {
      const { lat, lng } = e.latlng;
      if (buildingMarker) {
        buildingMarker.setLatLng(e.latlng);
      } else {
        buildingMarker = L.marker(e.latlng).addTo(buildingMap);
      }
      draftMapLatLng = { lat, lng };
      draftNeighborhoodHint = "";
      updateMapConfirmState();
    });

    return buildingMap;
  }

  function openMapModal() {
    if (!mapModal) return;
    mapModal.hidden = false;
    draftNeighborhoodHint = "";
    const mapInstance = ensureMap();
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
        syncMarkerFromSavedForm(mapInstance);
        if (buildingMarker) {
          const ll = buildingMarker.getLatLng();
          draftMapLatLng = { lat: ll.lat, lng: ll.lng };
        } else {
          draftMapLatLng = null;
        }
        updateMapConfirmState();
      }, 50);
    }
  }

  function closeMapModal() {
    if (!mapModal) return;
    mapModal.hidden = true;
    draftMapLatLng = null;
    draftNeighborhoodHint = "";
    if (buildingMap) {
      syncMarkerFromSavedForm(buildingMap);
    }
    updateMapConfirmState();
  }

  function fillFormForEdit(building) {
    if (!building) return;

    const buildingNameInput = document.getElementById("buildingName");
    const apartmentCountInput = document.getElementById("apartmentCount");
    const totalFloorsInput = document.getElementById("totalFloors");

    if (apartmentCountInput) {
      apartmentCountInput.value = building.apartmentCount || "";
      apartmentCountInput.disabled = true;
    }

    if (totalFloorsInput) {
      totalFloorsInput.value = building.totalFloors || "";
      totalFloorsInput.disabled = true;
    }

    if (buildingNameInput) {
      buildingNameInput.value = building.name || "";
    }

    if (buildingCodeInput) {
      buildingCodeInput.value = building.id || "";
      buildingCodeInput.readOnly = true;
    }

    if (buildingCitySelect) {
      buildingCitySelect.value = building.city || "";
    }

    const storedNb = String(building.neighborhood || "").trim();
    if (buildingNeighborhoodInput) buildingNeighborhoodInput.value = storedNb;

    const lat = Number(building.latitude);
    const lng = Number(building.longitude);
    if (buildingLatInput && buildingLngInput && buildingLocationDisplay) {
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        buildingLatInput.value = String(lat);
        buildingLngInput.value = String(lng);
        buildingLocationDisplay.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }

    if (buildingNeighborhoodReadout) {
      if (storedNb) {
        buildingNeighborhoodReadout.textContent = `الحي (من الخريطة): ${storedNb}`;
      } else if (Number.isFinite(lat) && Number.isFinite(lng)) {
        buildingNeighborhoodReadout.textContent =
          "اضغط «اختيار من الخريطة» ثم انقر على الموقع لتحديث الحي من الخريطة.";
      } else {
        buildingNeighborhoodReadout.textContent =
          "سيُحدَّد الحي تلقائياً بعد اختيار الموقع على الخريطة.";
      }
    }

    if (defaultPaymentCycleInput) {
      defaultPaymentCycleInput.value =
        building.paymentDefaults?.paymentCycle || "monthly";
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = T("owner.saveEdits");
    }
  }

  function buildApartmentRecord(
    buildingCode,
    buildingName,
    apartmentNumber,
    floorNumber,
    paymentDefaults = {},
    apartmentDefaults = {}
  ) {
    const aptNumber = String(apartmentNumber);

    return {
      id: `${buildingCode}-A${aptNumber}`,
      buildingId: buildingCode,
      buildingName: buildingName,
      number: aptNumber,
      floorNumber: Number(floorNumber) || 1,

      leaseStatus: "vacant",
      status: TAr("finance.vacant"),

      rent: "",
      tenantUserId: null,
      tenantNationalId: null,

      tenantInfo: null,
      contract: null,
      tenantHistory: [],

      bedrooms: apartmentDefaults.bedrooms ?? 0,
      bathrooms: apartmentDefaults.bathrooms ?? 0,
      livingRooms: apartmentDefaults.livingRooms ?? 0,

      paymentDefaults: {
        paymentCycle: paymentDefaults.paymentCycle || "monthly",
      },

      createdAt: new Date().toISOString(),
    };
  }

 function generateApartmentsForBuilding(
  buildingCode,
  buildingName,
  apartmentCount,
  totalFloors,
  apartmentsPerFloor,
  paymentDefaults = {},
  apartmentDefaults = {}
) {
  const generatedApartments = [];
  let currentApartment = 1;

  for (let floor = 1; floor <= totalFloors; floor++) {
    for (let unit = 1; unit <= apartmentsPerFloor; unit++) {
      if (currentApartment > apartmentCount) break;

      generatedApartments.push(
        buildApartmentRecord(
          buildingCode,
          buildingName,
          currentApartment,
          floor,
          paymentDefaults,
          apartmentDefaults
        )
      );

      currentApartment++;
    }

    if (currentApartment > apartmentCount) break;
  }

  return generatedApartments;
}

  populateCities();

  const existingBuildings = getLocalArray("walajna_buildings");
  const buildingToEdit = existingBuildings.find(
    (building) => building.id === editBuildingId
  );

  if (isEditMode) {
    if (!buildingToEdit) {
      showError(T("owner.buildingNotFoundEdit"));
      return;
    }

    fillFormForEdit(buildingToEdit);
  } else {
    if (buildingCodeInput) {
      const newCode = generateUniqueBuildingCode(existingBuildings);
      buildingCodeInput.value = newCode;
      buildingCodeInput.readOnly = true;
    }

    if (defaultPaymentCycleInput && !defaultPaymentCycleInput.value) {
      defaultPaymentCycleInput.value = "monthly";
    }
  }

  if (openMapPickerBtn) {
    openMapPickerBtn.addEventListener("click", openMapModal);
  }
  if (closeMapPickerBtn) {
    closeMapPickerBtn.addEventListener("click", closeMapModal);
  }
  if (confirmMapLocationBtn) {
    confirmMapLocationBtn.addEventListener("click", async () => {
      if (
        !draftMapLatLng ||
        !Number.isFinite(draftMapLatLng.lat) ||
        !Number.isFinite(draftMapLatLng.lng)
      ) {
        showError(T("owner.mapSelectFirst"));
        return;
      }
      await applyMapLocation(
        draftMapLatLng.lat,
        draftMapLatLng.lng,
        draftNeighborhoodHint || undefined
      );
      closeMapModal();
    });
  }
  updateMapConfirmState();
  if (mapSearchBtn && mapSearchInput) {
    mapSearchBtn.addEventListener("click", async () => {
      const query = mapSearchInput.value.trim();
      if (!query) return;
      const mapInstance = ensureMap();
      if (!mapInstance) return;
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=ar&q=" +
          encodeURIComponent(query);
        const res = await fetch(url, { headers: NOMINATIM_HEADERS });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return;
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const latlng = L.latLng(lat, lng);
        mapInstance.setView(latlng, 15);
        if (buildingMarker) {
          buildingMarker.setLatLng(latlng);
        } else {
          buildingMarker = L.marker(latlng).addTo(mapInstance);
        }
        const nbHint = pickNeighborhoodFromNominatimAddress(first.address);
        draftMapLatLng = { lat, lng };
        draftNeighborhoodHint = nbHint || "";
        updateMapConfirmState();
      } catch (err) {
        console.warn("Map search failed", err);
      }
    });

    mapSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        mapSearchBtn.click();
      }
    });
  }

  if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.refreshForSession) {
    try {
      await WalajnaApartmentsApi.refreshForSession();
    } catch (e) {
      console.warn("[owner-edit] apartments cache failed", e);
    }
  }

  refreshFormChrome();
  document.addEventListener("walajna:i18n-applied", () => {
    populateCities();
    refreshFormChrome();
    if (window.walajna_language && window.walajna_language.apply) {
      window.walajna_language.apply(document.body);
    }
  });

  requireAuth();
  requireRole('owner');
  ensureRoleSetup();

  const API_BASE = WalajnaAuth.API_BASE;

  async function syncApartmentsToServer(apartmentsToSync, buildingInfo, ownerId) {
    if (!Number.isFinite(Number(ownerId))) return;

    try {
      const listRes = await WalajnaAuth.fetchWithAuth(`${API_BASE}/api/apartments`, {
        method: "GET",
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
          // Ignore malformed old records.
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
          address: T("linkModal.apiAddress", {
            building: buildingInfo.name,
            apt: apartmentNumber,
          }),
          description: `WALAJNA_META:${JSON.stringify(meta)}`,
          rent: Number(apartment.rent || 0),
        };

        const createRes = await WalajnaAuth.fetchWithAuth(`${API_BASE}/api/apartments`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (createRes.ok) {
          existingKeys.add(dedupeKey);
        }
      }
    } catch (error) {
      console.warn("Could not sync apartments to server", error);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    showError("");

    const buildingName = document.getElementById("buildingName")?.value.trim();
    const buildingCode = document.getElementById("buildingCode")?.value.trim();
    const buildingCity = document.getElementById("building-city")?.value.trim();
    const buildingNeighborhood = document.getElementById("buildingNeighborhood")?.value.trim() || "";
    const buildingLat = parseFloat(buildingLatInput?.value || "");
    const buildingLng = parseFloat(buildingLngInput?.value || "");

    const apartmentCount = parseInt(
      document.getElementById("apartmentCount")?.value,
      10
    );

    const totalFloors = parseInt(
      document.getElementById("totalFloors")?.value,
      10
    );

    const defaultPaymentCycle =
      document.getElementById("defaultPaymentCycle")?.value || "monthly";

    if (!buildingName || !buildingCode || !buildingCity || !apartmentCount || apartmentCount < 1) {
      showError(T("owner.fillBasics"));
      return;
    }

    if (!Number.isFinite(buildingLat) || !Number.isFinite(buildingLng)) {
      showError(T("owner.saveNeedsMapLocation"));
      return;
    }

    if (!totalFloors || totalFloors < 1) {
      showError(T("owner.floorsInvalid"));
      return;
    }

    const apartmentsPerFloor = Math.max(
      1,
      Math.ceil(apartmentCount / totalFloors)
    );

    if (!defaultPaymentCycle) {
      showError(T("owner.pickPaymentCycle"));
      return;
    }

    const buildings = getLocalArray("walajna_buildings");
    const apartments = listApartmentsForEdit();

    const normalizeLower = (value) => String(value || "").trim().toLowerCase();

    const buildingExists = buildings.some((b) => {
      const existingCode = normalizeLower(b.code || b.id);
      const currentCode = normalizeLower(buildingCode);

      if (isEditMode) {
        return (
          existingCode === currentCode &&
          b.id !== editBuildingId
        );
      }

      return existingCode === currentCode;
    });

    if (buildingExists) {
      showError(T("owner.codeUsed"));
      return;
    }

    const currentUser =
      typeof WalajnaAuth !== "undefined" && WalajnaAuth.getCurrentUser
        ? WalajnaAuth.getCurrentUser()
        : JSON.parse(localStorage.getItem("walajna_current_user") || "null");

    const paymentDefaults = {
      paymentCycle: defaultPaymentCycle,
    };

    const apartmentDefaults = isEditMode && buildingToEdit?.apartmentDefaults
      ? {
          bedrooms: buildingToEdit.apartmentDefaults.bedrooms ?? 0,
          bathrooms: buildingToEdit.apartmentDefaults.bathrooms ?? 0,
          livingRooms: buildingToEdit.apartmentDefaults.livingRooms ?? 0,
        }
      : { bedrooms: 0, bathrooms: 0, livingRooms: 0 };

    const buildingPayload = {
      id: buildingCode,
      name: buildingName,
      city: buildingCity,
      neighborhood: buildingNeighborhood || null,
      apartmentCount,
      totalFloors,
      apartmentsPerFloor,
      paymentDefaults,
      apartmentDefaults,
      ownerId: currentUser?.id || null,
      createdAt: isEditMode
        ? (buildingToEdit?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
    };

    buildingPayload.latitude = buildingLat;
    buildingPayload.longitude = buildingLng;

    const payload = {
      name: buildingName,
      city: buildingCity,
      code: buildingCode,
      total_floors: totalFloors,
      apartments_count: apartmentCount,
      apartments_per_floor: apartmentsPerFloor,
      apartment_defaults: apartmentDefaults,
      payment_defaults: paymentDefaults,
    };

    payload.latitude = buildingLat;
    payload.longitude = buildingLng;
    if (buildingNeighborhood) {
      payload.neighborhood = buildingNeighborhood;
    }

    const buildingApiId = isEditMode ? (buildingToEdit?.id || editBuildingId) : null;
    const endpoint = isEditMode
      ? `${API_BASE}/api/buildings/${buildingApiId}`
      : `${API_BASE}/api/buildings`;

    try {
      const apiResponse = await WalajnaAuth.fetchWithAuth(endpoint, {
        method: isEditMode ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      if (apiResponse.ok) {
        const serverRecord = await apiResponse.json();
        if (!isEditMode) {
          buildingPayload.id = serverRecord.id;
        }
        showSuccess(
          isEditMode ? T("owner.updatedBuilding") : T("owner.savedBuilding")
        );
      } else {
        const rawBody = await apiResponse.text().catch(() => "");
        let err = {};
        try {
          err = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          err = {};
        }
        console.warn("Building API response error", {
          status: apiResponse.status,
          statusText: apiResponse.statusText,
          err,
          rawBody,
        });
        showError(T("owner.serverErrorLocal"));
        return;
      }
    } catch (ex) {
      console.warn("Buildings API error", ex);
      showError(T("owner.serverUnreachable"));
      return;
    }

    if (isEditMode) {
      const updatedBuildings = buildings.map((building) =>
        building.id === editBuildingId ? buildingPayload : building
      );

      const updatedApartments = apartments.map((apartment) => {
        if (apartment.buildingId !== editBuildingId) return apartment;

        return {
          ...apartment,
          buildingName: buildingName,
          paymentDefaults: {
            ...apartment.paymentDefaults,
            paymentCycle: defaultPaymentCycle,
          },
        };
      });

      saveLocalArray("walajna_buildings", updatedBuildings);
      if (typeof saveApartments === "function") {
        saveApartments(updatedApartments);
      } else {
        saveLocalArray("walajna_apartments", updatedApartments);
      }
    } else {
      const apartmentBuildingId = buildingPayload.id;

      const newApartments = generateApartmentsForBuilding(
        apartmentBuildingId,
        buildingName,
        apartmentCount,
        totalFloors,
        apartmentsPerFloor,
        paymentDefaults,
        apartmentDefaults
      );

      buildings.push(buildingPayload);
      apartments.push(...newApartments);

      saveLocalArray("walajna_buildings", buildings);
      if (typeof saveApartments === "function") {
        saveApartments(apartments);
      } else {
        saveLocalArray("walajna_apartments", apartments);
      }

      // Backend create-building already seeds apartments.
      // Keep local state for rendering, but do not re-insert apartments via /api/apartments.

      form.reset();
      if (buildingCodeInput) {
        buildingCodeInput.value = generateUniqueBuildingCode(buildings);
        buildingCodeInput.readOnly = true;
      }
      if (defaultPaymentCycleInput) {
        defaultPaymentCycleInput.value = "monthly";
      }
      if (buildingCitySelect) {
        buildingCitySelect.value = "";
      }
      if (buildingNeighborhoodInput) buildingNeighborhoodInput.value = "";
      if (buildingNeighborhoodReadout) {
        buildingNeighborhoodReadout.textContent =
          "سيُحدَّد الحي تلقائياً بعد اختيار الموقع على الخريطة.";
      }
    }

    setTimeout(() => {
      window.location.href = "owner_home.html";
    }, 900);
  });
});