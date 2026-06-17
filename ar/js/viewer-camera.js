/** Camera framing for cube and plan views. */

(function () {
  'use strict';

  var didInitialFocus = false;
  var lastMode = null;

  function focusOnMount(mount, mode) {
    if (!mount) return;

    var isPlan = mode === 'apartment';
    var enteringPlan = isPlan && lastMode !== 'apartment';
    var shouldReset = !didInitialFocus || enteringPlan;
    lastMode = mode;

    function apply() {
      if (!window.CpisCubeView) return false;
      if (window.CpisCubeView.setPlanView) {
        window.CpisCubeView.setPlanView(isPlan);
      }
      if (shouldReset && window.CpisCubeView.resetView) {
        window.CpisCubeView.resetView();
      } else if (window.CpisCubeView.reflow) {
        window.CpisCubeView.reflow();
      }
      didInitialFocus = true;
      return true;
    }

    if (!apply()) {
      requestAnimationFrame(function () {
        if (!apply()) {
          requestAnimationFrame(apply);
        }
      });
    }
  }

  window.ViewerCamera = {
    focusOnMount: focusOnMount,
    previewScale: function () {
      return 1;
    },
    PREVIEW_MAX: 2,
  };
})();
