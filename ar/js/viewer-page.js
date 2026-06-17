/** Viewer bootstrap. */

(function () {
  'use strict';

  var STORAGE_KEY = 'cpis360BuildingSpec';

  function setError(msg) {
    var el = document.getElementById('viewer-error');
    if (el) el.textContent = msg || '';
  }

  function start() {
    var boot = window.WalajnaViewerBoot;
    var loadPromise =
      boot && boot.resolveSpec
        ? boot.resolveSpec()
        : Promise.resolve(readLegacySpec());

    loadPromise.then(function (spec) {
      if (!spec) {
        setError('No apartment layout data. Open 3D preview from the apartment page in Walajna.');
        return;
      }
      runViewer(spec);
    });
  }

  function readLegacySpec() {
    var raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function runViewer(spec) {

    if (window.Ui) {
      var err = window.Ui.validateSpec(spec);
      if (err) {
        setError(err);
        return;
      }
    }

    spec.floors = Math.max(1, spec.floors || 1);
    spec.apartments = Math.max(1, spec.apartments || 1);
    if (spec.apartment) {
      if (!spec.apartment.livingRooms && spec.apartment.livingRooms !== 0) {
        spec.apartment.livingRooms = spec.apartment.hallways > 0 ? spec.apartment.hallways : 1;
      }
      if (!spec.apartment.kitchens && spec.apartment.kitchens !== 0) {
        spec.apartment.kitchens = 1;
      }
    }

    var backBtn = document.getElementById('btn-back-building');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (window.ViewerAppCore) {
          window.ViewerAppCore.goBack();
          setError('');
        }
      });
    }
    var confirmBtn = document.getElementById('btn-confirm-pick');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        if (window.ViewerAppCore) {
          window.ViewerAppCore.confirmSelection();
          setError('');
        }
      });
    }

    if (window.ViewerOverlay) {
      window.ViewerOverlay.bind({
        onFloor: function (fi) {
          if (window.ViewerAppCore && window.ViewerAppCore.isWalajnaFlow && window.ViewerAppCore.isWalajnaFlow()) {
            return;
          }
          if (window.ViewerAppCore) window.ViewerAppCore.previewFloor(fi);
        },
        onApt: function (ai) {
          if (window.ViewerAppCore && window.ViewerAppCore.isWalajnaFlow && window.ViewerAppCore.isWalajnaFlow()) {
            return;
          }
          if (window.ViewerAppCore) window.ViewerAppCore.previewApartment(ai);
        },
      });
    }

    var scene = document.getElementById('viewer-scene');
    if (!scene) {
      setError('Scene missing.');
      return;
    }

    function build() {
      if (!window.BuildingGenerator) {
        setError('3D generator failed to load. Reload the page.');
        return;
      }
      if (!window.ViewerAppCore) {
        setError('Viewer failed to load. Reload the page.');
        return;
      }
      try {
        var buildErr = window.ViewerAppCore.initFromSpec(spec);
        if (buildErr) setError(buildErr);
        else setError('');
      } catch (err) {
        setError('Could not build the 3D view: ' + (err && err.message ? err.message : String(err)));
        console.error(err);
      }
    }

    if (scene.hasLoaded) {
      build();
    } else {
      scene.addEventListener('loaded', build, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
