/** Building → apartment viewer state (Walajna: building highlight ↔ floor plan only). */

(function () {
  'use strict';

  var savedSpec = null;
  var state = { mode: 'building', floorIndex: null, aptIndex: null };
  var walajnaHighlight = false;
  var pendingFloorConfirm = false;
  var pendingFloorIndex = null;
  var pendingAptConfirm = false;
  var pendingAptIndex = null;

  function isWalajnaFlow() {
    return !!(savedSpec && savedSpec.walajna);
  }

  function setHint(text) {
    var el = document.getElementById('viewer-hint');
    if (el) el.textContent = text;
  }

  function setViewerError(msg) {
    var el = document.getElementById('viewer-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
      el.style.display = 'block';
    } else {
      el.textContent = '';
      el.hidden = true;
      el.style.display = '';
    }
  }

  function setBackButton() {
    var btn = document.getElementById('btn-back-building');
    if (!btn) return;
    if (isWalajnaFlow()) {
      if (state.mode === 'apartment') {
        btn.style.display = 'flex';
        btn.textContent = '← Building';
      } else {
        btn.style.display = 'none';
      }
      return;
    }
    if (state.mode === 'building') {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'flex';
      btn.textContent = state.mode === 'floor' ? '← Building' : '← Floor layout';
    }
  }

  function setPickFlowNote() {
    var note = document.getElementById('pick-flow-note');
    if (!note) return;
    if (state.mode === 'apartment') {
      note.hidden = true;
      return;
    }
    note.hidden = false;
    if (isWalajnaFlow() && walajnaHighlight && state.mode === 'building') {
      note.textContent = 'Your apartment is in yellow — tap Confirm to open the floor plan';
    } else if (walajnaHighlight && state.mode === 'building') {
      note.textContent = 'Tap Confirm to open your floor plan';
    } else if (state.mode === 'building' || pendingFloorConfirm) {
      note.textContent = pendingFloorConfirm
        ? 'Floor selected — tap Confirm'
        : 'Pick a floor, then pick an apartment';
    } else if (pendingAptConfirm) {
      note.textContent = 'Apartment selected — tap Confirm';
    } else {
      note.textContent = 'Pick an apartment, then tap Confirm';
    }
  }

  function setConfirmButtons() {
    var confirmBtn = document.getElementById('btn-confirm-pick');
    var confirmReady =
      (walajnaHighlight && state.mode === 'building') ||
      (pendingFloorConfirm && pendingFloorIndex != null) ||
      (pendingAptConfirm && pendingAptIndex != null);

    if (confirmBtn) {
      if (isWalajnaFlow() && state.mode === 'apartment') {
        confirmBtn.style.display = 'none';
      } else {
        confirmBtn.style.display = '';
        confirmBtn.disabled = !confirmReady;
        confirmBtn.classList.toggle('pick-action--active', confirmReady);
        confirmBtn.classList.toggle('pick-action--idle', !confirmReady);
      }
    }
    setPickFlowNote();
  }

  function afterRebuild(mount) {
    if (!window.ViewerCamera || !mount) return;
    window.ViewerCamera.focusOnMount(mount, state.mode);
    if (state.mode !== 'apartment') return;
    requestAnimationFrame(function () {
      if (!window.CpisCubeView) return;
      if (window.CpisCubeView.setPlanView) window.CpisCubeView.setPlanView(true);
      if (window.CpisCubeView.resetView) window.CpisCubeView.resetView();
    });
  }

  function rebuild() {
    var mount = document.getElementById('building-mount');
    if (!mount || !savedSpec) return 'Scene not ready.';

    var floorsN = clampMin(savedSpec.floors, 1);
    var aptsN = clampMin(savedSpec.apartments, 1);
    var perFloorH = savedSpec.height / floorsN;
    var buildSpec = Object.assign({}, savedSpec, {
      useFixedApartmentTemplate: true,
      previewCutaway: true,
      previewCube: true,
      cubeFloors: floorsN,
      cubeApartments: aptsN,
      apartments: aptsN,
      floors: 1,
      height: perFloorH,
    });
    delete buildSpec.apartmentLayout;

    buildSpec.viewerMode = state.mode;
    if (pendingFloorConfirm && pendingFloorIndex != null) {
      buildSpec.viewerMode = 'floor';
      buildSpec.pendingFloorConfirm = true;
      buildSpec.selectedFloorIndex = pendingFloorIndex;
    }
    if (state.mode === 'apartment' && state.aptIndex != null) {
      buildSpec.selectedApartmentIndex = state.aptIndex;
    } else if (pendingAptConfirm && pendingAptIndex != null) {
      buildSpec.pendingAptConfirm = true;
      buildSpec.selectedApartmentIndex = pendingAptIndex;
    } else {
      delete buildSpec.selectedApartmentIndex;
    }
    if (state.mode === 'floor' && state.floorIndex != null && !pendingFloorConfirm) {
      buildSpec.selectedFloorIndex = state.floorIndex;
    } else if (pendingFloorConfirm && pendingFloorIndex != null) {
      buildSpec.selectedFloorIndex = pendingFloorIndex;
    } else if (state.mode === 'building') {
      delete buildSpec.selectedFloorIndex;
    }

    if (
      walajnaHighlight &&
      state.mode === 'building' &&
      state.floorIndex != null &&
      state.aptIndex != null
    ) {
      buildSpec.walajnaHighlightFloor = state.floorIndex;
      buildSpec.walajnaHighlightApt = state.aptIndex;
    } else {
      delete buildSpec.walajnaHighlightFloor;
      delete buildSpec.walajnaHighlightApt;
    }

    try {
      window.BuildingGenerator.generateBuilding(mount, buildSpec);
    } catch (err) {
      console.error(err);
      var buildErr = 'Could not build the 3D view: ' + (err && err.message ? err.message : String(err));
      setViewerError(buildErr);
      return buildErr;
    }

    if (mount.childElementCount === 0) {
      return 'Building model is empty. Reload the page.';
    }

    if (window.RoomRelocate) {
      if (state.mode === 'apartment') {
        window.RoomRelocate.attach(mount);
      } else {
        window.RoomRelocate.detach();
      }
    }

    if (window.ViewerNavigation) {
      window.ViewerNavigation.detach();
      if (isWalajnaFlow()) {
        /* Walajna: no floor / apartment picking on the cube. */
      } else if (state.mode === 'building') {
        window.ViewerNavigation.attachFloorPick(mount, function (fi) {
          previewFloor(fi);
        });
      } else if (state.mode === 'floor') {
        if (pendingFloorConfirm) {
          window.ViewerNavigation.attachFloorPick(mount, function (fi) {
            previewFloor(fi);
          });
        } else {
          window.ViewerNavigation.attachFloorAptPick(
            mount,
            function (fi) {
              previewFloor(fi);
            },
            function (ai) {
              previewApartment(ai);
            }
          );
        }
      }
    }

    if (state.mode === 'building') {
      if (walajnaHighlight && state.floorIndex != null && state.aptIndex != null) {
        setHint('Your apartment is in yellow — tap Confirm to open the floor plan');
      } else {
        setHint('Building — tap a floor on the cube');
      }
    } else if (state.mode === 'floor') {
      if (pendingFloorConfirm && pendingFloorIndex != null) {
        setHint('Floor ' + (pendingFloorIndex + 1) + ' selected — tap Confirm');
      } else if (pendingAptConfirm && pendingAptIndex != null) {
        setHint('Apartment ' + (pendingAptIndex + 1) + ' selected — tap Confirm');
      } else {
        setHint('Floor ' + (state.floorIndex + 1) + ' — tap an apartment on the cube');
      }
    } else {
      setHint(
        'Floor plan — drag to move & rotate · tap a room then the floor to move it · + − to zoom'
      );
    }
    setBackButton();
    setConfirmButtons();
    if (window.ViewerOverlay) {
      window.ViewerOverlay.update(state, {
        floorCount: floorsN,
        aptCount: aptsN,
        walajna: isWalajnaFlow(),
      });
    }
    afterRebuild(mount);
    setViewerError(null);
    return null;
  }

  function clampMin(n, min) {
    return n < min ? min : n;
  }

  function clearPendingApt() {
    pendingAptConfirm = false;
    pendingAptIndex = null;
  }

  function clearPendingFloor() {
    pendingFloorConfirm = false;
    pendingFloorIndex = null;
  }

  function showBuilding() {
    clearPendingFloor();
    clearPendingApt();
    walajnaHighlight = false;
    state.mode = 'building';
    state.floorIndex = null;
    state.aptIndex = null;
    return rebuild();
  }

  function showBuildingWithWalajnaHighlight(floorIndex, aptIndex) {
    clearPendingFloor();
    clearPendingApt();
    walajnaHighlight = true;
    state.mode = 'building';
    state.floorIndex = floorIndex;
    state.aptIndex = aptIndex;
    return rebuild();
  }

  function previewFloor(index) {
    if (isWalajnaFlow()) return null;
    clearPendingApt();
    walajnaHighlight = false;
    pendingFloorConfirm = true;
    pendingFloorIndex = index;
    state.mode = 'floor';
    state.floorIndex = index;
    state.aptIndex = null;
    return rebuild();
  }

  function previewApartment(index) {
    if (isWalajnaFlow()) return null;
    if (pendingFloorConfirm) return null;
    pendingAptConfirm = true;
    pendingAptIndex = index;
    state.aptIndex = null;
    return rebuild();
  }

  function confirmSelection() {
    if (walajnaHighlight && state.mode === 'building' && state.floorIndex != null && state.aptIndex != null) {
      walajnaHighlight = false;
      state.mode = 'apartment';
      var err = rebuild();
      if (err) setViewerError(err);
      return err;
    }
    if (isWalajnaFlow()) return null;
    if (pendingFloorConfirm && pendingFloorIndex != null) {
      var floorIdx = pendingFloorIndex;
      clearPendingFloor();
      state.floorIndex = floorIdx;
      state.mode = 'floor';
      state.aptIndex = null;
      return rebuild();
    }
    if (pendingAptConfirm && pendingAptIndex != null) {
      var aptIdx = pendingAptIndex;
      clearPendingApt();
      state.aptIndex = aptIdx;
      state.mode = 'apartment';
      var err = rebuild();
      if (err) setViewerError(err);
      return err;
    }
    return null;
  }

  function cancelSelection() {
    if (isWalajnaFlow()) return null;
    if (pendingAptConfirm) {
      clearPendingApt();
      return rebuild();
    }
    if (pendingFloorConfirm) {
      return showBuilding();
    }
    if (state.mode === 'apartment') {
      state.mode = 'floor';
      state.aptIndex = null;
      return rebuild();
    }
    if (state.mode === 'floor') {
      return showBuilding();
    }
    return null;
  }

  function showFloor(index) {
    if (isWalajnaFlow()) return null;
    clearPendingFloor();
    clearPendingApt();
    walajnaHighlight = false;
    state.mode = 'floor';
    state.floorIndex = index;
    state.aptIndex = null;
    return rebuild();
  }

  function showApartment(index) {
    clearPendingFloor();
    clearPendingApt();
    state.mode = 'apartment';
    state.aptIndex = index;
    var err = rebuild();
    if (err) setViewerError(err);
    return err;
  }

  function goBack() {
    if (state.mode === 'apartment') {
      if (isWalajnaFlow() && state.floorIndex != null && state.aptIndex != null) {
        return showBuildingWithWalajnaHighlight(state.floorIndex, state.aptIndex);
      }
      clearPendingApt();
      state.mode = 'floor';
      state.aptIndex = null;
      return rebuild();
    }
    if (isWalajnaFlow()) return null;
    if (state.mode === 'floor') {
      return showBuilding();
    }
    return null;
  }

  function initFromSpec(spec) {
    savedSpec = spec;
    if (spec && spec.walajna) {
      var floorNum = Number(spec.walajna.floorNumber);
      var aptNum = parseInt(String(spec.walajna.apartmentNumber || ''), 10);
      var perFloor = Math.max(1, Number(spec.apartments) || 1);
      if (Number.isFinite(floorNum) && floorNum >= 1 && Number.isFinite(aptNum) && aptNum >= 1) {
        return showBuildingWithWalajnaHighlight(
          floorNum - 1,
          Math.max(0, (aptNum - 1) % perFloor)
        );
      }
    }
    return showBuilding();
  }

  window.ViewerAppCore = {
    initFromSpec: initFromSpec,
    showBuilding: showBuilding,
    showBuildingWithWalajnaHighlight: showBuildingWithWalajnaHighlight,
    showFloor: showFloor,
    showApartment: showApartment,
    previewFloor: previewFloor,
    previewApartment: previewApartment,
    confirmSelection: confirmSelection,
    cancelSelection: cancelSelection,
    goBack: goBack,
    isWalajnaFlow: isWalajnaFlow,
    getState: function () {
      return {
        mode: state.mode,
        floorIndex: state.floorIndex,
        aptIndex: state.aptIndex,
      };
    },
  };
})();
