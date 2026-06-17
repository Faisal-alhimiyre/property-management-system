/** Tap floors and apartments. */

(function () {
  'use strict';

  var mount = null;
  var sceneEl = null;
  var pickMode = null;
  var onFloor = null;
  var onApt = null;
  var touchStart = null;
  var handlerStart = null;
  var handlerEnd = null;

  function three() {
    if (typeof AFRAME !== 'undefined' && AFRAME.THREE) return AFRAME.THREE;
    return null;
  }

  function pickDataset(root, clientX, clientY, attr) {
    var T = three();
    if (!T || !sceneEl || !sceneEl.camera || !root) return null;
    var canvas = sceneEl.canvas;
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    var ray = new T.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, sceneEl.camera);
    root.object3D.updateMatrixWorld(true);
    var hits = ray.intersectObjects([root.object3D], true);
    var hi;
    for (hi = 0; hi < hits.length; hi++) {
      var walk = hits[hi].object;
      while (walk) {
        if (walk.el && walk.el.dataset && walk.el.dataset[attr] != null) {
          return parseInt(walk.el.dataset[attr], 10);
        }
        walk = walk.parent;
      }
    }
    return null;
  }

  function onTouchStart(evt) {
    var t = evt.touches && evt.touches[0];
    if (!t) return;
    touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  }

  function onPointerEnd(evt) {
    if (!mount || !pickMode) return;
      if (window.CpisCubeView && window.CpisCubeView.isDragging()) return;
    var tch = evt.changedTouches && evt.changedTouches[0];
    var x = tch ? tch.clientX : evt.clientX;
    var y = tch ? tch.clientY : evt.clientY;

    if (touchStart) {
      var dx = x - touchStart.x;
      var dy = y - touchStart.y;
      var dt = Date.now() - touchStart.time;
      touchStart = null;
      if (dx * dx + dy * dy > 900 || dt > 700) return;
    }

    if (pickMode === 'floor') {
      var fi = pickDataset(mount, x, y, 'floorIndex');
      if (fi != null && !isNaN(fi) && onFloor) onFloor(fi);
    } else if (pickMode === 'apt') {
      var ai = pickDataset(mount, x, y, 'aptIndex');
      if (ai != null && !isNaN(ai) && onApt) onApt(ai);
    } else if (pickMode === 'floor-apt') {
      var aptIdx = pickDataset(mount, x, y, 'aptIndex');
      if (aptIdx != null && !isNaN(aptIdx) && onApt) {
        onApt(aptIdx);
        return;
      }
      var floorIdx = pickDataset(mount, x, y, 'floorIndex');
      if (floorIdx != null && !isNaN(floorIdx) && onFloor) onFloor(floorIdx);
    }
  }

  function attach(mode, root, floorCb, aptCb) {
    detach();
    mount = root;
    pickMode = mode;
    onFloor = floorCb;
    onApt = aptCb;
    sceneEl = document.getElementById('viewer-scene');
    if (!sceneEl) return;

    handlerStart = onTouchStart;
    handlerEnd = onPointerEnd;
    sceneEl.addEventListener('touchstart', handlerStart, { passive: true });
    sceneEl.addEventListener('touchend', handlerEnd, { passive: true });
    sceneEl.addEventListener('click', handlerEnd);
  }

  function detach() {
    if (sceneEl && handlerStart) {
      sceneEl.removeEventListener('touchstart', handlerStart);
      sceneEl.removeEventListener('touchend', handlerEnd);
      sceneEl.removeEventListener('click', handlerEnd);
    }
    mount = null;
    pickMode = null;
    onFloor = null;
    onApt = null;
    touchStart = null;
    handlerStart = null;
    handlerEnd = null;
  }

  window.ViewerNavigation = {
    attachFloorPick: function (root, cb) {
      attach('floor', root, cb, null);
    },
    attachAptPick: function (root, cb) {
      attach('apt', root, null, cb);
    },
    attachFloorAptPick: function (root, floorCb, aptCb) {
      attach('floor-apt', root, floorCb, aptCb);
    },
    detach: detach,
  };
})();
