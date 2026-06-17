/** Breadcrumb and stage labels. */

(function () {
  'use strict';

  var handlers = { onFloor: null, onApt: null };

  function floorLabel(index) {
    var n = index + 1;
    var s = String(n);
    if (n % 100 >= 11 && n % 100 <= 13) return s + 'th floor';
    switch (n % 10) {
      case 1:
        return s + 'st floor';
      case 2:
        return s + 'nd floor';
      case 3:
        return s + 'rd floor';
      default:
        return s + 'th floor';
    }
  }

  function setActive(idPrefix, index, count) {
    var i;
    for (i = 0; i < count; i++) {
      var btn = document.getElementById(idPrefix + i);
      if (btn) {
        if (index === i) btn.classList.add('pick-btn--active');
        else btn.classList.remove('pick-btn--active');
      }
    }
  }

  function renderButtons(containerId, count, idPrefix, labelFn, onPick) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    var i;
    for (i = 0; i < count; i++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pick-btn' + (idx > 0 ? ' pick-btn--secondary' : '');
        btn.id = idPrefix + idx;
        btn.textContent = labelFn(idx);
        btn.onclick = function () {
          if (onPick) onPick(idx);
        };
        container.appendChild(btn);
      })(i);
    }
  }

  function update(state, meta) {
    meta = meta || {};
    var floorCount = Math.max(1, meta.floorCount || 1);
    var aptCount = Math.max(1, meta.aptCount || 1);
    var walajna = !!meta.walajna;
    var floors = document.getElementById('overlay-floors');
    var apts = document.getElementById('overlay-apts');
    var bc = document.getElementById('viewer-breadcrumb');
    var stage = document.getElementById('viewer-stage-label');
    var nav = document.getElementById('viewer-nav');

    if (floors) floors.hidden = true;
    if (apts) apts.hidden = true;

    if (walajna) {
      if (bc) {
        bc.innerHTML =
          state.mode === 'apartment'
            ? 'Building <span aria-hidden="true">›</span> <strong>Floor plan</strong>'
            : '<strong>Your building</strong>';
      }
      if (stage) {
        stage.textContent =
          state.mode === 'apartment'
            ? "Bird's-eye floor plan — drag to move & rotate"
            : 'Your apartment is highlighted in yellow — tap Confirm to open the floor plan';
      }
      if (nav) nav.dataset.level = state.mode === 'apartment' ? 'apartment' : 'building';
    } else if (state.mode === 'building') {
      if (bc) bc.innerHTML = '<strong>Building</strong>';
      if (stage) {
        stage.textContent =
          floorCount === 1
            ? 'Tap the floor on the cube'
            : 'Tap a floor on the cube';
      }
      if (nav) nav.dataset.level = 'building';
    } else if (state.mode === 'floor') {
      if (bc) {
        bc.innerHTML =
          'Building <span aria-hidden="true">›</span> <strong>Floor ' +
          (state.floorIndex + 1) +
          '</strong>';
      }
      if (stage) {
        stage.textContent =
          'All ' +
          floorCount +
          ' floor' +
          (floorCount === 1 ? '' : 's') +
          ' stay visible — selected floor splits into ' +
          aptCount +
          ' apartment' +
          (aptCount === 1 ? '' : 's') +
          ' · tap another floor to switch';
      }
      if (nav) nav.dataset.level = 'floor';
    } else {
      if (bc) {
        bc.innerHTML =
          'Building <span aria-hidden="true">›</span> Floor ' +
          (state.floorIndex + 1) +
          ' <span aria-hidden="true">›</span> <strong>Apartment ' +
          (state.aptIndex + 1) +
          '</strong>';
      }
      if (stage) {
        stage.textContent =
          "Bird's-eye floor plan — drag to move & rotate · tap a room then the floor to move it · + − to zoom";
      }
      if (nav) nav.dataset.level = 'apartment';
    }

    if (window.CpisCubeView && window.CpisCubeView.reflow) {
      requestAnimationFrame(function () {
        window.CpisCubeView.reflow();
      });
    }
  }

  function bind(h) {
    handlers.onFloor = h && h.onFloor ? h.onFloor : null;
    handlers.onApt = h && h.onApt ? h.onApt : null;
  }

  window.ViewerOverlay = {
    update: update,
    bind: bind,
  };
})();
