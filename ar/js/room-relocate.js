/** Tap a room, then tap the floor to move it. */

(function () {
  'use strict';

  var selected = null;
  var mount = null;
  var sceneEl = null;
  var onPickBound = null;
  var lastPickAt = 0;

  function three() {
    if (typeof AFRAME !== 'undefined' && AFRAME.THREE) return AFRAME.THREE;
    if (typeof THREE !== 'undefined') return THREE;
    return null;
  }

  /**
   * @param {Element} mount
   * @param {Element} scene
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ type: 'door'|'room'|'floor', el: Element, point: import('three').Vector3 }|null}
   */
  function pickMount(mount, scene, clientX, clientY) {
    var T = three();
    if (!T || !mount || !scene || !scene.camera) return null;
    var canvas = scene.canvas;
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    var ray = new T.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, scene.camera);
    mount.object3D.updateMatrixWorld(true);
    var hits = ray.intersectObjects([mount.object3D], true);
    var hi;
    for (hi = 0; hi < hits.length; hi++) {
      var walk = hits[hi].object;
      while (walk) {
        if (walk.el) {
          var el = walk.el;
          if (el.dataset && el.dataset.doorToggle === '1') {
            return { type: 'door', el: el, point: hits[hi].point };
          }
          if (el.classList && el.classList.contains('door-hot')) {
            return { type: 'door', el: el, point: hits[hi].point };
          }
          if (el.classList && el.classList.contains('room-select-hit')) {
            return { type: 'room', el: el, point: hits[hi].point };
          }
          if (el.classList && el.classList.contains('relocate-floor-hit')) {
            return { type: 'floor', el: el, point: hits[hi].point };
          }
        }
        walk = walk.parent;
      }
    }
    return null;
  }

  window.CpisPick = {
    pick: pickMount,
  };

  function findRoomCluster(node) {
    var cur = node;
    while (cur) {
      if (cur.classList && cur.classList.contains('room-cluster')) return cur;
      cur = cur.parentElement || cur.parentEl || null;
    }
    return null;
  }

  function tintHex(hex, pct) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return '#64748b';
    var num = parseInt(hex.slice(1), 16);
    var r = (num >> 16) & 255;
    var g = (num >> 8) & 255;
    var b = num & 255;
    var target = pct >= 0 ? 255 : 0;
    var t = Math.abs(pct);
    var rr = Math.round(r + (target - r) * t);
    var gg = Math.round(g + (target - g) * t);
    var bb = Math.round(b + (target - b) * t);
    return (
      '#' +
      rr.toString(16).padStart(2, '0') +
      gg.toString(16).padStart(2, '0') +
      bb.toString(16).padStart(2, '0')
    );
  }

  function clearSelect() {
    if (!selected) return;
    var slab = selected.querySelector('[data-slab="1"]');
    if (slab) {
      var base = slab.dataset.baseColor;
      if (base) slab.setAttribute('material', 'color', base);
    }
    selected.setAttribute('scale', '1 1 1');
    selected = null;
  }

  function selectGroup(grp) {
    clearSelect();
    selected = grp;
    var slab = selected.querySelector('[data-slab="1"]');
    if (slab) {
      var base = slab.dataset.baseColor || '#94a3b8';
      slab.setAttribute('material', 'color', tintHex(base, -0.2));
    }
    selected.setAttribute('scale', '1 1 1');
  }

  function onPick(evt) {
    if (!mount || !sceneEl) return;
    if (!sceneEl.hasLoaded) return;

    var tch = evt.changedTouches && evt.changedTouches[0];
    var clientX = tch ? tch.clientX : evt.clientX;
    var clientY = tch ? tch.clientY : evt.clientY;

    var res = pickMount(mount, sceneEl, clientX, clientY);
    if (!res || res.type === 'door') return;
    if (window.CpisViewerOrbit && window.CpisViewerOrbit.isDragging()) return;

    var now = Date.now();
    if (now - lastPickAt < 140) return;
    lastPickAt = now;

    if (res.type === 'room') {
      var grp = findRoomCluster(res.el);
      if (grp) selectGroup(grp);
      return;
    }

    if (res.type === 'floor' && selected) {
      var floorEl = res.el;
      var T = three();
      if (!T || floorEl.dataset.innerX0 == null) return;

      var ix0 = parseFloat(floorEl.dataset.innerX0, 10);
      var ix1 = parseFloat(floorEl.dataset.innerX1, 10);
      var iz0 = parseFloat(floorEl.dataset.innerZ0, 10);
      var iz1 = parseFloat(floorEl.dataset.innerZ1, 10);
      var hw = parseFloat(selected.dataset.halfW, 10) || 0.05;
      var hd = parseFloat(selected.dataset.halfD, 10) || 0.05;

      var local = new T.Vector3();
      mount.object3D.worldToLocal(local.copy(res.point));

      var ny = selected.object3D.position.y;
      var nx = Math.min(Math.max(local.x, ix0 + hw), ix1 - hw);
      var nz = Math.min(Math.max(local.z, iz0 + hd), iz1 - hd);
      selected.setAttribute('position', { x: nx, y: ny, z: nz });
    }
  }

  function attach(root) {
    detach();
    mount = root;
    sceneEl = document.getElementById('viewer-scene');
    if (!mount || !sceneEl) return;

    onPickBound = onPick;
    sceneEl.addEventListener('touchend', onPickBound, { passive: false });
    sceneEl.addEventListener('click', onPickBound);
  }

  function detach() {
    if (sceneEl && onPickBound) {
      sceneEl.removeEventListener('touchend', onPickBound);
      sceneEl.removeEventListener('click', onPickBound);
    }
    sceneEl = null;
    onPickBound = null;
    mount = null;
    clearSelect();
  }

  window.RoomRelocate = {
    attach: attach,
    detach: detach,
  };
})();
