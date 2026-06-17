/** Builds 3D shell and room blocks from form spec. */

(function () {
  'use strict';

  /** Wall thickness in meters — thin so the interior feels roomy. */
  var WALL_T = 0.04;

  /** Set false: procedural facade stacks any floor count. GLB only works if exported as separate floor modules. */
  var USE_BUILDING_GLB = false;

  /** Optional fixed GLB (single mesh — not flexible). See BUILDING_GLB_MODULAR for stackable assets. */
  var BUILDING_GLB = {
    src: '../models/brick_shop_building__lowpoly.glb',
    scaleMul: 1,
    position: '0 0 0',
    rotation: '0 0 0',
  };

  /**
   * Future: modular GLB set — ground + repeatable floor + roof (each its own file).
   * Stack floor mesh (count - 2) times between ground and roof.
   */
  var BUILDING_GLB_MODULAR = {
    ground: null,
    floor: null,
    roof: null,
    floorHeight: 0.78,
  };

  /** Same frame as the old grey cube (camera targets y=1, mount at y=1). */
  function ensureBuildingCubeFrame() {
    if (window.CpisCubeView && window.CpisCubeView.setPlanView) {
      window.CpisCubeView.setPlanView(false);
    }
    if (window.CpisCubeView && window.CpisCubeView.resetView) {
      window.CpisCubeView.resetView();
    }
  }

  /** Colors for room types (distinct for presentation). */
  var COLORS = {
    bedroom: '#6C8EBF',
    kitchen: '#F2C14E',
    bathroom: '#7BC96F',
    hallway: '#94a3b8',
    living: '#e8dcc8',
    entrance: '#cbd5e1',
  };

  /**
   * @typedef {Object} ApartmentTemplate
   * @property {number} bedrooms
   * @property {number} kitchens
   * @property {number} bathrooms
   */

  /**
   * @typedef {Object} BuildingSpec
   * @property {number} width
   * @property {number} depth
   * @property {number} height
   * @property {number} floors
   * @property {number} apartments
   * @property {ApartmentTemplate} apartment
   */

  /**
   * Remove every child under building-root (safe regenerate).
   * @param {Element} root
   */
  function clearChildren(root) {
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
  }

  /**
   * @param {string} tag
   * @param {Object<string, string|number|boolean>} attrs
   * @returns {Element}
   */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (!attrs) return node;
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, String(attrs[key]));
    });
    return node;
  }

  /**
   * @param {number} n
   * @returns {number}
   */
  function clampMin(n, min) {
    return n < min ? min : n;
  }

  /**
   * Lighten/darken a hex color by pct in range [-1..1].
   * @param {string} hex
   * @param {number} pct
   * @returns {string}
   */
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

  /** Darken a hex color; t is 0 (unchanged) to 1 (darkest). */
  function shadeColor(hex, t) {
    return tintHex(hex, -Math.max(0, Math.min(1, t)) * 0.45);
  }

  /**
   * Flat square on a cube face (+Z front, ±X sides).
   * @param {Element} parent
   * @param {'front'|'right'|'left'} face
   * @param {number} S cube width/depth
   * @param {number} u horizontal on face (-1..1)
   * @param {number} y world y
   * @param {number} size
   * @param {string} color
   */
  function addCubeFaceSquare(parent, face, faceW, faceD, u, y, size, color, opacity) {
    addCubeFaceRect(parent, face, faceW, faceD, u, y, size, size, color, opacity);
  }

  function scaleFacadeU(offsets, faceW) {
    var scale = faceW / 2;
    var out = [];
    var i;
    for (i = 0; i < offsets.length; i++) out.push(offsets[i] * scale);
    return out;
  }

  function addCubeFaceRect(parent, face, faceW, faceD, u, y, width, height, color, opacity) {
    var bump = 0.009;
    var pos;
    var rotY = 0;
    if (face === 'front') {
      pos = u + ' ' + y + ' ' + (faceD / 2 + bump);
    } else if (face === 'right') {
      pos = faceW / 2 + bump + ' ' + y + ' ' + u;
      rotY = 90;
    } else {
      pos = -(faceW / 2 + bump) + ' ' + y + ' ' + u;
      rotY = -90;
    }
    var matStr =
      'color: ' +
      color +
      '; shader: flat; side: double; polygonOffset: true; polygonOffsetFactor: -2';
    if (opacity != null && opacity < 1) {
      matStr += '; opacity: ' + opacity + '; transparent: true';
    }
    parent.appendChild(
      el('a-plane', {
        width: width,
        height: height,
        position: pos,
        rotation: '0 ' + rotY + ' 0',
        material: matStr,
      })
    );
  }

  function addGroundFloorDoor(floorWrap, faceW, faceD, floorH, opacity) {
    var op = opacity == null ? 1 : opacity;
    var doorW = Math.min(0.22, floorH * 0.42);
    var doorH = Math.min(0.42, floorH * 0.88);
    if (doorW < 0.07) doorW = 0.07;
    if (doorH < 0.14) doorH = 0.14;
    var doorY = -floorH / 2 + doorH / 2 + 0.025;
    addCubeFaceRect(floorWrap, 'front', faceW, faceD, 0, doorY, doorW, doorH, '#4a3728', op);
    var handleSize = Math.min(0.032, doorW * 0.2);
    if (handleSize < 0.012) handleSize = 0.012;
    var handleU = doorW / 2 - handleSize * 0.85 - 0.012;
    var handleY = doorY + doorH * 0.02;
    addCubeFaceSquare(floorWrap, 'front', faceW, faceD, handleU, handleY, handleSize, '#1c1917', op);
  }

  /** Window + door squares on one floor slab (local origin = floor center). */
  function addCubeFloorFacade(floorWrap, faceW, faceD, floorH, isGroundFloor, isTopFloor, opacity, skipDoor) {
    var op = opacity == null ? 1 : opacity;
    var winCol = '#7ec8e3';
    var sq = Math.min(0.16, floorH * 0.38);
    if (sq < 0.05) sq = 0.05;
    var winY = sq * 0.15;
    var faces = ['front', 'right', 'left'];
    var f;
    var wi;
    var frontWinU = scaleFacadeU(isGroundFloor ? [-0.38, 0.38] : [-0.52, 0, 0.52], faceW);
    var sideWinU = scaleFacadeU([-0.38, 0.38], faceD);

    for (f = 0; f < faces.length; f++) {
      var face = faces[f];
      var offsets = face === 'front' ? frontWinU : sideWinU;
      for (wi = 0; wi < offsets.length; wi++) {
        addCubeFaceSquare(floorWrap, face, faceW, faceD, offsets[wi], winY, sq, winCol, op);
      }
    }
    if (isGroundFloor && !skipDoor) {
      addGroundFloorDoor(floorWrap, faceW, faceD, floorH, op);
    }
    if (isTopFloor) {
      var lipH = Math.min(0.06, floorH * 0.14);
      floorWrap.appendChild(
        el('a-box', {
          width: faceW + 0.06,
          height: lipH,
          depth: faceD + 0.06,
          position: '0 ' + (floorH / 2 + lipH / 2) + ' 0',
          material: 'color: #52525b; shader: flat',
        })
      );
    }
  }

  function buildingFloorColors(spec, floorIndex, floorCount) {
    if (floorIndex === 0) return '#d4c4a8';
    if (floorIndex === floorCount - 1) return '#6b7280';
    return floorIndex % 2 === 0 ? '#c86b4a' : '#b5523a';
  }

  /** Selected apartment in yellow — one segment per unit (no overlapping layers). */
  function addWalajnaHighlightFloor(parent, fi, floorCount, bandH, faceW, faceD, floorColor, hiApt, aptCount, gap, fw, mat) {
    var totalW = aptCount * fw + Math.max(0, aptCount - 1) * gap;
    var startX = -totalW / 2 + fw / 2;
    var ai;
    var gi;

    if (gap > 0.01 && aptCount > 1) {
      for (gi = 1; gi < aptCount; gi++) {
        var gx = startX + (gi - 1) * (fw + gap) + fw / 2 + gap / 2;
        parent.appendChild(
          el('a-box', {
            width: gap,
            height: bandH,
            depth: faceD,
            position: gx + ' 0 0',
            material: 'color: ' + floorColor + '; ' + mat,
          })
        );
      }
    }

    var edgePad = (faceW - totalW) / 2;
    if (edgePad > 0.01) {
      parent.appendChild(
        el('a-box', {
          width: edgePad,
          height: bandH,
          depth: faceD,
          position: -faceW / 2 + edgePad / 2 + ' 0 0',
          material: 'color: ' + floorColor + '; ' + mat,
        })
      );
      parent.appendChild(
        el('a-box', {
          width: edgePad,
          height: bandH,
          depth: faceD,
          position: faceW / 2 - edgePad / 2 + ' 0 0',
          material: 'color: ' + floorColor + '; ' + mat,
        })
      );
    }

    for (ai = 0; ai < aptCount; ai++) {
      var ax = startX + ai * (fw + gap);
      var isSelected = ai === hiApt;
      parent.appendChild(
        el('a-box', {
          width: fw,
          height: bandH,
          depth: faceD,
          position: ax + ' 0 0',
          material: 'color: ' + (isSelected ? '#fde047' : floorColor) + '; ' + mat,
        })
      );
    }

    addCubeFloorFacade(parent, faceW, faceD, bandH, fi === 0, fi === floorCount - 1, null, true);
    if (fi === 0) {
      addGroundFloorDoor(parent, faceW, faceD, bandH);
    }
  }

  /**
   * Build ordered list of room "slots" for one apartment on one floor.
   * @param {ApartmentTemplate} apt
   * @returns {Array<'bedroom'|'kitchen'|'bathroom'>}
   */
  function expandRoomTypes(apt) {
    var list = [];
    var i;
    var hw = typeof apt.hallways === 'number' ? apt.hallways : 0;
    var lr = typeof apt.livingRooms === 'number' ? apt.livingRooms : apt.living || 0;
    if (hw > 0 && lr < 1) lr = hw;
    for (i = 0; i < apt.bedrooms; i++) list.push('bedroom');
    for (i = 0; i < apt.kitchens; i++) list.push('kitchen');
    for (i = 0; i < apt.bathrooms; i++) list.push('bathroom');
    for (i = 0; i < lr; i++) list.push('living');
    if (list.length === 0) list.push('kitchen');
    return list;
  }

  /**
   * Pick a modest grid for N boxes inside a 2D footprint.
   * @param {number} n
   * @returns {{ cols: number, rows: number }}
   */
  function gridShape(n) {
    var cols = Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / clampMin(cols, 1));
    return { cols: cols, rows: rows };
  }

  /**
   * Creates interior blocks for all floors / apartments.
   * @param {Element} parent
   * @param {BuildingSpec} spec
   */
  function layoutGridValid(L) {
    if (!L || !L.cells || !L.gridCols || !L.gridRows) return false;
    if (L.cells.length !== L.gridRows) return false;
    var r;
    for (r = 0; r < L.cells.length; r++) {
      if (!L.cells[r] || L.cells[r].length !== L.gridCols) return false;
    }
    return true;
  }

  /**
   * @param {Element} parent
   * @param {BuildingSpec} spec
   * @param {{ gridCols: number, gridRows: number, cells: string[][] }} L
   */
  function addInteriorRoomsFromLayout(parent, spec, L) {
    var floorH = spec.height / clampMin(spec.floors, 1);
    var aptCount = clampMin(spec.apartments, 1);
    var aptWidthOuter = spec.width / aptCount;
    var cols = L.gridCols;
    var rows = L.gridRows;
    var pad = 0.04;

    var f;
    var a;
    for (f = 0; f < spec.floors; f++) {
      var floorBaseY = f * floorH;
      var midY = floorBaseY + floorH * 0.5;

      for (a = 0; a < aptCount; a++) {
        var aptX0 = -spec.width / 2 + a * aptWidthOuter + WALL_T;
        var aptX1 = -spec.width / 2 + (a + 1) * aptWidthOuter - WALL_T;
        var usableW = aptX1 - aptX0;
        var z0 = -spec.depth / 2 + WALL_T;
        var z1 = spec.depth / 2 - WALL_T;
        var usableD = z1 - z0;

        var cellW = (usableW - pad * (cols + 1)) / cols;
        var cellD = (usableD - pad * (rows + 1)) / rows;
        var cellH = Math.max(0.06, floorH * 0.55);

        var rr;
        var cc;
        for (rr = 0; rr < rows; rr++) {
          for (cc = 0; cc < cols; cc++) {
            var kind = L.cells[rr][cc];
            if (!kind) continue;
            var col = COLORS[kind] || '#cbd5e1';
            var cx = aptX0 + pad + (cc + 0.5) * cellW + cc * pad;
            var cz = z0 + pad + (rr + 0.5) * cellD + rr * pad;
            var czRoom = cz - 0.02;
            var box = el('a-box', {
              width: Math.max(0.05, cellW),
              height: cellH,
              depth: Math.max(0.05, cellD),
              position: cx + ' ' + midY + ' ' + czRoom,
              color: col,
              shader: 'flat',
              'data-room': kind,
            });
            parent.appendChild(box);
          }
        }
      }
    }
  }

  /** Fixed apartment template: labeled rooms, partition walls, no full building shell. */
  function addFixedSingleApartmentTemplate(parent, spec) {
    var floorH = spec.height / clampMin(spec.floors, 1);
    var aptCount = clampMin(spec.apartments, 1);
    var aptWidthOuter = spec.width / aptCount;
    var wt = WALL_T;
    var wallH = Math.max(0.35, floorH * 0.9);
    var slabT = 0.025;
    var floorY = 0;
    var wallCenterY = floorY + 0.02 + wallH / 2;
    var facadeBase = /^#[0-9a-fA-F]{6}$/.test(spec.facadeColor || '') ? spec.facadeColor : '#64748b';

    /** @type {Array<{ key: string, label: string, x0: number, x1: number, z0: number, z1: number }>} */
    var rooms = [
      { key: 'kitchen', label: 'Kitchen', x0: 0, x1: 0.36, z0: 0, z1: 0.32 },
      { key: 'entrance', label: 'Entrance', x0: 0.36, x1: 0.5, z0: 0, z1: 0.32 },
      { key: 'bathroom', label: 'Bathroom', x0: 0.5, x1: 1, z0: 0, z1: 0.32 },
      { key: 'living', label: 'Living room', x0: 0, x1: 0.66, z0: 0.32, z1: 1 },
      { key: 'bedroom', label: 'Bedroom', x0: 0.66, x1: 1, z0: 0.32, z1: 1 },
    ];

    function addIntWall(w, h, d, cx, cy, cz) {
      var wall = el('a-box', {
        width: w,
        height: h,
        depth: d,
        position: cx + ' ' + cy + ' ' + cz,
        material: 'color: #93c5fd; shader: flat; opacity: 0.88; transparent: true; side: double',
      });
      wall.classList.add('int-wall');
      parent.appendChild(wall);
    }

    var f;
    var a;
    for (f = 0; f < spec.floors; f++) {
      var floorBaseY = f * floorH;
      floorY = floorBaseY + 0.01;
      wallCenterY = floorY + 0.02 + wallH / 2;
      var labelY = floorBaseY + wallH + 0.12;

      for (a = 0; a < aptCount; a++) {
        var aptX0 = -spec.width / 2 + a * aptWidthOuter + wt;
        var aptX1 = -spec.width / 2 + (a + 1) * aptWidthOuter - wt;
        var usableW = aptX1 - aptX0;
        var z0 = -spec.depth / 2 + wt;
        var z1 = spec.depth / 2 - wt;
        var usableD = z1 - z0;

        var xLine1 = aptX0 + 0.36 * usableW;
        var xLine2 = aptX0 + 0.5 * usableW;
        var xLine3 = aptX0 + 0.66 * usableW;
        var zLine1 = z0 + 0.32 * usableD;

        var innerX0 = aptX0 + wt / 2;
        var innerX1 = aptX1 - wt / 2;
        var innerZ0 = z0 + wt / 2;
        var innerZ1 = z1 - wt / 2;

        var baseSlab = el('a-box', {
          class: 'clickable relocate-floor-hit',
          width: usableW,
          height: slabT,
          depth: usableD,
          position: (aptX0 + aptX1) / 2 + ' ' + (floorY + slabT / 2) + ' ' + (z0 + z1) / 2,
          material: 'color: #e2e8f0; shader: flat; opacity: 1; transparent: true; side: double',
        });
        baseSlab.dataset.innerX0 = String(innerX0);
        baseSlab.dataset.innerX1 = String(innerX1);
        baseSlab.dataset.innerZ0 = String(innerZ0);
        baseSlab.dataset.innerZ1 = String(innerZ1);
        parent.appendChild(baseSlab);

        var ri;
        for (ri = 0; ri < rooms.length; ri++) {
          var rm = rooms[ri];
          var xL = aptX0 + rm.x0 * usableW + wt * 0.35;
          var xR = aptX0 + rm.x1 * usableW - wt * 0.35;
          var zB = z0 + rm.z0 * usableD + wt * 0.35;
          var zF = z0 + rm.z1 * usableD - wt * 0.35;
          var bw = Math.max(0.08, xR - xL);
          var bd = Math.max(0.08, zF - zB);
          var cx = (xL + xR) / 2;
          var cz = (zB + zF) / 2;
          var col = COLORS[rm.key] || '#cbd5e1';

          var grp = el('a-entity', {
            class: 'room-cluster',
            'data-room-key': rm.key,
            position: cx + ' ' + floorY + ' ' + cz,
          });
          grp.dataset.halfW = String(bw / 2);
          grp.dataset.halfD = String(bd / 2);

          var slabMat = 'color: ' + col + '; opacity: 1; transparent: true; shader: flat; side: double';
          var slab = el('a-box', {
            width: bw,
            height: slabT,
            depth: bd,
            position: '0 ' + (slabT * 1.1) + ' 0',
            material: slabMat,
            'data-room': rm.key,
            'data-slab': '1',
            'data-base-color': col,
          });
          var tw = Math.min(Math.max(bw, bd) * 0.85, 3.2);
          var label = el('a-text', {
            value: rm.label,
            position: '0 ' + (labelY - floorY) + ' 0',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#0f172a',
            width: tw,
            wrapCount: 18,
          });

          var hitPad = el('a-plane', {
            class: 'clickable room-select-hit',
            width: bw,
            height: bd,
            position: '0 0.08 0',
            rotation: '-90 0 0',
            material: 'opacity: 0.001; transparent: true; shader: flat; side: double',
            'data-room-key': rm.key,
          });

          grp.appendChild(slab);
          grp.appendChild(label);
          grp.appendChild(hitPad);
          parent.appendChild(grp);
        }

        var topZ0 = innerZ0;
        var topZ1 = zLine1 - wt / 2;
        var dTop = Math.max(0.05, topZ1 - topZ0);
        var czTop = (topZ0 + topZ1) / 2;
        addIntWall(wt, wallH, dTop, xLine1, wallCenterY, czTop);
        addIntWall(wt, wallH, dTop, xLine2, wallCenterY, czTop);

        var botZ0 = zLine1 + wt / 2;
        var botZ1 = innerZ1;
        var dBot = Math.max(0.05, botZ1 - botZ0);
        var czBot = (botZ0 + botZ1) / 2;
        addIntWall(wt, wallH, dBot, xLine3, wallCenterY, czBot);

        var partW = Math.max(0.05, innerX1 - innerX0);
        var partX = (innerX0 + innerX1) / 2;
        addIntWall(partW, wallH, wt, partX, wallCenterY, zLine1);

        var backWall = el('a-box', {
          width: usableW,
          height: wallH,
          depth: wt,
          position: (aptX0 + aptX1) / 2 + ' ' + wallCenterY + ' ' + (z0 + wt / 2),
          shader: 'flat',
        });
        markExtWallGlass(backWall, facadeBase);
        parent.appendChild(backWall);

        var leftWall = el('a-box', {
          width: wt,
          height: wallH,
          depth: usableD,
          position: aptX0 + wt / 2 + ' ' + wallCenterY + ' ' + (z0 + z1) / 2,
          shader: 'flat',
        });
        markExtWallGlass(leftWall, tintHex(facadeBase, 0.08));
        parent.appendChild(leftWall);

        var rightWall = el('a-box', {
          width: wt,
          height: wallH,
          depth: usableD,
          position: aptX1 - wt / 2 + ' ' + wallCenterY + ' ' + (z0 + z1) / 2,
          shader: 'flat',
        });
        markExtWallGlass(rightWall, tintHex(facadeBase, 0.08));
        parent.appendChild(rightWall);

        var doorW = Math.min(1.05, Math.max(0.45, usableW * 0.16));
        var midX = (aptX0 + aptX1) / 2;
        var xDoorL = midX - doorW / 2;
        var xDoorR = midX + doorW / 2;
        var frontZ = z1 - wt / 2;
        var segLeftW = Math.max(0.05, xDoorL - aptX0 - wt);
        var segRightW = Math.max(0.05, aptX1 - wt - xDoorR);
        var segLX = aptX0 + wt / 2 + segLeftW / 2;
        var segRX = xDoorR + segRightW / 2;

        var frontL = el('a-box', {
          width: segLeftW,
          height: wallH,
          depth: wt,
          position: segLX + ' ' + wallCenterY + ' ' + frontZ,
          shader: 'flat',
        });
        markExtWallGlass(frontL, tintHex(facadeBase, -0.08));
        frontL.classList.add('cutaway-hide');
        frontL.dataset.apartmentFront = 'true';
        parent.appendChild(frontL);

        var frontR = el('a-box', {
          width: segRightW,
          height: wallH,
          depth: wt,
          position: segRX + ' ' + wallCenterY + ' ' + frontZ,
          shader: 'flat',
        });
        markExtWallGlass(frontR, tintHex(facadeBase, -0.08));
        frontR.classList.add('cutaway-hide');
        frontR.dataset.apartmentFront = 'true';
        parent.appendChild(frontR);

        var doorH = Math.min(wallH * 0.88, 1.05);
        var doorY = floorY + 0.02 + doorH / 2;
        var doorZOut = z1 + wt * 0.85;
        var doorAttrs = {
          class: 'clickable door-hot',
          'data-door-toggle': '1',
          width: doorW,
          height: doorH,
          depth: wt * 1.4,
          position: midX + ' ' + doorY + ' ' + doorZOut,
          color: '#ea580c',
          shader: 'flat',
        };
        if (a === 0 && f === 0) doorAttrs.id = 'door-visual';
        var door = el('a-box', doorAttrs);
        parent.appendChild(door);

        var hitAttrs = {
          class: 'clickable door-hot',
          'data-door-toggle': '1',
          width: Math.max(doorW * 2.5, 0.7),
          height: Math.max(doorH * 2.2, 0.85),
          position: midX + ' ' + doorY + ' ' + (doorZOut + 0.12),
          rotation: '-90 0 0',
          material: 'opacity: 0.001; transparent: true; shader: flat; side: double',
        };
        if (a === 0 && f === 0) hitAttrs.id = 'door-hit';
        var hitPad = el('a-plane', hitAttrs);
        parent.appendChild(hitPad);

        var frontHitZ = z1 + wt * 1.35;
        var fhAttrs = {
          class: 'clickable door-hot',
          'data-door-toggle': '1',
          width: usableW * 0.95,
          height: wallH * 0.95,
          position: (aptX0 + aptX1) / 2 + ' ' + wallCenterY + ' ' + frontHitZ,
          rotation: '-90 0 0',
          material: 'opacity: 0.04; transparent: true; shader: flat; side: double',
        };
        if (a === 0 && f === 0) fhAttrs.id = 'front-facade-hit';
        var frontHit = el('a-plane', fhAttrs);
        frontHit.classList.add('cutaway-hide');
        parent.appendChild(frontHit);
      }
    }
  }

  /**
   * First-floor footprint: two apartments, central hall, stairs at back of hall.
   * @param {number} W
   * @param {number} D
   * @returns {{ apt0: Object, apt1: Object, hall: Object, stairs: Object }}
   */
  function getFirstFloorLayout(W, D) {
    var hallFracW = 0.16;
    var stairFracD = 0.22;
    var hallW = W * hallFracW;
    var aptW = (W - hallW) / 2;
    var stairD = D * stairFracD;
    var hallX0 = -hallW / 2;
    var hallX1 = hallW / 2;
    return {
      apt0: { x0: -W / 2, x1: -W / 2 + aptW, z0: -D / 2, z1: D / 2 },
      apt1: { x0: W / 2 - aptW, x1: W / 2, z0: -D / 2, z1: D / 2 },
      hall: { x0: hallX0, x1: hallX1, z0: -D / 2, z1: D / 2 - stairD },
      stairs: { x0: hallX0, x1: hallX1, z0: D / 2 - stairD, z1: D / 2 },
    };
  }

  /** Room tints for grey-background 3D preview (reference floor-plan style). */
  var PREVIEW_COLORS = {
    kitchen: '#e8c872',
    entrance: '#d1d5db',
    bathroom: '#b8cfc0',
    living: '#c9a87c',
    bedroom: '#7e9cc4',
    hallway: '#94a3b8',
  };

  /** Saturated tints for top-down plan (each room easy to tell apart). */
  var PLAN_ROOM_COLORS = {
    kitchen: '#fbbf24',
    entrance: '#f1f5f9',
    bathroom: '#34d399',
    living: '#fb923c',
    bedroom: '#60a5fa',
    hallway: '#94a3b8',
  };

  var APT_CUBE_COLORS = [
    '#0ea5e9',
    '#6366f1',
    '#22c55e',
    '#f59e0b',
    '#ec4899',
    '#14b8a6',
    '#8b5cf6',
    '#ef4444',
    '#06b6d4',
    '#a855f7',
  ];

  function cubeFloorCount(spec) {
    return clampMin(spec.cubeFloors != null ? spec.cubeFloors : spec.floors, 1);
  }

  function cubeAptCount(spec) {
    return clampMin(spec.cubeApartments != null ? spec.cubeApartments : spec.apartments, 1);
  }

  function getApartmentZone(W, D, aptCount, aptIndex) {
    var aptW = W / aptCount;
    return {
      x0: -W / 2 + aptIndex * aptW,
      x1: -W / 2 + (aptIndex + 1) * aptW,
      z0: -D / 2,
      z1: D / 2,
    };
  }

  /** Normalized 0–1 rects for N room types on a simple grid. */
  function buildGridRooms(roomTypes) {
    var types = roomTypes && roomTypes.length ? roomTypes.slice() : ['kitchen'];
    var n = types.length;
    var shape = gridShape(n);
    var rooms = [];
    var idx = 0;
    var r;
    var c;
    for (r = 0; r < shape.rows; r++) {
      for (c = 0; c < shape.cols; c++) {
        if (idx >= n) break;
        rooms.push({
          key: types[idx],
          x0: c / shape.cols,
          x1: (c + 1) / shape.cols,
          z0: r / shape.rows,
          z1: (r + 1) / shape.rows,
        });
        idx++;
      }
    }
    return rooms;
  }

  function planRoomColor(key, slot) {
    var palette = PLAN_ROOM_COLORS[key] || PREVIEW_COLORS[key] || COLORS[key];
    if (palette) return palette;
    var hues = ['#facc15', '#4ade80', '#3b82f6', '#d97706', '#94a3b8', '#ec4899'];
    return hues[slot % hues.length];
  }

  function planFracEq(a, b, eps) {
    return Math.abs(a - b) < (eps != null ? eps : 0.01);
  }

  function largestLivingIndex(rooms) {
    var best = -1;
    var bestArea = 0;
    var i;
    for (i = 0; i < rooms.length; i++) {
      if (rooms[i].key !== 'living') continue;
      var area = (rooms[i].x1 - rooms[i].x0) * (rooms[i].z1 - rooms[i].z0);
      if (area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
    return best;
  }

  function planRoomId(rm) {
    return rm.key + '@' + rm.x0.toFixed(3) + ',' + rm.z0.toFixed(3);
  }

  function planEdgeId(edge) {
    if (edge.type === 'h') {
      return 'h|' + edge.u.toFixed(3) + '|' + edge.x0.toFixed(3) + ',' + edge.x1.toFixed(3);
    }
    return 'v|' + edge.u.toFixed(3) + '|' + edge.z0.toFixed(3) + ',' + edge.z1.toFixed(3);
  }

  /** Exactly one door per bedroom / bathroom / kitchen — always into living. */
  function edgeSpanNorm(edge) {
    return edge.type === 'h' ? edge.x1 - edge.x0 : edge.z1 - edge.z0;
  }

  function pickSatelliteDoorEdges(edges) {
    var allowed = {};
    var byRoom = {};
    var ei;
    for (ei = 0; ei < edges.length; ei++) {
      var edge = edges[ei];
      if (!planDoorAllowed(edge.keyA, edge.keyB)) continue;
      var satKey = edge.keyA === 'living' ? edge.keyB : edge.keyA;
      if (satKey === 'living') continue;
      var sat = edge.keyA === 'living' ? edge.b : edge.a;
      var rid = planRoomId(sat);
      if (!byRoom[rid]) byRoom[rid] = [];
      byRoom[rid].push(edge);
    }
    Object.keys(byRoom).forEach(function (rid) {
      var list = byRoom[rid];
      list.sort(function (a, b) {
        return edgeSpanNorm(b) - edgeSpanNorm(a);
      });
      allowed[planEdgeId(list[0])] = true;
    });
    return allowed;
  }

  /** Interior doors only between living and another room (never room-to-room). */
  function planDoorAllowed(keyA, keyB) {
    if (keyA === keyB) return false;
    return keyA === 'living' || keyB === 'living';
  }

  /** Normalized gap along a wall; null if the span is too short. */
  function planDoorFrac(spanNorm, usableSpan, fit, gapWorld) {
    var frac = gapWorld / (usableSpan * fit);
    if (frac > spanNorm * 0.88) frac = spanNorm * 0.88;
    if (spanNorm < frac + 0.018) return null;
    return frac;
  }

  /** Every door swings into the room it serves (kitchen/bed/bath), not the hallway. */
  function planDoorSwingInto(keyA, roomA, keyB, roomB) {
    if (keyA === 'kitchen' || keyB === 'kitchen') return keyA === 'kitchen' ? 'a' : 'b';
    if (keyA === 'bedroom' || keyB === 'bedroom') return keyA === 'bedroom' ? 'a' : 'b';
    if (keyA === 'bathroom' || keyB === 'bathroom') return keyA === 'bathroom' ? 'a' : 'b';
    if (keyA === 'living') return 'a';
    if (keyB === 'living') return 'b';
    var areaA = (roomA.x1 - roomA.x0) * (roomA.z1 - roomA.z0);
    var areaB = (roomB.x1 - roomB.x0) * (roomB.z1 - roomB.z0);
    return areaA >= areaB ? 'a' : 'b';
  }

  function planSwingRoom(edge, swingSide) {
    return swingSide === 'a' ? edge.a : edge.b;
  }

  /** Fixture keep-out zones (normalized plan coords) for door swing checks. */
  function planBathroomFixtureRects(rm) {
    var w = rm.x1 - rm.x0;
    var d = rm.z1 - rm.z0;
    var tall = d >= w;
    if (tall) {
      return [
        { x0: rm.x0 + w * 0.58, x1: rm.x1 - w * 0.04, z0: rm.z0 + d * 0.12, z1: rm.z0 + d * 0.88 },
        { x0: rm.x0 + w * 0.04, x1: rm.x0 + w * 0.42, z0: rm.z1 - d * 0.38, z1: rm.z1 - d * 0.04 },
        { x0: rm.x0 + w * 0.04, x1: rm.x0 + w * 0.42, z0: rm.z0 + d * 0.04, z1: rm.z0 + d * 0.22 },
      ];
    }
    return [
      { x0: rm.x0 + w * 0.12, x1: rm.x0 + w * 0.88, z0: rm.z0 + d * 0.04, z1: rm.z0 + d * 0.34 },
      { x0: rm.x1 - w * 0.38, x1: rm.x1 - w * 0.04, z0: rm.z1 - d * 0.38, z1: rm.z1 - d * 0.04 },
    ];
  }

  function planPointInRects(x, z, rects) {
    var i;
    for (i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
    }
    return false;
  }

  /**
   * Classic plan door: leaf perpendicular from hinge jamb; quarter arc from
   * opposite jamb to the leaf tip (they meet at the tip — see reference sketch).
   */
  function buildPlanDoorGeometry(hx, hz, wallType, wallU, room, hingeEnd, r) {
    var rcx = (room.x0 + room.x1) / 2;
    var rcz = (room.z0 + room.z1) / 2;
    var leafTip = { x: hx, z: hz };
    var farJamb = { x: hx, z: hz };
    var segs = 28;
    var arcPts = [];
    var aStart;
    var aEnd;
    var da;
    var i;
    var u;
    var a;

    if (wallType === 'h') {
      var intoPosZ = rcz > wallU;
      if (hingeEnd) {
        farJamb.x = hx - r;
      } else {
        farJamb.x = hx + r;
      }
      leafTip.x = hx;
      leafTip.z = intoPosZ ? hz + r : hz - r;
    } else {
      var intoPosX = rcx > wallU;
      if (hingeEnd) {
        farJamb.z = hz - r;
      } else {
        farJamb.z = hz + r;
      }
      leafTip.x = intoPosX ? hx + r : hx - r;
      leafTip.z = hz;
    }

    aStart = Math.atan2(farJamb.z - hz, farJamb.x - hx);
    aEnd = Math.atan2(leafTip.z - hz, leafTip.x - hx);
    da = aEnd - aStart;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da <= -Math.PI) da += Math.PI * 2;
    if (Math.abs(Math.abs(da) - Math.PI / 2) > 0.05) {
      da = (da >= 0 ? 1 : -1) * (Math.PI / 2);
    }

    for (i = 0; i <= segs; i++) {
      u = i / segs;
      a = aStart + da * u;
      arcPts.push({ x: hx + Math.cos(a) * r, z: hz + Math.sin(a) * r });
    }

    return {
      hinge: { x: hx, z: hz },
      leafTip: leafTip,
      farJamb: farJamb,
      arcPts: arcPts,
    };
  }

  function buildPlanDoorPoints(hx, hz, wallType, wallU, room, hingeEnd, r) {
    var g = buildPlanDoorGeometry(hx, hz, wallType, wallU, room, hingeEnd, r);
    return [g.hinge, g.leafTip].concat(g.arcPts);
  }

  function planDoorArcPointsNorm(edge, room, hingeEnd, mid, halfDoor, doorFrac) {
    var hx = edge.type === 'h' ? (hingeEnd ? mid + halfDoor : mid - halfDoor) : edge.u;
    var hz = edge.type === 'v' ? (hingeEnd ? mid + halfDoor : mid - halfDoor) : edge.u;
    return buildPlanDoorPoints(hx, hz, edge.type, edge.u, room, hingeEnd, doorFrac);
  }

  function planScoreDoorFixtureHits(edge, room, hingeEnd, mid, halfDoor, doorFrac, fixtures) {
    if (!fixtures.length) return 0;
    var pts = planDoorArcPointsNorm(edge, room, hingeEnd, mid, halfDoor, doorFrac);
    var hits = 0;
    var i;
    for (i = 0; i < pts.length; i++) {
      if (planPointInRects(pts[i].x, pts[i].z, fixtures)) hits++;
    }
    return hits;
  }

  /** Pick hinge jamb that keeps bathroom swing off fixtures; all others use bottom/left jamb. */
  function resolvePlanDoorHinges(plans) {
    var pi;
    for (pi = 0; pi < plans.length; pi++) {
      var plan = plans[pi];
      plan.hingeEnd = false;
      if (!plan.allowDoor) continue;

      var room = planSwingRoom(plan.edge, plan.swingSide);
      var fixtures = room.key === 'bathroom' ? planBathroomFixtureRects(room) : [];
      if (!fixtures.length) continue;

      var hitsStart = planScoreDoorFixtureHits(
        plan.edge,
        room,
        false,
        plan.mid,
        plan.halfDoor,
        plan.doorFrac,
        fixtures
      );
      var hitsEnd = planScoreDoorFixtureHits(
        plan.edge,
        room,
        true,
        plan.mid,
        plan.halfDoor,
        plan.doorFrac,
        fixtures
      );
      plan.hingeEnd = hitsEnd < hitsStart;
    }
  }

  function planEdgesMeetAtCorner(edgeH, edgeV, eps) {
    if (edgeH.type !== 'h' || edgeV.type !== 'v') return null;
    if (edgeV.u < edgeH.x0 - eps || edgeV.u > edgeH.x1 + eps) return null;
    if (edgeH.u < edgeV.z0 - eps || edgeH.u > edgeV.z1 + eps) return null;
    return { x: edgeV.u, z: edgeH.u };
  }

  function buildPlanDoorPlans(edges, satelliteDoors, usableW, usableD, fit, doorGapWorld) {
    var plans = [];
    var ei;
    for (ei = 0; ei < edges.length; ei++) {
      var edge = edges[ei];
      var allowDoor = !!satelliteDoors[planEdgeId(edge)];
      var swingSide = planDoorSwingInto(edge.keyA, edge.a, edge.keyB, edge.b);
      var span = edge.type === 'h' ? edge.x1 - edge.x0 : edge.z1 - edge.z0;
      var usableSpan = edge.type === 'h' ? usableW : usableD;
      var doorFrac = allowDoor ? planDoorFrac(span, usableSpan, fit, doorGapWorld) : null;
      if (doorFrac == null) allowDoor = false;
      var mid = edge.type === 'h' ? (edge.x0 + edge.x1) / 2 : (edge.z0 + edge.z1) / 2;
      var halfDoor = doorFrac != null ? doorFrac / 2 : 0;
      plans.push({
        edge: edge,
        allowDoor: allowDoor,
        swingSide: swingSide,
        doorFrac: doorFrac,
        mid: mid,
        halfDoor: halfDoor,
        hingeEnd: false,
      });
    }
    resolvePlanDoorHinges(plans);
    return plans;
  }

  /** Solid corner where horizontal + vertical walls meet. */
  function addPlanWallCorner(parent, nx, nz, aptX0, z0, usableW, usableD, fit, mx, mz, wallT, innerWallH, slabT, wallCol, mat) {
    parent.appendChild(
      el('a-box', {
        width: wallT,
        height: innerWallH,
        depth: wallT,
        position:
          mx(aptX0 + nx * usableW) +
          ' ' +
          (slabT + innerWallH * 0.5) +
          ' ' +
          mz(z0 + nz * usableD),
        material: 'color: ' + wallCol + '; ' + mat,
      })
    );
  }

  function collectPlanWallCorners(edges, eps) {
    var corners = {};
    var ei;
    var ej;
    for (ei = 0; ei < edges.length; ei++) {
      for (ej = ei + 1; ej < edges.length; ej++) {
        var c = planEdgesMeetAtCorner(edges[ei], edges[ej], eps);
        if (!c) c = planEdgesMeetAtCorner(edges[ej], edges[ei], eps);
        if (c) corners[c.x.toFixed(4) + '|' + c.z.toFixed(4)] = c;
      }
    }
    return corners;
  }

  /** Unique shared edges between room rectangles (normalized coords). */
  function collectPlanSharedEdges(rooms, eps) {
    var edges = [];
    var i;
    var j;
    for (i = 0; i < rooms.length; i++) {
      for (j = i + 1; j < rooms.length; j++) {
        var ri = rooms[i];
        var rj = rooms[j];
        var x0;
        var x1;
        var z0;
        var z1;
        if (planFracEq(ri.z0, rj.z1, eps)) {
          x0 = Math.max(ri.x0, rj.x0);
          x1 = Math.min(ri.x1, rj.x1);
          if (x1 - x0 > 0.01) {
            edges.push({ type: 'h', u: ri.z0, x0: x0, x1: x1, a: ri, b: rj, keyA: ri.key, keyB: rj.key });
          }
        } else if (planFracEq(ri.z1, rj.z0, eps)) {
          x0 = Math.max(ri.x0, rj.x0);
          x1 = Math.min(ri.x1, rj.x1);
          if (x1 - x0 > 0.01) {
            edges.push({ type: 'h', u: ri.z1, x0: x0, x1: x1, a: ri, b: rj, keyA: ri.key, keyB: rj.key });
          }
        }
        if (planFracEq(ri.x0, rj.x1, eps)) {
          z0 = Math.max(ri.z0, rj.z0);
          z1 = Math.min(ri.z1, rj.z1);
          if (z1 - z0 > 0.01) {
            edges.push({ type: 'v', u: ri.x0, z0: z0, z1: z1, a: ri, b: rj, keyA: ri.key, keyB: rj.key });
          }
        } else if (planFracEq(ri.x1, rj.x0, eps)) {
          z0 = Math.max(ri.z0, rj.z0);
          z1 = Math.min(ri.z1, rj.z1);
          if (z1 - z0 > 0.01) {
            edges.push({ type: 'v', u: ri.x1, z0: z0, z1: z1, a: ri, b: rj, keyA: ri.key, keyB: rj.key });
          }
        }
      }
    }
    return edges.filter(function (edge) {
      if (edge.keyA === 'living' && edge.keyB === 'living') return false;
      return true;
    });
  }

  /** Interior walls with door gaps + swing symbols where rules allow. */
  function addPlanSegmentWalls(parent, rooms, aptX0, z0, usableW, usableD, fit, mx, mz, wallT, innerWallH, slabT, wallCol, mat, doorSymY) {
    var eps = 0.012;
    var edges = collectPlanSharedEdges(rooms, eps);
    var satelliteDoors = pickSatelliteDoorEdges(edges);
    var doorGapWorld = 0.11;
    var wallOverlap = wallT * 0.58;
    var plans = buildPlanDoorPlans(edges, satelliteDoors, usableW, usableD, fit, doorGapWorld);
    var cornerMap = collectPlanWallCorners(edges, eps);
    var pi;

    function wallHBox(x0n, x1n, zn) {
      if (x1n - x0n < 0.008) return;
      var xL = aptX0 + x0n * usableW;
      var xR = aptX0 + x1n * usableW;
      var zW = z0 + zn * usableD;
      var w = (xR - xL) * fit + wallOverlap;
      parent.appendChild(
        el('a-box', {
          width: Math.max(0.02, w),
          height: innerWallH,
          depth: wallT,
          position: mx((xL + xR) / 2) + ' ' + (slabT + innerWallH * 0.5) + ' ' + mz(zW),
          material: 'color: ' + wallCol + '; ' + mat,
        })
      );
    }

    function wallVBox(xn, z0n, z1n) {
      if (z1n - z0n < 0.008) return;
      var zL = z0 + z0n * usableD;
      var zR = z0 + z1n * usableD;
      var d = (zR - zL) * fit + wallOverlap;
      parent.appendChild(
        el('a-box', {
          width: wallT,
          height: innerWallH,
          depth: Math.max(0.02, d),
          position: mx(aptX0 + xn * usableW) + ' ' + (slabT + innerWallH * 0.5) + ' ' + mz((zL + zR) / 2),
          material: 'color: ' + wallCol + '; ' + mat,
        })
      );
    }

    for (pi = 0; pi < plans.length; pi++) {
      var plan = plans[pi];
      var edge = plan.edge;
      var mid = plan.mid;
      var halfDoor = plan.halfDoor;

      if (edge.type === 'h') {
        if (plan.allowDoor && plan.doorFrac != null) {
          wallHBox(edge.x0, mid - halfDoor, edge.u);
          wallHBox(mid + halfDoor, edge.x1, edge.u);
          addPlanDoorAtHinge(
            parent,
            mx(aptX0 + (plan.hingeEnd ? mid + halfDoor : mid - halfDoor) * usableW),
            mz(z0 + edge.u * usableD),
            'h',
            edge.u,
            planSwingRoom(edge, plan.swingSide),
            plan.hingeEnd,
            doorGapWorld,
            doorSymY
          );
        } else {
          wallHBox(edge.x0, edge.x1, edge.u);
        }
      } else if (plan.allowDoor && plan.doorFrac != null) {
        wallVBox(edge.u, edge.z0, mid - halfDoor);
        wallVBox(edge.u, mid + halfDoor, edge.z1);
        addPlanDoorAtHinge(
          parent,
          mx(aptX0 + edge.u * usableW),
          mz(z0 + (plan.hingeEnd ? mid + halfDoor : mid - halfDoor) * usableD),
          'v',
          edge.u,
          planSwingRoom(edge, plan.swingSide),
          plan.hingeEnd,
          doorGapWorld,
          doorSymY
        );
      } else {
        wallVBox(edge.u, edge.z0, edge.z1);
      }
    }

    Object.keys(cornerMap).forEach(function (key) {
      var c = cornerMap[key];
      addPlanWallCorner(
        parent,
        c.x,
        c.z,
        aptX0,
        z0,
        usableW,
        usableD,
        fit,
        mx,
        mz,
        wallT,
        innerWallH,
        slabT,
        wallCol,
        mat
      );
    });
  }

  var APT_CUBE_COLOR = '#93c5fd';
  var APT_CUBE_HIGHLIGHT = '#38bdf8';
  var APT_CUBE_OUTLINE = '#fbbf24';

  function aptCubeColor(index) {
    return APT_CUBE_COLORS[index % APT_CUBE_COLORS.length];
  }

  function aptPickerMaterial(isPicked, isDimmed, mat) {
    var col = isPicked ? APT_CUBE_HIGHLIGHT : APT_CUBE_COLOR;
    var m = 'color: ' + col + '; ' + mat;
    if (isDimmed) m += '; opacity: 0.45; transparent: true';
    return m;
  }

  function planRoomDisplayName(key, indexInType, narrow) {
    if (key === 'kitchen') return 'Kitchen';
    if (key === 'living') return 'Living room';
    if (key === 'entrance') return 'Entrance';
    if (key === 'bathroom') {
      return 'Bathroom ' + (indexInType + 1);
    }
    return 'Bedroom ' + (indexInType + 1);
  }

  function addPlanFlatPlane(grp, w, d, x, z, y, color) {
    grp.appendChild(
      el('a-plane', {
        width: Math.max(0.02, w),
        height: Math.max(0.02, d),
        rotation: '-90 0 0',
        position: x + ' ' + y + ' ' + z,
        material: 'color: ' + color + '; shader: flat; side: double; polygonOffset: true; polygonOffsetFactor: -3',
      })
    );
  }

  function addPlanRoomLabel(grp, text, bw, bd, narrow, key) {
    var tw = narrow
      ? Math.min(Math.max(bw, bd) * 2.4, 1.05)
      : Math.min(Math.max(bw, bd) * 0.92, 1.45);
    if (key === 'kitchen' || key === 'living') {
      tw = Math.min(Math.max(bw, bd) * 0.95, 1.5);
    }
    grp.appendChild(
      el('a-text', {
        value: text,
        rotation: '-90 0 0',
        position: '0 0.038 0',
        align: 'center',
        anchor: 'center',
        baseline: 'center',
        color: '#0f172a',
        width: Math.max(0.32, tw),
        wrapCount: narrow ? 10 : 18,
      })
    );
  }

  function addPlanCircle(grp, r, x, z, y, color) {
    grp.appendChild(
      el('a-cylinder', {
        radius: Math.max(0.01, r),
        height: 0.005,
        position: x + ' ' + y + ' ' + z,
        material: 'color: ' + color + '; shader: flat; side: double',
        'open-ended': false,
      })
    );
  }

  var PLAN_DOOR_SYM_THICK = 0.022;
  var PLAN_DOOR_SYM_COLOR = '#111827';

  /** Flat plan line — same renderer for leaf and arc so they always connect. */
  function addPlanLineSegment(parent, x0, z0, x1, z1, thick, y, color) {
    var dx = x1 - x0;
    var dz = z1 - z0;
    var len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.003) return;
    var cx = (x0 + x1) / 2;
    var cz = (z0 + z1) / 2;
    var lineYaw = (Math.atan2(-dz, dx) * 180) / Math.PI;
    parent.appendChild(
      el('a-plane', {
        width: len,
        height: thick,
        rotation: '-90 0 ' + lineYaw,
        position: cx + ' ' + y + ' ' + cz,
        material:
          'color: ' +
          color +
          '; shader: flat; side: double; polygonOffset: true; polygonOffsetFactor: -4',
      })
    );
  }

  /** Leaf (hinge → tip) + arc (far jamb → tip), meeting at the tip. */
  function addPlanDoorSymbol(parent, hx, hz, wallType, wallU, room, hingeEnd, r, thick, y, color) {
    var g = buildPlanDoorGeometry(hx, hz, wallType, wallU, room, hingeEnd, r);
    var i;
    addPlanLineSegment(parent, g.hinge.x, g.hinge.z, g.leafTip.x, g.leafTip.z, thick, y, color);
    for (i = 0; i < g.arcPts.length - 1; i++) {
      addPlanLineSegment(
        parent,
        g.arcPts[i].x,
        g.arcPts[i].z,
        g.arcPts[i + 1].x,
        g.arcPts[i + 1].z,
        thick,
        y,
        color
      );
    }
  }

  function addPlanDoorAtHinge(parent, hx, hz, wallType, wallU, targetRoom, hingeEnd, gapWorld, y) {
    addPlanDoorSymbol(
      parent,
      hx,
      hz,
      wallType,
      wallU,
      targetRoom,
      !!hingeEnd,
      gapWorld,
      PLAN_DOOR_SYM_THICK,
      y,
      PLAN_DOOR_SYM_COLOR
    );
  }

  /** Entrance — swings into the apartment (living room side). */
  function addPlanEntranceSymbol(parent, px, pz, side, gapWorld, y, livingRoom) {
    var wallU = side === 'right' ? 1 : 0;
    var room = livingRoom || { x0: side === 'right' ? 0 : 0, x1: side === 'right' ? 1 : 1, z0: 0, z1: 0.5 };
    addPlanDoorAtHinge(parent, px, pz - gapWorld / 2, 'v', wallU, room, false, gapWorld, y);
  }

  /** Perimeter wall with a gap at the entrance (world coords). */
  function addPlanOuterWallWithEntrance(parent, side, px, pz, gapWorld, mW, mD, mx, mz, aptX0, z0, z1, wallT, outerWallH, slabT, wallCol, mat) {
    var wh = outerWallH;
    var halfGap = gapWorld / 2;

    function planWall(w, d, ppx, ppz) {
      parent.appendChild(
        el('a-box', {
          width: Math.max(0.02, w),
          height: wh,
          depth: Math.max(0.02, d),
          position: ppx + ' ' + (slabT + wh * 0.5) + ' ' + ppz,
          material: 'color: ' + wallCol + '; shader: flat',
        })
      );
    }

    if (side === 'right' || side === 'left') {
      var xWall = px;
      var zBack = mz(z0);
      var zFront = mz(z1);
      var segA = pz - zBack - halfGap;
      var segB = zFront - pz - halfGap;
      if (segA > 0.02) {
        planWall(wallT, segA, xWall, zBack + segA / 2);
      }
      if (segB > 0.02) {
        planWall(wallT, segB, xWall, pz + halfGap + segB / 2);
      }
    }
  }

  /** Living room on the entrance wall — door always opens into living. */
  function findEntranceAnchor(rooms, side, z0, usableD, mx, mz, aptX0, aptX1) {
    var eps = 0.04;
    var i;
    var rm;
    var best = null;
    var bestArea = 0;
    for (i = 0; i < rooms.length; i++) {
      rm = rooms[i];
      if (rm.key !== 'living') continue;
      if (side === 'right' && rm.x1 < 1 - eps) continue;
      if (side === 'left' && rm.x0 > eps) continue;
      var area = (rm.x1 - rm.x0) * (rm.z1 - rm.z0);
      if (area > bestArea) {
        bestArea = area;
        best = rm;
      }
    }
    if (!best) {
      var li = largestLivingIndex(rooms);
      best = li >= 0 ? rooms[li] : null;
    }
    var zMid = best ? (best.z0 + best.z1) / 2 : 0.5;
    var px = side === 'right' ? mx(aptX1) : mx(aptX0);
    var pz = mz(z0 + zMid * usableD);
    return { px: px, pz: pz, room: best };
  }

  function planRoomEdgeInset(rm, baseInset) {
    return {
      x0: rm.x0 <= 0.012 ? 0 : baseInset,
      x1: rm.x1 >= 0.988 ? 0 : baseInset,
      z0: rm.z0 <= 0.012 ? 0 : baseInset,
      z1: rm.z1 >= 0.988 ? 0 : baseInset,
    };
  }

  /** Area-weighted center of all living rectangles (for icon placement). */
  function livingCentroidWorld(rooms, aptX0, z0, usableW, usableD, mx, mz) {
    var sumA = 0;
    var sumX = 0;
    var sumZ = 0;
    var i;
    for (i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (r.key !== 'living') continue;
      var a = (r.x1 - r.x0) * (r.z1 - r.z0);
      var cx = aptX0 + ((r.x0 + r.x1) / 2) * usableW;
      var cz = z0 + ((r.z0 + r.z1) / 2) * usableD;
      sumA += a;
      sumX += cx * a;
      sumZ += cz * a;
    }
    if (sumA < 0.0001) {
      return {
        px: mx(aptX0 + usableW * 0.5),
        pz: mz(z0 + usableD * 0.5),
        normArea: 0.25,
      };
    }
    return {
      px: mx(sumX / sumA),
      pz: mz(sumZ / sumA),
      normArea: sumA,
    };
  }

  /**
   * bw = room width (A-Frame units), bd = room depth (A-Frame units).
   * Icons are drawn small enough to leave space for the label below.
   * y layers: floor=0.022, objects=0.025, detail=0.028
   */
  function addPlanRoomIcon(grp, key, bw, bd, opts) {
    opts = opts || {};
    var y0 = 0.022;
    var y1 = 0.025;
    var y2 = 0.028;
    var s = Math.min(bw, bd);
    var iconZ = opts.center ? 0 : -bd * 0.10;

    /* ── BEDROOM ── top-down bed: mattress + headboard + two pillows */
    if (key === 'bedroom') {
      var bW = Math.min(bw * 0.60, s * 0.72);
      var bD = Math.min(bd * 0.50, s * 0.80);
      /* mattress */
      addPlanFlatPlane(grp, bW, bD, 0, iconZ, y0, '#d1d5db');
      /* headboard (top) */
      addPlanFlatPlane(grp, bW, bD * 0.14, 0, iconZ - bD * 0.43, y1, '#374151');
      /* duvet fold line (horizontal stripe near foot) */
      addPlanFlatPlane(grp, bW * 0.88, bD * 0.06, 0, iconZ + bD * 0.32, y1, '#9ca3af');
      /* left pillow */
      addPlanFlatPlane(grp, bW * 0.36, bD * 0.18, -bW * 0.18, iconZ - bD * 0.22, y2, '#f9fafb');
      /* right pillow */
      addPlanFlatPlane(grp, bW * 0.36, bD * 0.18, bW * 0.18, iconZ - bD * 0.22, y2, '#f9fafb');
      return;
    }

    /* ── BATHROOM ── bathtub + toilet + sink (top-down blueprint style) */
    if (key === 'bathroom') {
      var bS = Math.min(bw, bd);
      var tall = bd >= bw;
      var wallPadX = bw * 0.08;
      var wallPadZ = bd * 0.08;

      if (tall) {
        var tubWv = Math.max(bw * 0.26, bS * 0.35);
        var tubDv = Math.min(bd * 0.58, bS * 1.05);
        var tubXv = bw / 2 - wallPadX - tubWv / 2;
        var tubZv = iconZ - bd * 0.04;
        /* tub on right wall — clear of inward door swing from hallway */
        addPlanFlatPlane(grp, tubWv, tubDv, tubXv, tubZv, y0, '#94a3b8');
        addPlanFlatPlane(grp, tubWv * 0.76, tubDv * 0.78, tubXv, tubZv, y1, '#e2e8f0');
        addPlanCircle(grp, tubWv * 0.08, tubXv, tubZv - tubDv * 0.26, y2, '#64748b');

        /* sink top-left (away from tub / door side) */
        var sinkWv = Math.max(bw * 0.2, bS * 0.24);
        var sinkDv = Math.max(bd * 0.08, bS * 0.12);
        var sinkXv = -bw / 2 + wallPadX + sinkWv / 2;
        var sinkZv = -bd / 2 + wallPadZ + sinkDv * 0.85;
        addPlanFlatPlane(grp, sinkWv, sinkDv, sinkXv, sinkZv, y1, '#cbd5e1');
        addPlanCircle(grp, sinkWv * 0.10, sinkXv, sinkZv, y2, '#64748b');

        /* toilet bottom-left */
        var wcXv = -bw / 2 + wallPadX + bS * 0.14;
        var wcZv = bd / 2 - wallPadZ - bS * 0.12;
        addPlanCircle(grp, bS * 0.14, wcXv, wcZv, y1, '#cbd5e1');
        addPlanFlatPlane(grp, bS * 0.24, bS * 0.10, wcXv, wcZv - bS * 0.22, y1, '#94a3b8');
      } else {
        var tubWh = Math.min(bw * 0.58, bS * 1.05);
        var tubDh = Math.max(bd * 0.26, bS * 0.35);
        var tubXh = 0;
        var tubZh = -bd / 2 + wallPadZ + tubDh / 2;
        /* tub against top wall */
        addPlanFlatPlane(grp, tubWh, tubDh, tubXh, tubZh, y0, '#94a3b8');
        addPlanFlatPlane(grp, tubWh * 0.78, tubDh * 0.76, tubXh, tubZh, y1, '#e2e8f0');
        addPlanCircle(grp, tubDh * 0.12, tubXh, tubZh, y2, '#64748b');

        /* sink near top-right wall */
        var sinkWh = Math.max(bw * 0.14, bS * 0.2);
        var sinkDh = Math.max(bd * 0.14, bS * 0.2);
        var sinkXh = bw / 2 - wallPadX - sinkWh / 2;
        var sinkZh = -bd / 2 + wallPadZ + sinkDh / 2;
        addPlanFlatPlane(grp, sinkWh, sinkDh, sinkXh, sinkZh, y1, '#cbd5e1');
        addPlanCircle(grp, sinkWh * 0.10, sinkXh, sinkZh, y2, '#64748b');

        /* toilet near bottom-right wall */
        var wcXh = bw / 2 - wallPadX - bS * 0.14;
        var wcZh = bd / 2 - wallPadZ - bS * 0.14;
        addPlanCircle(grp, bS * 0.14, wcXh, wcZh, y1, '#cbd5e1');
        addPlanFlatPlane(grp, bS * 0.24, bS * 0.10, wcXh, wcZh - bS * 0.22, y1, '#94a3b8');
      }
      return;
    }

    /* ── KITCHEN ── L/U-shape counters along walls + stove circles + sink */
    if (key === 'kitchen') {
      var kW = Math.min(bw * 0.82, s * 0.90);
      var kD = Math.min(bd * 0.70, s * 0.90);
      var cT = kW * 0.13; /* counter thickness */
      /* top counter */
      addPlanFlatPlane(grp, kW, cT, 0, iconZ - kD * 0.44, y0, '#a8a29e');
      /* left counter */
      addPlanFlatPlane(grp, cT, kD * 0.78, -kW * 0.44, iconZ, y0, '#a8a29e');
      /* bottom counter */
      addPlanFlatPlane(grp, kW * 0.55, cT, -kW * 0.22, iconZ + kD * 0.44, y0, '#a8a29e');

      /* stove: 4 burner circles on top counter */
      var bR = cT * 0.28;
      addPlanCircle(grp, bR, -kW * 0.18, iconZ - kD * 0.44, y1, '#1c1917');
      addPlanCircle(grp, bR, -kW * 0.06, iconZ - kD * 0.44, y1, '#1c1917');
      addPlanCircle(grp, bR, kW * 0.10, iconZ - kD * 0.44, y1, '#1c1917');
      addPlanCircle(grp, bR, kW * 0.22, iconZ - kD * 0.44, y1, '#1c1917');

      /* sink on left counter */
      addPlanFlatPlane(grp, cT * 0.70, kD * 0.18, -kW * 0.44, iconZ - kD * 0.15, y1, '#e7e5e4');
      addPlanCircle(grp, cT * 0.12, -kW * 0.44, iconZ - kD * 0.15, y2, '#64748b');
      return;
    }

    /* ── LIVING ROOM ── sofa (L-shape) + coffee table + two armchairs */
    if (key === 'living') {
      var lW = Math.min(bw * 0.80, s * 0.88);
      var lD = Math.min(bd * 0.70, s * 0.88);

      /* main sofa (bottom, facing up) */
      addPlanFlatPlane(grp, lW * 0.70, lD * 0.18, 0, iconZ + lD * 0.32, y0, '#475569');
      /* sofa back */
      addPlanFlatPlane(grp, lW * 0.70, lD * 0.05, 0, iconZ + lD * 0.41, y1, '#334155');

      /* left armchair */
      addPlanFlatPlane(grp, lW * 0.22, lD * 0.22, -lW * 0.28, iconZ + lD * 0.06, y0, '#64748b');
      addPlanFlatPlane(grp, lW * 0.22, lD * 0.05, -lW * 0.28, iconZ + lD * 0.16, y1, '#475569');

      /* right armchair */
      addPlanFlatPlane(grp, lW * 0.22, lD * 0.22, lW * 0.28, iconZ + lD * 0.06, y0, '#64748b');
      addPlanFlatPlane(grp, lW * 0.22, lD * 0.05, lW * 0.28, iconZ + lD * 0.16, y1, '#475569');

      /* coffee table */
      addPlanFlatPlane(grp, lW * 0.36, lD * 0.22, 0, iconZ - lD * 0.06, y0, '#92400e');
      /* TV unit (top wall) */
      addPlanFlatPlane(grp, lW * 0.55, lD * 0.08, 0, iconZ - lD * 0.38, y0, '#1e293b');
      /* TV screen */
      addPlanFlatPlane(grp, lW * 0.42, lD * 0.04, 0, iconZ - lD * 0.38, y1, '#334155');
      return;
    }
  }

  /** Merge nearly-equal layout edges so we don't stack duplicate walls. */
  function mergeWallFracs(rooms, axis) {
    var set = {};
    var i;
    var rm;
    for (i = 0; i < rooms.length; i++) {
      rm = rooms[i];
      if (axis === 'x') {
        if (rm.x0 > 0.001) set[String(rm.x0)] = true;
        if (rm.x1 < 0.999) set[String(rm.x1)] = true;
      } else {
        if (rm.z0 > 0.001) set[String(rm.z0)] = true;
        if (rm.z1 < 0.999) set[String(rm.z1)] = true;
      }
    }
    var arr = Object.keys(set)
      .map(parseFloat)
      .sort(function (a, b) {
        return a - b;
      });
    var merged = [];
    for (i = 0; i < arr.length; i++) {
      if (!merged.length || arr[i] - merged[merged.length - 1] > 0.03) {
        merged.push(arr[i]);
      } else {
        merged[merged.length - 1] = (merged[merged.length - 1] + arr[i]) / 2;
      }
    }
    return merged;
  }

  /**
   * Top-down floor plan for one apartment (bird's eye).
   * @param {Element} parent
   * @param {BuildingSpec} spec
   * @param {number} aptIndex
   */
  function addBirdseyeApartmentPreview(parent, spec, aptIndex) {
    var mat = 'shader: flat';
    var slabT = 0.05;
    var wallT = 0.065;
    var outerWallH = 0.16;
    var innerWallH = 0.12;
    var wallCol = '#020617';
    var planFit = 3.2;
    var roomY = slabT + 0.012;
    var roomInset = wallT * 0.35;
    var W = Math.max(spec.width || 4, 2);
    var D = Math.max(spec.depth || 4, 2);
    var aptCount = cubeAptCount(spec);
    var zone = getApartmentZone(W, D, aptCount, aptIndex);
    var wt = 0.05;
    var aptX0 = zone.x0 + wt;
    var aptX1 = zone.x1 - wt;
    var z0 = zone.z0 + wt;
    var z1 = zone.z1 - wt;
    var usableW = aptX1 - aptX0;
    var usableD = z1 - z0;
    var cx = (aptX0 + aptX1) / 2;
    var cz = (z0 + z1) / 2;
    var fit = planFit / Math.max(usableW, usableD, 0.5);

    function mx(x) {
      return (x - cx) * fit;
    }
    function mz(z) {
      return (z - cz) * fit;
    }

    var apt = spec.apartment || {};
    var entranceSide = aptIndex % 2 === 1 ? 'left' : 'right';
    var rooms =
      window.ApartmentPlanTemplates && window.ApartmentPlanTemplates.getApartmentPlanRooms
        ? window.ApartmentPlanTemplates.getApartmentPlanRooms(apt, {
            mirror: entranceSide === 'left',
          })
        : null;
    if (!rooms) {
      rooms = buildGridRooms(expandRoomTypes(apt));
    }

    var mW = usableW * fit;
    var mD = usableD * fit;
    var innerX0 = -mW / 2 + wallT;
    var innerX1 = mW / 2 - wallT;
    var innerZ0 = -mD / 2 + wallT;
    var innerZ1 = mD / 2 - wallT;

    var floorHit = el('a-box', {
      class: 'clickable relocate-floor-hit',
      width: mW,
      height: slabT,
      depth: mD,
      position: '0 ' + slabT / 2 + ' 0',
      material: 'color: #e2e8f0; shader: flat',
    });
    floorHit.dataset.innerX0 = String(innerX0);
    floorHit.dataset.innerX1 = String(innerX1);
    floorHit.dataset.innerZ0 = String(innerZ0);
    floorHit.dataset.innerZ1 = String(innerZ1);
    parent.appendChild(floorHit);

    function planWall(w, d, px, pz, h) {
      var wh = h != null ? h : outerWallH;
      parent.appendChild(
        el('a-box', {
          width: Math.max(0.02, w),
          height: wh,
          depth: Math.max(0.02, d),
          position: px + ' ' + (slabT + wh * 0.5) + ' ' + pz,
          material: 'color: ' + wallCol + '; ' + mat,
        })
      );
    }

    var ri;
    var doorSymY = slabT + outerWallH + 0.018;
    addPlanSegmentWalls(
      parent,
      rooms,
      aptX0,
      z0,
      usableW,
      usableD,
      fit,
      mx,
      mz,
      wallT,
      innerWallH,
      slabT,
      wallCol,
      mat,
      doorSymY
    );

    var entranceAnchor = findEntranceAnchor(rooms, entranceSide, z0, usableD, mx, mz, aptX0, aptX1);
    var entranceGap = 0.11;
    var innerLeft = mx(aptX0);
    var innerRight = mx(aptX1);
    var innerBack = mz(z0);
    var innerFront = mz(z1);

    planWall(mW, wallT, 0, innerBack, outerWallH);
    planWall(mW, wallT, 0, innerFront, outerWallH);
    if (entranceSide === 'right') {
      planWall(wallT, mD + wallT, innerLeft, 0, outerWallH);
      addPlanOuterWallWithEntrance(
        parent,
        'right',
        innerRight,
        entranceAnchor.pz,
        entranceGap,
        mW,
        mD,
        mx,
        mz,
        aptX0,
        z0,
        z1,
        wallT,
        outerWallH,
        slabT,
        wallCol,
        mat
      );
    } else {
      planWall(wallT, mD + wallT, innerRight, 0, outerWallH);
      addPlanOuterWallWithEntrance(
        parent,
        'left',
        innerLeft,
        entranceAnchor.pz,
        entranceGap,
        mW,
        mD,
        mx,
        mz,
        aptX0,
        z0,
        z1,
        wallT,
        outerWallH,
        slabT,
        wallCol,
        mat
      );
    }

    planWall(wallT, wallT, innerLeft, innerBack, outerWallH);
    planWall(wallT, wallT, innerRight, innerBack, outerWallH);
    planWall(wallT, wallT, innerLeft, innerFront, outerWallH);
    planWall(wallT, wallT, innerRight, innerFront, outerWallH);

    addPlanEntranceSymbol(
      parent,
      entranceAnchor.px,
      entranceAnchor.pz,
      entranceSide,
      entranceGap,
      doorSymY,
      entranceAnchor.room
    );

    var primaryLivingIdx = -1;
    var primaryLivingArea = 0;
    for (ri = 0; ri < rooms.length; ri++) {
      if (rooms[ri].key !== 'living') continue;
      var area = (rooms[ri].x1 - rooms[ri].x0) * (rooms[ri].z1 - rooms[ri].z0);
      if (area > primaryLivingArea) {
        primaryLivingArea = area;
        primaryLivingIdx = ri;
      }
    }

    /* Full interior orange slab — edge-to-edge so grey floor never shows in gaps. */
    var livingCol = planRoomColor('living', 0);
    parent.appendChild(
      el('a-plane', {
        width: Math.max(0.08, mW),
        height: Math.max(0.08, mD),
        rotation: '-90 0 0',
        position: '0 ' + (roomY - 0.003) + ' 0',
        material:
          'color: ' +
          livingCol +
          '; shader: flat; side: double; polygonOffset: true; polygonOffsetFactor: -3',
      })
    );

    var keyCounts = {};
    for (ri = 0; ri < rooms.length; ri++) {
      var rm = rooms[ri];
      var renderKey = rm.key;
      if (renderKey === 'living') continue;
      var narrow = rm.z1 - rm.z0 <= 0.22 || rm.x1 - rm.x0 <= 0.22;
      var edgeInset = planRoomEdgeInset(rm, narrow ? wallT * 0.12 : roomInset * 0.45);
      var xL = aptX0 + rm.x0 * usableW + edgeInset.x0;
      var xR = aptX0 + rm.x1 * usableW - edgeInset.x1;
      var zB = z0 + rm.z0 * usableD + edgeInset.z0;
      var zF = z0 + rm.z1 * usableD - edgeInset.z1;
      var bw = Math.max(0.08, (xR - xL) * fit);
      var bd = Math.max(0.08, (zF - zB) * fit);
      var rcx = mx((xL + xR) / 2);
      var rcz = mz((zB + zF) / 2);
      var col = planRoomColor(renderKey, ri);
      var roomId = rm.key + '-' + ri;
      var typeIdx = keyCounts[renderKey] || 0;
      keyCounts[renderKey] = typeIdx + 1;
      var displayName = planRoomDisplayName(renderKey, typeIdx, narrow);

      var grp = el('a-entity', {
        class: 'room-cluster',
        'data-room-key': renderKey,
        position: rcx + ' ' + roomY + ' ' + rcz,
      });
      grp.dataset.halfW = String(bw / 2);
      grp.dataset.halfD = String(bd / 2);

      grp.appendChild(
        el('a-plane', {
          width: bw,
          height: bd,
          rotation: '-90 0 0',
          material: 'color: ' + col + '; shader: flat; side: double; polygonOffset: true; polygonOffsetFactor: -1',
          'data-room': roomId,
          'data-slab': '1',
          'data-base-color': col,
        })
      );
      addPlanRoomIcon(grp, renderKey, bw, bd);
      addPlanRoomLabel(grp, displayName, bw, bd, narrow, renderKey);
      grp.appendChild(
        el('a-plane', {
          class: 'clickable room-select-hit',
          width: bw,
          height: bd,
          rotation: '-90 0 0',
          position: '0 0.01 0',
          material: 'opacity: 0.01; transparent: true; shader: flat; side: double',
          'data-room-key': renderKey,
        })
      );
      parent.appendChild(grp);
    }

    if (primaryLivingIdx >= 0) {
      var livCenter = livingCentroidWorld(rooms, aptX0, z0, usableW, usableD, mx, mz);
      var livSpan = Math.sqrt(Math.max(livCenter.normArea, 0.12));
      var livBw = Math.max(0.42, livSpan * usableW * fit * 0.82);
      var livBd = Math.max(0.38, livSpan * usableD * fit * 0.78);
      var livGrp = el('a-entity', {
        class: 'room-cluster',
        'data-room-key': 'living',
        position: livCenter.px + ' ' + roomY + ' ' + livCenter.pz,
      });
      livGrp.dataset.halfW = String(livBw / 2);
      livGrp.dataset.halfD = String(livBd / 2);
      addPlanRoomIcon(livGrp, 'living', livBw, livBd, { center: true });
      addPlanRoomLabel(livGrp, planRoomDisplayName('living', 0, false), livBw, livBd, false, 'living');
      parent.appendChild(livGrp);
    }
  }

  /** Scale and center GLB once — bbox in modelEl local space (ignores mount offset). */
  function fitGlbBuildingModel(modelEl, targetSize, cfg) {
    var done = false;

    function applyFit() {
      if (done || typeof AFRAME === 'undefined' || !AFRAME.THREE) return;
      var THREE = AFRAME.THREE;
      var root = modelEl.getObject3D('mesh');
      if (!root) return;

      modelEl.setAttribute('scale', '1 1 1');
      modelEl.setAttribute('position', '0 0 0');
      modelEl.setAttribute('rotation', '0 0 0');
      modelEl.object3D.updateMatrixWorld(true);
      root.updateMatrixWorld(true);

      var box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      box.applyMatrix4(modelEl.object3D.matrixWorld.clone().invert());

      var size = new THREE.Vector3();
      var center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      var maxDim = Math.max(size.x, size.y, size.z, 0.001);
      var mul = cfg && cfg.scaleMul != null ? cfg.scaleMul : 1;
      var s = (targetSize / maxDim) * mul;

      var px = -center.x * s;
      var py = -center.y * s;
      var pz = -center.z * s;
      if (cfg && cfg.position) {
        var parts = String(cfg.position).trim().split(/\s+/);
        if (parts.length >= 3) {
          px += parseFloat(parts[0]) || 0;
          py += parseFloat(parts[1]) || 0;
          pz += parseFloat(parts[2]) || 0;
        }
      }

      modelEl.setAttribute('scale', s + ' ' + s + ' ' + s);
      modelEl.setAttribute('position', px + ' ' + py + ' ' + pz);
      if (cfg && cfg.rotation) {
        modelEl.setAttribute('rotation', cfg.rotation);
      }

      done = true;
      ensureBuildingCubeFrame();
    }

    modelEl.addEventListener('model-loaded', function () {
      requestAnimationFrame(applyFit);
    });
    modelEl.addEventListener('model-error', function () {
      console.error('Building GLB failed to load:', cfg && cfg.src);
    });
  }

  /**
   * Stack modular GLB pieces: ground + (floor × middle) + roof.
   * Set paths in BUILDING_GLB_MODULAR; until then uses procedural floors.
   */
  function addModularGlbBuildingPreview(parent, spec) {
    addCubeViewerPreview(parent, spec, 'building');
  }

  /** Pick building exterior: modular GLB, fixed GLB, or procedural stacked floors. */
  function addFlexibleBuildingPreview(parent, spec) {
    var mod = BUILDING_GLB_MODULAR;
    if (mod && mod.ground && mod.floor && mod.roof) {
      addModularGlbBuildingPreview(parent, spec);
      return;
    }
    if (USE_BUILDING_GLB) {
      addGlbBuildingPreview(parent, spec);
      return;
    }
    addCubeViewerPreview(parent, spec, 'building');
  }

  /**
   * Building view: load external GLB + invisible floor pickers (same layout as cube).
   */
  function addGlbBuildingPreview(parent, spec) {
    var S = 2;
    var floorCount = cubeFloorCount(spec);
    var stackH = S;
    var floorH = stackH / floorCount;
    var bandH = Math.max(0.08, floorH * 0.96);
    var fi;
    var cfg = BUILDING_GLB;

    var modelEl = el('a-entity', {
      id: 'glb-building-model',
      'gltf-model': cfg.src,
    });
    fitGlbBuildingModel(modelEl, S, cfg);
    parent.appendChild(modelEl);

    for (fi = 0; fi < floorCount; fi++) {
      var cy = -stackH / 2 + (fi + 0.5) * floorH;
      var floorWrap = el('a-entity', {
        class: 'floor-picker-hit',
        position: '0 ' + cy + ' 0',
      });
      floorWrap.dataset.floorIndex = String(fi);
      floorWrap.appendChild(
        el('a-box', {
          width: S,
          height: bandH,
          depth: S,
          position: '0 0 0',
          material: 'opacity: 0.02; transparent: true; shader: flat',
        })
      );
      parent.appendChild(floorWrap);
    }
  }

  /** Central stair shaft between apartment blocks (replaces black gap). */
  function addCubeStairShaft(parent, cx, bandH, depth, width, opacity) {
    var op = opacity == null ? 1 : opacity;
    var shaftCol = '#78716c';
    var treadCol = '#44403c';
    var railCol = '#292524';
    var mat =
      'shader: flat; opacity: ' + op + (op < 1 ? '; transparent: true' : '');
    var treadH = Math.max(0.01, bandH * 0.055);
    var treadD = Math.max(0.012, depth * 0.045);
    var treadW = Math.max(width * 0.88, 0.02);
    var halfD = depth / 2;
    var halfBand = bandH / 2;
    var frontZ = halfD - treadD * 0.6;
    var ti;
    var tz;
    var treadsPerFlight = Math.max(3, Math.floor(depth * 0.22 / 0.11));

    parent.appendChild(
      el('a-box', {
        width: width,
        height: bandH,
        depth: depth,
        position: cx + ' 0 0',
        material: 'color: ' + shaftCol + '; ' + mat,
      })
    );

    /* Switchback hint: treads on lower half (toward front) and upper half (toward back). */
    for (ti = 0; ti < treadsPerFlight; ti++) {
      tz = -halfD * 0.82 + (ti / Math.max(treadsPerFlight - 1, 1)) * halfD * 0.72;
      parent.appendChild(
        el('a-box', {
          width: treadW,
          height: treadH,
          depth: treadD,
          position: cx + ' ' + (-halfBand * 0.15) + ' ' + tz,
          material: 'color: ' + treadCol + '; ' + mat,
        })
      );
    }
    for (ti = 0; ti < treadsPerFlight; ti++) {
      tz = halfD * 0.1 + (ti / Math.max(treadsPerFlight - 1, 1)) * halfD * 0.72;
      parent.appendChild(
        el('a-box', {
          width: treadW,
          height: treadH,
          depth: treadD,
          position: cx + ' ' + (halfBand * 0.15) + ' ' + tz,
          material: 'color: ' + treadCol + '; ' + mat,
        })
      );
    }

    /* Landing band across the shaft (mid switchback). */
    parent.appendChild(
      el('a-box', {
        width: treadW,
        height: treadH * 1.4,
        depth: depth * 0.22,
        position: cx + ' 0 ' + (halfD * 0.02),
        material: 'color: ' + railCol + '; ' + mat,
      })
    );

    if (bandH > 0.14) {
      parent.appendChild(
        el('a-text', {
          value: 'STAIRS',
          rotation: '0 0 0',
          position: cx + ' 0 ' + frontZ,
          align: 'center',
          anchor: 'center',
          baseline: 'center',
          color: '#f5f5f4',
          width: Math.max(width, depth * 0.35) * 2.2,
          wrapCount: 8,
        })
      );
    }
  }

  /**
   * Cube centered at local (0,0,0), size 2 — building / floor.
   */
  function addCubeViewerPreview(parent, spec, mode) {
    var S = 2;
    var mat = 'shader: flat';
    var base = spec.facadeColor || '#64748b';

    if (mode === 'building') {
      var floorCount = cubeFloorCount(spec);
      var stackH = S;
      var faceW = 2.65;
      var faceD = S;
      var floorH = stackH / floorCount;
      var bandH = Math.max(0.08, floorH * 0.96);
      var hiFloor =
        typeof spec.walajnaHighlightFloor === 'number' ? spec.walajnaHighlightFloor : null;
      var hiApt =
        typeof spec.walajnaHighlightApt === 'number' ? spec.walajnaHighlightApt : null;
      var aptCount = cubeAptCount(spec);
      var gap = Math.min(0.12, 0.5 / Math.max(aptCount, 1));
      var fw = aptCount > 0 ? (faceW - gap * Math.max(aptCount - 1, 0)) / aptCount : faceW;
      var fi;

      for (fi = 0; fi < floorCount; fi++) {
        var cy = -stackH / 2 + (fi + 0.5) * floorH;
        var floorColor = buildingFloorColors(spec, fi, floorCount);
        var isHiFloor = hiFloor != null && fi === hiFloor;
        var floorWrap = el('a-entity', {
          position: '0 ' + cy + ' 0',
        });
        if (!(isHiFloor && hiApt != null && aptCount > 0)) {
          floorWrap.className = 'floor-picker-hit';
          floorWrap.dataset.floorIndex = String(fi);
        }

        if (isHiFloor && hiApt != null && aptCount > 0) {
          addWalajnaHighlightFloor(
            floorWrap,
            fi,
            floorCount,
            bandH,
            faceW,
            faceD,
            floorColor,
            hiApt,
            aptCount,
            gap,
            fw,
            mat
          );
        } else {
          floorWrap.appendChild(
            el('a-box', {
              width: faceW,
              height: bandH,
              depth: faceD,
              position: '0 0 0',
              material: 'color: ' + floorColor + '; ' + mat,
            })
          );
          addCubeFloorFacade(floorWrap, faceW, faceD, bandH, fi === 0, fi === floorCount - 1);
        }

        parent.appendChild(floorWrap);
      }
      return;
    }

    if (mode === 'floor') {
      var floorCount2 = cubeFloorCount(spec);
      var aptCount = cubeAptCount(spec);
      var selected =
        typeof spec.selectedFloorIndex === 'number' ? spec.selectedFloorIndex : 0;
      var stackH2 = S;
      var floorH2 = stackH2 / floorCount2;
      var bandH2 = Math.max(0.08, floorH2 * 0.96);
      var gap = Math.min(0.12, 0.5 / Math.max(aptCount, 1));
      var fw = aptCount > 0 ? (S - gap * Math.max(aptCount - 1, 0)) / aptCount : S;
      var fadeOp = 0.42;
      var fi2;
      var cy2;

      for (fi2 = 0; fi2 < floorCount2; fi2++) {
        cy2 = -stackH2 / 2 + (fi2 + 0.5) * floorH2;
        var isSelected = fi2 === selected;
        var floorOp = isSelected ? 1 : fadeOp;
        var floorWrap = el('a-entity', {
          class: 'floor-picker-hit',
          position: '0 ' + cy2 + ' 0',
        });
        floorWrap.dataset.floorIndex = String(fi2);

        if (isSelected && !spec.pendingFloorConfirm) {
          var ai;
          var startX = -S / 2 + fw / 2;
          var aptDepth = S * 0.94;
          var pickedApt =
            spec.pendingAptConfirm && typeof spec.selectedApartmentIndex === 'number'
              ? spec.selectedApartmentIndex
              : null;
          for (ai = 0; ai < aptCount; ai++) {
            var ax = startX + ai * (fw + gap);
            if (ai > 0 && gap > 0.02) {
              addCubeStairShaft(floorWrap, ax - fw / 2 - gap / 2, bandH2, S * 0.98, gap, floorOp);
            }
            var isAptPicked = pickedApt === ai;
            var isAptDimmed = pickedApt != null && !isAptPicked;
            if (isAptPicked) {
              floorWrap.appendChild(
                el('a-box', {
                  width: fw + 0.07,
                  height: bandH2 + 0.07,
                  depth: aptDepth + 0.05,
                  position: ax + ' 0 0',
                  material: 'color: ' + APT_CUBE_OUTLINE + '; shader: flat',
                })
              );
            }
            var apt = el('a-box', {
              class: 'apt-picker-hit',
              width: fw,
              height: bandH2,
              depth: aptDepth,
              position: ax + ' 0 0',
              material: aptPickerMaterial(isAptPicked, isAptDimmed, mat),
            });
            apt.dataset.aptIndex = String(ai);
            floorWrap.appendChild(apt);
            if (isAptPicked) {
              floorWrap.appendChild(
                el('a-plane', {
                  width: fw * 0.88,
                  height: bandH2 * 0.22,
                  rotation: '0 0 0',
                  position: ax + ' ' + (bandH2 * 0.28) + ' ' + (aptDepth / 2 + 0.015),
                  material:
                    'color: #ffffff; shader: flat; side: double; opacity: 0.92; transparent: true',
                })
              );
            }
          }
        } else {
          var flatOp = isSelected && spec.pendingFloorConfirm ? 1 : fadeOp;
          floorWrap.appendChild(
            el('a-box', {
              width: S,
              height: bandH2,
              depth: S,
              position: '0 0 0',
              material:
                'color: ' + base + '; ' + mat + '; opacity: ' + flatOp + '; transparent: true',
            })
          );
        }

        addCubeFloorFacade(floorWrap, S, S, bandH2, fi2 === 0, fi2 === floorCount2 - 1, floorOp);
        parent.appendChild(floorWrap);
      }
      parent.appendChild(
        el('a-box', {
          width: S + 0.04,
          height: stackH2 + 0.04,
          depth: S + 0.04,
          position: '0 0 0',
          material: 'color: #334155; ' + mat + '; opacity: 0.35; transparent: true',
        })
      );
      return;
    }

  }

  /**
   * Solid building stack: two floor blocks + stair shaft (pick a floor first).
   * @param {Element} parent
   * @param {BuildingSpec} spec
   */
  function addBuildingStackPreview(parent, spec) {
    var W = spec.width;
    var D = spec.depth;
    var perFloorH = spec.height / clampMin(spec.floors, 1);
    var layout = getFirstFloorLayout(W, D);
    var hall = layout.hall;
    var stairs = layout.stairs;
    var stairW = stairs.x1 - stairs.x0;
    var stairD = stairs.z1 - stairs.z0;
    var stairCx = (stairs.x0 + stairs.x1) / 2;
    var stairCz = (stairs.z0 + stairs.z1) / 2;
    var blockMat = 'shader: flat; opacity: 1; transparent: false';

    function addFloorBlock(floorIndex, baseY, color, label) {
      var cy = baseY + perFloorH / 2;
      var bw = W * 0.98;
      var bh = perFloorH;
      var bd = D * 0.98;

      var block = el('a-box', {
        class: 'floor-picker-hit',
        width: bw,
        height: bh,
        depth: bd,
        position: '0 ' + cy + ' 0',
        material: 'color: ' + color + '; ' + blockMat,
      });
      block.dataset.floorIndex = String(floorIndex);
      parent.appendChild(block);

      var hit = el('a-plane', {
        class: 'floor-picker-hit clickable',
        width: bw,
        height: bd,
        position: '0 ' + (baseY + perFloorH + 0.04) + ' 0',
        rotation: '-90 0 0',
        material: 'opacity: 0.04; transparent: true; shader: flat; side: double',
      });
      hit.dataset.floorIndex = String(floorIndex);
      parent.appendChild(hit);

      parent.appendChild(
        el('a-text', {
          value: label,
          position: '0 ' + (cy + perFloorH * 0.12) + ' 0',
          align: 'center',
          anchor: 'center',
          baseline: 'center',
          color: '#ffffff',
          width: Math.min(W, D) * 0.9,
          wrapCount: 14,
        })
      );
    }

    addFloorBlock(0, 0, '#94a3b8', '1st floor');
    addFloorBlock(1, perFloorH, '#64748b', '2nd floor');

    var shaftH = perFloorH * 2;
    parent.appendChild(
      el('a-box', {
        width: stairW,
        height: shaftH,
        depth: stairD,
        position: stairCx + ' ' + shaftH / 2 + ' ' + stairCz,
        material: 'color: #78716c; ' + blockMat,
      })
    );
    parent.appendChild(
      el('a-text', {
        value: 'Stairs',
        position: stairCx + ' ' + (shaftH * 0.52) + ' ' + stairCz,
        align: 'center',
        anchor: 'center',
        baseline: 'center',
        color: '#f1f5f9',
        width: Math.max(stairW, stairD) * 1.2,
        wrapCount: 8,
      })
    );
  }

  /**
   * Dollhouse building: 3D floor 1 layout + floor 2 block (isometric-friendly, centered).
   * @param {Element} parent
   * @param {BuildingSpec} spec
   */
  function addBuildingDollhousePreview(parent, spec) {
    var perFloorH = spec.height / clampMin(spec.floors, 1);
    var W = spec.width;
    var D = spec.depth;

    var floor1 = document.createElement('a-entity');
    floor1.setAttribute('class', 'floor-picker-hit');
    floor1.dataset.floorIndex = '0';
    parent.appendChild(floor1);
    addFirstFloorBlockPreview(floor1, spec);

    var y2 = perFloorH;
    var floor2 = document.createElement('a-entity');
    floor2.setAttribute('class', 'floor-picker-hit');
    floor2.setAttribute('position', '0 ' + y2 + ' 0');
    floor2.dataset.floorIndex = '1';
    parent.appendChild(floor2);

    var cy2 = y2 + perFloorH / 2;
    floor2.appendChild(
      el('a-box', {
        width: W * 0.96,
        height: perFloorH * 0.92,
        depth: D * 0.96,
        position: '0 ' + perFloorH / 2 + ' 0',
        material: 'color: #64748b; shader: flat',
      })
    );
    floor2.appendChild(
      el('a-box', {
        width: W * 0.94,
        height: 0.06,
        depth: D * 0.94,
        position: '0 ' + (perFloorH - 0.02) + ' 0',
        material: 'color: #475569; shader: flat',
      })
    );
    floor2.appendChild(
      el('a-text', {
        value: '2nd floor',
        position: '0 ' + (perFloorH * 0.55) + ' 0',
        align: 'center',
        anchor: 'center',
        baseline: 'center',
        color: '#f8fafc',
        width: Math.min(W, D) * 0.7,
        wrapCount: 10,
      })
    );
    var hit2 = el('a-plane', {
      class: 'floor-picker-hit clickable',
      width: W,
      height: D,
      position: '0 ' + perFloorH + ' 0',
      rotation: '-90 0 0',
      material: 'opacity: 0.01; transparent: true; shader: flat; side: double',
    });
    hit2.dataset.floorIndex = '1';
    floor2.appendChild(hit2);
  }

  /**
   * First floor block: 2 apartments + hall + stairs (tap an apartment to open its layout).
   * @param {Element} parent
   * @param {BuildingSpec} spec
   */
  function addFirstFloorBlockPreview(parent, spec) {
    var W = spec.width;
    var D = spec.depth;
    var layout = getFirstFloorLayout(W, D);
    var wt = 0.06;
    var slabT = 0.05;
    var wallH = Math.min(1.65, Math.max(1.05, (spec.height / clampMin(spec.floors, 1)) * 0.75));
    var floorY = 0.01;
    var wallCenterY = floorY + slabT + wallH / 2;
    var wallMat = 'color: #f8f9fa; shader: flat';
    var capMat = 'color: #64748b; shader: flat';
    var volH = wallH * 0.88;

    function addCapWall(w, h, d, cx, cy, cz) {
      parent.appendChild(
        el('a-box', { width: w, height: h, depth: d, position: cx + ' ' + cy + ' ' + cz, material: wallMat })
      );
      var capH = 0.035;
      parent.appendChild(
        el('a-box', {
          width: w,
          height: capH,
          depth: d,
          position: cx + ' ' + (cy + h / 2 + capH / 2) + ' ' + cz,
          material: capMat,
        })
      );
    }

    function addZone(box, col, label, extraClass, dataset) {
      var cx = (box.x0 + box.x1) / 2;
      var cz = (box.z0 + box.z1) / 2;
      var bw = box.x1 - box.x0;
      var bd = box.z1 - box.z0;
      parent.appendChild(
        el('a-box', {
          width: bw * 0.96,
          height: volH,
          depth: bd * 0.96,
          position: cx + ' ' + (floorY + slabT + volH / 2) + ' ' + cz,
          material: 'color: ' + col + '; shader: flat; opacity: 0.92',
        })
      );
      var attrs = {
        width: bw,
        height: slabT,
        depth: bd,
        position: cx + ' ' + (floorY + slabT / 2) + ' ' + cz,
        material: 'color: ' + col + '; shader: flat',
      };
      if (extraClass) attrs.class = extraClass;
      var slab = el('a-box', attrs);
      if (dataset) {
        Object.keys(dataset).forEach(function (k) {
          slab.dataset[k] = dataset[k];
        });
      }
      parent.appendChild(slab);
      var tw = Math.min(Math.max(bw, bd) * 0.7, 3.5);
      parent.appendChild(
        el('a-text', {
          value: label,
          position: cx + ' ' + (wallCenterY + 0.15) + ' ' + cz,
          align: 'center',
          anchor: 'center',
          baseline: 'center',
          color: '#0f172a',
          width: tw,
          wrapCount: 14,
        })
      );
      if (extraClass) {
        var hit = el('a-plane', {
          class: extraClass + ' clickable',
          width: bw * 0.98,
          height: bd * 0.98,
          position: cx + ' ' + (floorY + slabT + 0.05) + ' ' + cz,
          rotation: '-90 0 0',
          material: 'opacity: 0.04; transparent: true; shader: flat; side: double',
        });
        if (dataset) {
          Object.keys(dataset).forEach(function (k) {
            hit.dataset[k] = dataset[k];
          });
        }
        parent.appendChild(hit);
      }
    }

    parent.appendChild(
      el('a-box', {
        width: W,
        height: slabT,
        depth: D,
        position: '0 ' + (floorY + slabT / 2) + ' 0',
        material: 'color: #94a3b8; shader: flat',
      })
    );

    addZone(layout.apt0, '#93c5fd', 'Apartment 1', 'apt-picker-hit', { aptIndex: '0' });
    addZone(layout.apt1, '#93c5fd', 'Apartment 2', 'apt-picker-hit', { aptIndex: '1' });
    addZone(layout.hall, '#cbd5e1', 'Hallway', null, null);
    addZone(layout.stairs, '#78716c', 'Stairs', null, null);

    var z0 = -D / 2;
    var z1 = D / 2;
    addCapWall(W, wallH, wt, 0, wallCenterY, z0 + wt / 2);
    addCapWall(W, wallH, wt, 0, wallCenterY, z1 - wt / 2);
    addCapWall(wt, wallH, D, -W / 2 + wt / 2, wallCenterY, 0);
    addCapWall(wt, wallH, D, W / 2 - wt / 2, wallCenterY, 0);

    var hall = layout.hall;
    addCapWall(wt, wallH, hall.z1 - hall.z0, hall.x0 - wt / 2, wallCenterY, (hall.z0 + hall.z1) / 2);
    addCapWall(wt, wallH, hall.z1 - hall.z0, hall.x1 + wt / 2, wallCenterY, (hall.z0 + hall.z1) / 2);

    var st = layout.stairs;
    addCapWall(st.x1 - st.x0, wallH, wt, (st.x0 + st.x1) / 2, wallCenterY, st.z0 - wt / 2);
  }

  /**
   * Dollhouse cutaway for one apartment zone (open front). aptIndex 0|1 uses first-floor layout.
   * @param {Element} parent
   * @param {BuildingSpec} spec
   * @param {number} [aptIndex]
   */
  function addFixedCutawayPreview(parent, spec, aptIndex) {
    var floorH = spec.height / clampMin(spec.floors, 1);
    var wt = 0.06;
    var wallH = Math.min(1.55, Math.max(1.0, floorH * 0.72));
    var slabT = 0.045;
    var floorY = 0;
    var wallCenterY = floorY + slabT + wallH / 2;
    var labelY = wallCenterY + 0.08;
    var wallMat = 'color: #f8f9fa; shader: flat; opacity: 1';
    var capMat = 'color: #64748b; shader: flat';

    var rooms = [
      { key: 'kitchen', label: 'Kitchen', x0: 0, x1: 0.36, z0: 0, z1: 0.32 },
      { key: 'entrance', label: 'Entrance', x0: 0.36, x1: 0.5, z0: 0, z1: 0.32 },
      { key: 'bathroom', label: 'Bathroom', x0: 0.5, x1: 1, z0: 0, z1: 0.32 },
      { key: 'living', label: 'Living room', x0: 0, x1: 0.66, z0: 0.32, z1: 1 },
      { key: 'bedroom', label: 'Bedroom', x0: 0.66, x1: 1, z0: 0.32, z1: 1 },
    ];

    function addWall(w, h, d, cx, cy, cz) {
      parent.appendChild(
        el('a-box', {
          width: w,
          height: h,
          depth: d,
          position: cx + ' ' + cy + ' ' + cz,
          material: wallMat,
        })
      );
      var capH = 0.035;
      parent.appendChild(
        el('a-box', {
          width: w,
          height: capH,
          depth: d,
          position: cx + ' ' + (cy + h / 2 + capH / 2) + ' ' + cz,
          material: capMat,
        })
      );
    }

    var f;
    for (f = 0; f < spec.floors; f++) {
      var floorBaseY = f * floorH;
      floorY = floorBaseY + 0.01;
      wallCenterY = floorY + slabT + wallH / 2;
      labelY = wallCenterY + wallH * 0.12;

      var zone;
      if (typeof aptIndex === 'number') {
        var layout = getFirstFloorLayout(spec.width, spec.depth);
        zone = aptIndex === 0 ? layout.apt0 : layout.apt1;
      }

      var aptX0;
      var aptX1;
      var z0;
      var z1;
      if (zone) {
        aptX0 = zone.x0 + wt;
        aptX1 = zone.x1 - wt;
        z0 = zone.z0 + wt;
        z1 = zone.z1 - wt;
      } else {
        aptX0 = -spec.width / 2 + wt;
        aptX1 = spec.width / 2 - wt;
        z0 = -spec.depth / 2 + wt;
        z1 = spec.depth / 2 - wt;
      }
      var usableW = aptX1 - aptX0;
      var usableD = z1 - z0;

      (function buildOneApt() {

        var xLine1 = aptX0 + 0.36 * usableW;
        var xLine2 = aptX0 + 0.5 * usableW;
        var xLine3 = aptX0 + 0.66 * usableW;
        var zLine1 = z0 + 0.32 * usableD;

        var innerX0 = aptX0 + wt / 2;
        var innerX1 = aptX1 - wt / 2;
        var innerZ0 = z0 + wt / 2;
        var innerZ1 = z1 - wt / 2;

        var floorHit = el('a-box', {
          class: 'clickable relocate-floor-hit',
          width: usableW,
          height: slabT,
          depth: usableD,
          position: (aptX0 + aptX1) / 2 + ' ' + (floorY + slabT / 2) + ' ' + (z0 + z1) / 2,
          material: 'color: #cbd5e1; shader: flat',
        });
        floorHit.dataset.innerX0 = String(innerX0);
        floorHit.dataset.innerX1 = String(innerX1);
        floorHit.dataset.innerZ0 = String(innerZ0);
        floorHit.dataset.innerZ1 = String(innerZ1);
        parent.appendChild(floorHit);

        var ri;
        for (ri = 0; ri < rooms.length; ri++) {
          var rm = rooms[ri];
          var xL = aptX0 + rm.x0 * usableW + wt * 0.2;
          var xR = aptX0 + rm.x1 * usableW - wt * 0.2;
          var zB = z0 + rm.z0 * usableD + wt * 0.2;
          var zF = z0 + rm.z1 * usableD - wt * 0.2;
          var bw = Math.max(0.1, xR - xL);
          var bd = Math.max(0.1, zF - zB);
          var cx = (xL + xR) / 2;
          var cz = (zB + zF) / 2;
          var col = PREVIEW_COLORS[rm.key] || COLORS[rm.key] || '#cbd5e1';

          var grp = el('a-entity', {
            class: 'room-cluster',
            'data-room-key': rm.key,
            position: cx + ' ' + floorY + ' ' + cz,
          });
          grp.dataset.halfW = String(bw / 2);
          grp.dataset.halfD = String(bd / 2);

          var slab = el('a-box', {
            width: bw,
            height: slabT,
            depth: bd,
            position: '0 ' + (slabT * 1.05) + ' 0',
            material: 'color: ' + col + '; shader: flat',
            'data-room': rm.key,
            'data-slab': '1',
            'data-base-color': col,
          });

          var tw = Math.min(Math.max(bw, bd) * 0.75, 2.8);
          var label = el('a-text', {
            value: rm.label,
            position: '0 ' + (labelY - floorY) + ' 0',
            align: 'center',
            anchor: 'center',
            baseline: 'center',
            color: '#1e293b',
            width: tw,
            wrapCount: 16,
          });

          var hitPad = el('a-plane', {
            class: 'clickable room-select-hit',
            width: bw,
            height: bd,
            position: '0 ' + (wallH * 0.35) + ' 0',
            rotation: '-90 0 0',
            material: 'opacity: 0.01; transparent: true; shader: flat; side: double',
            'data-room-key': rm.key,
          });

          grp.appendChild(slab);
          grp.appendChild(label);
          grp.appendChild(hitPad);
          parent.appendChild(grp);
        }

        var topZ0 = innerZ0;
        var topZ1 = zLine1 - wt / 2;
        addWall(wt, wallH, Math.max(0.05, topZ1 - topZ0), xLine1, wallCenterY, (topZ0 + topZ1) / 2);
        addWall(wt, wallH, Math.max(0.05, topZ1 - topZ0), xLine2, wallCenterY, (topZ0 + topZ1) / 2);

        var botZ0 = zLine1 + wt / 2;
        var botZ1 = innerZ1;
        addWall(wt, wallH, Math.max(0.05, botZ1 - botZ0), xLine3, wallCenterY, (botZ0 + botZ1) / 2);

        addWall(Math.max(0.05, innerX1 - innerX0), wallH, wt, (innerX0 + innerX1) / 2, wallCenterY, zLine1);

        addWall(usableW, wallH, wt, (aptX0 + aptX1) / 2, wallCenterY, z0 + wt / 2);
        addWall(wt, wallH, usableD, aptX0 + wt / 2, wallCenterY, (z0 + z1) / 2);
        addWall(wt, wallH, usableD, aptX1 - wt / 2, wallCenterY, (z0 + z1) / 2);
        /* Open front (+Z): no front wall — dollhouse view. */
      })();
    }
  }

  function addInteriorRooms(parent, spec) {
    var floorH = spec.height / clampMin(spec.floors, 1);
    var aptCount = clampMin(spec.apartments, 1);
    var aptWidthOuter = spec.width / aptCount;
    var roomTypes = expandRoomTypes(spec.apartment);
    var nRooms = roomTypes.length;
    var shape = gridShape(nRooms);
    var pad = 0.04; // breathing room between cells

    var f;
    var a;
    for (f = 0; f < spec.floors; f++) {
      var floorBaseY = f * floorH;
      var midY = floorBaseY + floorH * 0.5;

      for (a = 0; a < aptCount; a++) {
        // Apartment strip along X on this floor.
        var aptX0 = -spec.width / 2 + a * aptWidthOuter + WALL_T;
        var aptX1 = -spec.width / 2 + (a + 1) * aptWidthOuter - WALL_T;
        var usableW = aptX1 - aptX0;
        var z0 = -spec.depth / 2 + WALL_T;
        var z1 = spec.depth / 2 - WALL_T;
        var usableD = z1 - z0;

        var cellW = (usableW - pad * (shape.cols + 1)) / shape.cols;
        var cellD = (usableD - pad * (shape.rows + 1)) / shape.rows;
        var cellH = Math.max(0.06, floorH * 0.55);

        var idx = 0;
        var r;
        var c;
        for (r = 0; r < shape.rows; r++) {
          for (c = 0; c < shape.cols; c++) {
            if (idx >= nRooms) break;
            var kind = roomTypes[idx];
            var cx = aptX0 + pad + (c + 0.5) * cellW + c * pad;
            var cz = z0 + pad + (r + 0.5) * cellD + r * pad;
            var czRoom = cz - 0.02; // nudge back from the inner front plane to reduce z-fighting with the glass wall
            var box = el('a-box', {
              width: Math.max(0.05, cellW),
              height: cellH,
              depth: Math.max(0.05, cellD),
              position: cx + ' ' + midY + ' ' + czRoom,
              color: COLORS[kind],
              shader: 'flat',
              'data-room': kind,
            });
            parent.appendChild(box);
            idx++;
          }
        }
      }
    }
  }

  /**
   * Mark mesh as an exterior façade (toggled with the door for “glass” preview).
   * @param {Element} node
   * @param {string} hex
   */
  function markExtWall(node, hex) {
    node.classList.add('ext-wall');
    node.dataset.extColor = hex;
    node.setAttribute(
      'material',
      'color: ' + hex + '; shader: flat; opacity: 1; transparent: true; side: double'
    );
  }

  /**
   * Translucent shell for fixed-template AR (dollhouse / glass box).
   * @param {Element} node
   * @param {string} hex
   */
  function markExtWallGlass(node, hex) {
    node.classList.add('ext-wall');
    node.dataset.extColor = hex;
    node.setAttribute(
      'material',
      'color: ' + hex + '; shader: flat; opacity: 0.88; transparent: true; side: double'
    );
    node.dataset.wallMode = 'glass';
  }

  /**
   * Shell: floor slab, roof, façades, door + frame, window accents, hit pad.
   * @param {Element} parent
   * @param {BuildingSpec} spec
   */
  function addShell(parent, spec) {
    var W = spec.width;
    var D = spec.depth;
    var H = spec.height;
    var t = WALL_T;
    var faceZ = D / 2 - t / 2;
    var facadeBase = /^#[0-9a-fA-F]{6}$/.test(spec.facadeColor || '') ? spec.facadeColor : '#64748b';
    var facadeSide = tintHex(facadeBase, 0.08);
    var facadeFront = tintHex(facadeBase, -0.08);
    var roofColor = tintHex(facadeBase, -0.45);

    parent.appendChild(
      el('a-box', {
        width: W,
        height: 0.02,
        depth: D,
        position: '0 0.01 0',
        color: '#cbd5e1',
        shader: 'flat',
      })
    );

    var roofCap = el('a-box', {
      id: 'roof-cap',
      width: W + 0.04,
      height: t * 1.2,
      depth: D + 0.04,
      position: '0 ' + (H - t * 0.6) + ' 0',
      color: roofColor,
      shader: 'flat',
    });
    roofCap.classList.add('cutaway-hide');
    parent.appendChild(roofCap);

    var back = el('a-box', {
      width: W,
      height: H,
      depth: t,
      position: '0 ' + H / 2 + ' ' + (-D / 2 + t / 2),
    });
    markExtWall(back, facadeBase);
    parent.appendChild(back);

    var left = el('a-box', {
      width: t,
      height: H,
      depth: D,
      position: -W / 2 + t / 2 + ' ' + H / 2 + ' 0',
    });
    markExtWall(left, facadeSide);
    parent.appendChild(left);

    var right = el('a-box', {
      width: t,
      height: H,
      depth: D,
      position: W / 2 - t / 2 + ' ' + H / 2 + ' 0',
    });
    markExtWall(right, facadeSide);
    parent.appendChild(right);

    var front = el('a-box', {
      id: 'front-wall',
      width: W,
      height: H,
      depth: t,
      position: '0 ' + H / 2 + ' ' + faceZ,
    });
    markExtWall(front, facadeFront);
    front.classList.add('clickable', 'cutaway-hide');
    parent.appendChild(front);

    var frontHitZ = faceZ + t * 1.15;
    var frontHit = el('a-plane', {
      id: 'front-facade-hit',
      class: 'clickable',
      width: W * 0.98,
      height: H * 0.96,
      position: '0 ' + H / 2 + ' ' + frontHitZ,
      rotation: '-90 0 0',
      material: 'opacity: 0.04; transparent: true; shader: flat; side: double',
    });
    frontHit.classList.add('cutaway-hide');
    parent.appendChild(frontHit);

    var winY = H * 0.55;
    var winW = Math.min(0.22, W * 0.08);
    var winH = H * 0.22;
    var winZ = faceZ - t * 0.25;
    var wx;
    for (wx = -W * 0.28; wx <= W * 0.28 + 0.01; wx += W * 0.28) {
      var wn = el('a-box', {
        width: winW,
        height: winH,
        depth: t * 0.5,
        position: wx + ' ' + winY + ' ' + winZ,
        color: '#0f172a',
        shader: 'flat',
      });
      wn.classList.add('cutaway-hide');
      parent.appendChild(wn);
    }

    var floorH = H / clampMin(spec.floors, 1);
    var doorH = Math.min(1.15, Math.max(0.55, floorH * 0.72));
    var doorW = Math.min(1.05, Math.max(0.48, W * 0.38));
    var doorY = doorH / 2 + 0.04;
    var doorZ = D / 2 + t * 0.75;
    var frameT = Math.max(0.03, t * 1.1);
    var jambW = frameT;
    var jambD = t * 1.4;
    var lintelH = frameT * 1.2;

    var jambX = doorW / 2 + jambW / 2;
    var jamb = el('a-box', {
      width: jambW,
      height: doorH + lintelH * 0.5,
      depth: jambD,
      position: -jambX + ' ' + (doorY + lintelH * 0.15) + ' ' + doorZ,
      color: '#78350f',
      shader: 'flat',
    });
    parent.appendChild(jamb);
    var jambR = el('a-box', {
      width: jambW,
      height: doorH + lintelH * 0.5,
      depth: jambD,
      position: jambX + ' ' + (doorY + lintelH * 0.15) + ' ' + doorZ,
      color: '#78350f',
      shader: 'flat',
    });
    parent.appendChild(jambR);

    var lintel = el('a-box', {
      width: doorW + jambW * 2.6,
      height: lintelH,
      depth: jambD,
      position: '0 ' + (doorY + doorH / 2 + lintelH * 0.55) + ' ' + doorZ,
      color: '#92400e',
      shader: 'flat',
    });
    parent.appendChild(lintel);

    var door = el('a-box', {
      id: 'door-visual',
      class: 'clickable',
      width: doorW,
      height: doorH,
      depth: t * 1.35,
      position: '0 ' + doorY + ' ' + doorZ,
      color: '#ea580c',
      shader: 'flat',
    });
    parent.appendChild(door);

    var hitW = Math.max(doorW * 2.8, Math.min(W * 0.85, 1.4));
    var hitH = Math.max(doorH * 2.4, Math.min(H * 0.55, 1.35));
    var hitZ = doorZ + 0.14;
    var hitPad = el('a-plane', {
      id: 'door-hit',
      class: 'clickable',
      width: hitW,
      height: hitH,
      position: '0 ' + doorY + ' ' + hitZ,
      rotation: '-90 0 0',
      material: 'opacity: 0.001; transparent: true; shader: flat; side: double',
    });
    parent.appendChild(hitPad);
  }

  /**
   * Public entry: rebuild everything under building-root.
   * @param {Element} buildingRoot
   * @param {BuildingSpec} spec
   */
  function generateBuilding(buildingRoot, spec) {
    clearChildren(buildingRoot);
    var buildSpec = spec;

    if (spec.useFixedApartmentTemplate) {
      var perFloorH = spec.height / clampMin(spec.floors, 1);
      buildSpec = Object.assign({}, spec, {
        floors: 1,
        height: perFloorH,
      });
      if (spec.previewCutaway) {
        if (spec.previewCube) {
          if (
            spec.viewerMode === 'apartment' &&
            typeof spec.selectedApartmentIndex === 'number'
          ) {
            addBirdseyeApartmentPreview(buildingRoot, buildSpec, spec.selectedApartmentIndex);
          } else if (spec.viewerMode === 'building') {
            addFlexibleBuildingPreview(buildingRoot, buildSpec);
          } else {
            addCubeViewerPreview(buildingRoot, buildSpec, 'floor');
          }
        } else if (spec.viewerMode === 'apartment' && typeof spec.selectedApartmentIndex === 'number') {
          addFixedCutawayPreview(buildingRoot, buildSpec, spec.selectedApartmentIndex);
        } else if (spec.viewerMode === 'floor') {
          addFirstFloorBlockPreview(buildingRoot, buildSpec);
        } else if (spec.viewerMode === 'building') {
          addBuildingStackPreview(buildingRoot, buildSpec);
        } else if (clampMin(spec.apartments, 1) >= 2) {
          addFirstFloorBlockPreview(buildingRoot, buildSpec);
        } else {
          addFixedCutawayPreview(buildingRoot, buildSpec);
        }
      } else {
        addFixedSingleApartmentTemplate(buildingRoot, buildSpec);
      }
    } else if (spec.apartmentLayout && layoutGridValid(spec.apartmentLayout)) {
      addInteriorRoomsFromLayout(buildingRoot, spec, spec.apartmentLayout);
      addShell(buildingRoot, spec);
    } else {
      addInteriorRooms(buildingRoot, spec);
      addShell(buildingRoot, spec);
    }

    if (spec.previewCutaway && spec.previewCube) {
      buildingRoot.setAttribute('scale', '1 1 1');
    } else if (spec.previewCutaway) {
      var perFloorH = buildSpec.height / clampMin(buildSpec.floors, 1);
      var stackH = spec.viewerMode === 'building' ? perFloorH * 2 : perFloorH;
      var raw = Math.max(buildSpec.width, buildSpec.depth, stackH, 0.5);
      var PREVIEW_MAX =
        window.ViewerCamera && window.ViewerCamera.PREVIEW_MAX
          ? window.ViewerCamera.PREVIEW_MAX
          : 8;
      var s = PREVIEW_MAX / raw;
      buildingRoot.setAttribute('scale', s + ' ' + s + ' ' + s);
    } else {
      var AR_MAX = 2.3;
      var gw = Math.max(buildSpec.width, 0.2);
      var gh = Math.max(buildSpec.height, 0.2);
      var gd = Math.max(buildSpec.depth, 0.2);
      buildingRoot.setAttribute('scale', AR_MAX / gw + ' ' + AR_MAX / gh + ' ' + AR_MAX / gd);
    }
  }

  window.BuildingGenerator = {
    generateBuilding: generateBuilding,
    getFirstFloorLayout: getFirstFloorLayout,
    ensureBuildingCubeFrame: ensureBuildingCubeFrame,
    COLORS: COLORS,
    WALL_T: WALL_T,
  };
})();
