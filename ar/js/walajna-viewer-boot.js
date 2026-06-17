/** Load AR spec from Walajna session/API (skips the manual form). */

(function () {
  "use strict";

  var STORAGE_KEY =
    (window.WalajnaAr && window.WalajnaAr.STORAGE_KEY) || 'cpis360BuildingSpec';

  function queryApartmentId() {
    try {
      var q = new URLSearchParams(window.location.search);
      return q.get('apartmentId') || q.get('id') || null;
    } catch (e) {
      return null;
    }
  }

  function readSessionSpec() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  async function fetchSpecFromApi(apartmentId) {
    if (
      !apartmentId ||
      typeof WalajnaArApi === 'undefined' ||
      !WalajnaArApi.getForApartment ||
      typeof WalajnaAuth === 'undefined' ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return null;
    }
    try {
      if (WalajnaAuth.hydrateSession) {
        await WalajnaAuth.hydrateSession();
      }
      var row = await WalajnaArApi.getForApartment(apartmentId);
      return row && row.spec ? row.spec : null;
    } catch (e) {
      console.warn('[walajna-viewer-boot] API spec load failed', e);
      return null;
    }
  }

  function applyWalajnaChrome(spec) {
    if (!spec || !spec.walajna) return;
    var edit = document.getElementById('btn-edit-building');
    if (edit && spec.walajna.returnUrl) {
      edit.textContent = 'Back to apartment';
      edit.setAttribute('href', spec.walajna.returnUrl);
    }
  }

  function focusWalajnaUnit(spec) {
    if (!spec || !spec.walajna || !window.ViewerAppCore) return;
    var floorNum = Number(spec.walajna.floorNumber);
    var aptNum = parseInt(String(spec.walajna.apartmentNumber || ''), 10);
    var perFloor = Math.max(1, Number(spec.apartments) || 1);
    if (!Number.isFinite(floorNum) || floorNum < 1) return;
    if (!Number.isFinite(aptNum) || aptNum < 1) return;
    var floorIndex = floorNum - 1;
    var aptIndex = Math.max(0, (aptNum - 1) % perFloor);
    window.ViewerAppCore.showBuildingWithWalajnaHighlight(floorIndex, aptIndex);
  }

  async function resolveSpec() {
    var fromSession = readSessionSpec();
    var qid = queryApartmentId();
    if (fromSession) {
      applyWalajnaChrome(fromSession);
      return fromSession;
    }
    if (qid) {
      var fromApi = await fetchSpecFromApi(qid);
      if (fromApi) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromApi));
        applyWalajnaChrome(fromApi);
        return fromApi;
      }
    }
    return null;
  }

  window.WalajnaViewerBoot = {
    resolveSpec: resolveSpec,
    focusWalajnaUnit: focusWalajnaUnit,
    applyWalajnaChrome: applyWalajnaChrome,
  };
})();
