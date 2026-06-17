/** Drag to rotate; cube and top-down plan modes. */

(function () {
  'use strict';

  if (typeof AFRAME === 'undefined') return;

  var CAM_Y = 1;
  var DEFAULT_DIST = 5.6;
  var DEFAULT_YAW = 35;
  var PLAN_HEIGHT = 4.2;
  var PLAN_ZOOM_BASE = 38;
  var PLAN_PITCH = -88;
  var PLAN_PITCH_MIN = -90;
  var PLAN_PITCH_MAX = -55;
  var PLAN_FOV = 50;
  var CUBE_FOV = 48;

  var viewMode = 'cube';

  function isUiTarget(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest('.pick-btn') ||
      el.closest('.viewer-bar') ||
      el.closest('.viewer-nav') ||
      el.closest('.action-pad') ||
      el.closest('.orbit-pad') ||
      el.closest('a') ||
      el.closest('button')
    );
  }

  function getMount() {
    return document.getElementById('building-mount');
  }

  function getCamWrap() {
    return document.getElementById('camera-wrap');
  }

  function getCamEl() {
    return document.getElementById('viewer-camera');
  }

  function getScene() {
    return document.getElementById('viewer-scene');
  }

  function getCamera() {
    var el = getCamEl();
    return el && el.components && el.components.camera ? el.components.camera.camera : null;
  }

  function readYaw(mount) {
    if (!mount) return viewMode === 'plan' ? 0 : DEFAULT_YAW;
    var r = mount.getAttribute('rotation');
    if (r && typeof r === 'object' && r.y != null) return parseFloat(r.y) || 0;
    return viewMode === 'plan' ? 0 : DEFAULT_YAW;
  }

  function setYaw(mount, deg) {
    if (!mount) return;
    mount.setAttribute('rotation', '0 ' + deg + ' 0');
  }

  function resetCamLocal() {
    var camEl = getCamEl();
    if (!camEl) return;
    camEl.setAttribute('position', '0 0 0');
    camEl.setAttribute('rotation', '0 0 0');
    camEl.setAttribute(
      'camera',
      'active: true; far: 100; near: 0.01; fov: ' + CUBE_FOV
    );
  }

  function applyCubeDist(dist) {
    var wrap = getCamWrap();
    if (!wrap) return;
    clearViewOffset();
    wrap.setAttribute('position', '0 ' + CAM_Y + ' ' + dist);
    resetCamLocal();
  }

  function setPlanMount(yaw, panX, panZ) {
    var mount = getMount();
    if (!mount) return;
    mount.setAttribute('position', {
      x: panX || 0,
      y: 0,
      z: panZ || 0,
    });
    mount.setAttribute('rotation', '0 ' + (yaw || 0) + ' 0');
  }

  function setCubeMount(yaw) {
    var mount = getMount();
    if (!mount) return;
    mount.setAttribute('position', '0 1 0');
    mount.setAttribute('rotation', '0 ' + (yaw != null ? yaw : DEFAULT_YAW) + ' 0');
  }

  function planHeightFromZoom(zoom) {
    return PLAN_HEIGHT * (PLAN_ZOOM_BASE / zoom);
  }

  function applyPlanView(state) {
    var zoom = state.zoom != null ? state.zoom : PLAN_ZOOM_BASE;
    var pitch = state.pitch != null ? state.pitch : PLAN_PITCH;
    var yaw = state.yaw != null ? state.yaw : 0;
    var panX = state.panX != null ? state.panX : 0;
    var panZ = state.panZ != null ? state.panZ : 0;
    var height = planHeightFromZoom(zoom);
    var wrap = getCamWrap();
    if (wrap) wrap.setAttribute('position', '0 ' + height + ' 0');
    setPlanMount(yaw, panX, panZ);
    var camEl = getCamEl();
    if (!camEl) return;
    camEl.setAttribute('position', '0 0 0');
    camEl.setAttribute('rotation', pitch + ' 0 0');
    camEl.setAttribute('camera', 'active: true; far: 100; near: 0.01; fov: ' + PLAN_FOV);
    var cam = getCamera();
    if (cam && cam.clearViewOffset) cam.clearViewOffset();
    if (cam && cam.updateProjectionMatrix) cam.updateProjectionMatrix();
  }

  function planStateFrom(self) {
    return {
      zoom: self._planZoom,
      pitch: self._planPitch,
      yaw: self._planYaw,
      panX: self._planPanX,
      panZ: self._planPanZ,
    };
  }

  function measureUi() {
    var h = window.innerHeight || 640;
    var bar = document.querySelector('.viewer-bar');
    var nav = document.getElementById('viewer-nav');
    var topH = (bar ? bar.offsetHeight : 48) + (nav && !nav.hidden ? nav.offsetHeight + 8 : 0);
    var botH = 0;
    var overlays = document.querySelectorAll('.viewer-overlay');
    var i;
    for (i = 0; i < overlays.length; i++) {
      if (!overlays[i].hidden) botH = Math.max(botH, overlays[i].offsetHeight);
    }
    if (!botH) botH = 72;
    var midY = topH + (h - topH - botH) * 0.5;
    return { h: h, w: window.innerWidth || 360, topH: topH, botH: botH, midY: midY };
  }

  function applyViewOffset() {
    // Keep building centered while zooming/rotating.
    // No UI-dependent offset so camera does not drift to top floors.
    clearViewOffset();
  }

  function clearViewOffset() {
    var cam = getCamera();
    if (cam && cam.clearViewOffset) {
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
  }

  AFRAME.registerComponent('cpis-cube-spin', {
    init: function () {
      var self = this;
      this._dragging = false;
      this._lastX = 0;
      this._lastY = 0;
      this._dist = DEFAULT_DIST;
      this._planZoom = PLAN_ZOOM_BASE;
      this._planPitch = PLAN_PITCH;
      this._planYaw = 0;
      this._planPanX = 0;
      this._planPanZ = 0;

      this._onDown = function (e) {
        self._down(e);
      };
      this._onMove = function (e) {
        self._move(e);
      };
      this._onUp = function () {
        self._dragging = false;
      };
      this._onWheel = function (e) {
        if (isUiTarget(e.target)) return;
        if (viewMode === 'plan') {
          self._planZoom *= e.deltaY > 0 ? 0.9 : 1.1;
          self._planZoom = Math.min(72, Math.max(22, self._planZoom));
          applyPlanView(planStateFrom(self));
          applyViewOffset();
        } else {
          self._dist *= e.deltaY > 0 ? 1.08 : 0.92;
          self._dist = Math.min(10, Math.max(3.2, self._dist));
          applyCubeDist(self._dist);
          applyViewOffset();
        }
        e.preventDefault();
      };
      this._onResize = function () {
        applyViewOffset();
      };

      var cap = { passive: false, capture: true };
      var scene = getScene();
      if (scene) {
        scene.addEventListener('mousedown', this._onDown, cap);
        scene.addEventListener('touchstart', this._onDown, cap);
      }
      window.addEventListener('mousemove', this._onMove, cap);
      window.addEventListener('mouseup', this._onUp, cap);
      window.addEventListener('wheel', this._onWheel, cap);
      window.addEventListener('touchmove', this._onMove, cap);
      window.addEventListener('touchend', this._onUp, cap);
      window.addEventListener('resize', this._onResize);

      window.CpisCubeView = {
        isDragging: function () {
          return self._dragging;
        },
        setPlanView: function (on) {
          viewMode = on ? 'plan' : 'cube';
          if (on) {
            applyPlanView(planStateFrom(self));
            applyViewOffset();
          } else {
            setCubeMount(readYaw(getMount()));
            applyCubeDist(self._dist);
            applyViewOffset();
          }
        },
        rotateLeft: function () {
          if (viewMode === 'plan') {
            self._planYaw += 22;
            applyPlanView(planStateFrom(self));
            applyViewOffset();
            return;
          }
          setYaw(getMount(), readYaw(getMount()) + 22);
        },
        rotateRight: function () {
          if (viewMode === 'plan') {
            self._planYaw -= 22;
            applyPlanView(planStateFrom(self));
            applyViewOffset();
            return;
          }
          setYaw(getMount(), readYaw(getMount()) - 22);
        },
        zoomIn: function () {
          if (viewMode === 'plan') {
            self._planZoom *= 1.12;
            self._planZoom = Math.min(72, self._planZoom);
            applyPlanView(planStateFrom(self));
            applyViewOffset();
          } else {
            self._dist *= 0.88;
            self._dist = Math.max(3.2, self._dist);
            applyCubeDist(self._dist);
            applyViewOffset();
          }
        },
        zoomOut: function () {
          if (viewMode === 'plan') {
            self._planZoom *= 0.88;
            self._planZoom = Math.max(22, self._planZoom);
            applyPlanView(planStateFrom(self));
            applyViewOffset();
          } else {
            self._dist *= 1.12;
            self._dist = Math.min(10, self._dist);
            applyCubeDist(self._dist);
            applyViewOffset();
          }
        },
        resetView: function () {
          if (viewMode === 'plan') {
            self._planYaw = 0;
            self._planPitch = PLAN_PITCH;
            self._planPanX = 0;
            self._planPanZ = 0;
            self._planZoom = PLAN_ZOOM_BASE;
            applyPlanView(planStateFrom(self));
            applyViewOffset();
          } else {
            setCubeMount(DEFAULT_YAW);
            self._dist = DEFAULT_DIST;
            applyCubeDist(self._dist);
            applyViewOffset();
          }
        },
        reflow: function () {
          if (viewMode === 'plan') applyPlanView(planStateFrom(self));
          applyViewOffset();
        },
      };

      window.CpisViewerOrbit = window.CpisCubeView;

      resetCamLocal();
      setYaw(getMount(), DEFAULT_YAW);
      applyCubeDist(DEFAULT_DIST);

      if (scene) {
        scene.addEventListener('loaded', function () {
          applyViewOffset();
        });
        if (scene.hasLoaded) applyViewOffset();
      }
      setTimeout(applyViewOffset, 50);
    },

    _point: function (e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    },

    _down: function (e) {
      if (isUiTarget(e.target)) return;
      if (e.touches && e.touches.length > 1) return;
      this._dragging = true;
      var p = this._point(e);
      this._lastX = p.x;
      this._lastY = p.y;
      e.preventDefault();
    },

    _move: function (e) {
      if (!this._dragging) return;
      if (e.touches && e.touches.length > 1) return;
      var p = this._point(e);
      var dx = p.x - this._lastX;
      var dy = p.y - this._lastY;
      this._lastX = p.x;
      this._lastY = p.y;

      if (viewMode === 'plan') {
        this._planYaw -= dx * 0.45;
        this._planPitch -= dy * 0.22;
        if (this._planPitch < PLAN_PITCH_MIN) this._planPitch = PLAN_PITCH_MIN;
        if (this._planPitch > PLAN_PITCH_MAX) this._planPitch = PLAN_PITCH_MAX;
        var pan = 0.009 * (PLAN_ZOOM_BASE / this._planZoom);
        this._planPanX -= dx * pan;
        this._planPanZ -= dy * pan;
        applyPlanView(planStateFrom(this));
        applyViewOffset();
      } else {
        setYaw(getMount(), readYaw(getMount()) - dx * 0.35);
      }
      e.preventDefault();
    },

    remove: function () {
      clearViewOffset();
      var scene = getScene();
      if (scene) {
        scene.removeEventListener('mousedown', this._onDown, true);
        scene.removeEventListener('touchstart', this._onDown, true);
      }
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMove, true);
      window.removeEventListener('mouseup', this._onUp, true);
      window.removeEventListener('wheel', this._onWheel, true);
      window.removeEventListener('touchmove', this._onMove, true);
      window.removeEventListener('touchend', this._onUp, true);
    },
  });
})();
