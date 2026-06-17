/** Form submit → sessionStorage → viewer. */

(function () {
  'use strict';

  var STORAGE_KEY = 'cpis360BuildingSpec';

  function start() {
    window.Ui.bindForm(function (spec) {
      try {
        spec.useFixedApartmentTemplate = true;
        spec.previewCutaway = true;
        spec.previewCube = true;
        spec.floors = Math.max(1, spec.floors || 1);
        spec.apartments = Math.max(1, spec.apartments || 1);
        delete spec.apartmentLayout;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
      } catch (e) {
        window.Ui.setMessage('Could not save your inputs. Allow site storage or try another browser.');
        return;
      }
      window.location.href = 'viewer.html';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
