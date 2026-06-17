/**
 * Build CPIS AR spec from Walajna apartment + building data; open 3D viewer.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "cpis360BuildingSpec";
  var DEFAULT_WIDTH = 20;
  var DEFAULT_DEPTH = 20;
  var DEFAULT_CEILING = 3;
  var DEFAULT_KITCHENS = 1;

  function toInt(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }

  function buildSpec(apartmentData, buildingData) {
    if (!apartmentData) return null;

    var floors = toInt(
      buildingData?.totalFloors ?? buildingData?.total_floors,
      0
    );
    var apartmentsPerFloor = toInt(
      buildingData?.apartments_per_floor ?? buildingData?.apartmentsPerFloor,
      0
    );
    var aptCount = toInt(
      buildingData?.apartmentCount ?? buildingData?.apartments_count,
      0
    );

    if (floors < 1) {
      floors = Math.max(1, toInt(apartmentData.floorNumber, 1));
    }
    if (apartmentsPerFloor < 1 && aptCount > 0 && floors > 0) {
      apartmentsPerFloor = Math.ceil(aptCount / floors);
    }
    if (apartmentsPerFloor < 1) {
      apartmentsPerFloor = 1;
    }

    var bedrooms = Math.max(0, toInt(apartmentData.bedrooms, 0));
    var bathrooms = Math.max(0, toInt(apartmentData.bathrooms, 0));
    var livingRooms = Math.max(1, toInt(apartmentData.livingRooms, 1));

    var serverAptId =
      apartmentData.apiId != null ? apartmentData.apiId : apartmentData.id;

    return {
      width: DEFAULT_WIDTH,
      depth: DEFAULT_DEPTH,
      height: Math.max(0.5, floors * DEFAULT_CEILING),
      floors: floors,
      ceiling: DEFAULT_CEILING,
      apartments: apartmentsPerFloor,
      facadeColor: "#b8b8b8",
      apartment: {
        bedrooms: bedrooms,
        kitchens: DEFAULT_KITCHENS,
        bathrooms: bathrooms,
        hallways: 0,
        livingRooms: livingRooms,
      },
      useFixedApartmentTemplate: true,
      previewCutaway: true,
      previewCube: true,
      walajna: {
        apartmentId: serverAptId != null ? String(serverAptId) : null,
        buildingId:
          apartmentData.buildingId != null
            ? String(apartmentData.buildingId)
            : null,
        apartmentNumber:
          apartmentData.number != null ? String(apartmentData.number) : null,
        floorNumber:
          apartmentData.floorNumber != null
            ? Number(apartmentData.floorNumber)
            : null,
        returnUrl: window.location.pathname + window.location.search,
      },
    };
  }

  function validateSpecForViewer(spec) {
    if (window.Ui && typeof window.Ui.validateSpec === "function") {
      return window.Ui.validateSpec(spec);
    }
    if (!spec || !(spec.floors >= 1) || !(spec.apartments >= 1)) {
      return "Building floors and apartments are required.";
    }
    return null;
  }

  function persistSessionSpec(spec) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
  }

  function viewerUrl(apartmentId) {
    var base = "../ar/html/viewer.html";
    if (apartmentId != null && String(apartmentId).trim() !== "") {
      return (
        base + "?apartmentId=" + encodeURIComponent(String(apartmentId))
      );
    }
    return base;
  }

  async function openViewer(apartmentData, buildingData, options) {
    options = options || {};
    var spec = buildSpec(apartmentData, buildingData);
    if (!spec) {
      throw new Error("missing apartment data");
    }
    var err = validateSpecForViewer(spec);
    if (err) {
      throw new Error(err);
    }

    persistSessionSpec(spec);

    var serverAptId =
      apartmentData.apiId != null ? apartmentData.apiId : apartmentData.id;

    if (
      options.saveToServer !== false &&
      typeof WalajnaArApi !== "undefined" &&
      WalajnaArApi.saveForApartment &&
      typeof WalajnaAuth !== "undefined" &&
      WalajnaAuth.fetchWithAuth &&
      serverAptId != null
    ) {
      try {
        await WalajnaArApi.saveForApartment(serverAptId, {
          spec: spec,
          focus_apartment_number: spec.walajna.apartmentNumber,
          focus_floor_number: spec.walajna.floorNumber,
        });
      } catch (e) {
        console.warn("[WalajnaAr] save layout failed (opening viewer anyway)", e);
        if (options.requireSave) throw e;
      }
    }

    window.location.href = viewerUrl(serverAptId);
  }

  window.WalajnaAr = {
    STORAGE_KEY: STORAGE_KEY,
    buildSpec: buildSpec,
    openViewer: openViewer,
    persistSessionSpec: persistSessionSpec,
    viewerUrl: viewerUrl,
  };
})();
