/**
 * apartment-plan-templates.js
 * Unique scattered layout per bedroom × bathroom count (1–5 each).
 * Living auto-fills remaining grid cells (orange).
 */

(function () {
  'use strict';

  var GR = 12;

  function room(key, x0, x1, z0, z1) {
    return { key: key, x0: x0, x1: x1, z0: z0, z1: z1 };
  }

  function roundCount(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function normalizeCounts(apt) {
    apt = apt || {};
    var bedrooms = clamp(roundCount(apt.bedrooms), 1, 5);
    var bathrooms = clamp(roundCount(apt.bathrooms), 1, 5);
    var kitchens = roundCount(apt.kitchens);
    var livingRooms = roundCount(apt.livingRooms != null ? apt.livingRooms : apt.living);
    var hallways = roundCount(apt.hallways);
    if (hallways > 0 && livingRooms < 1) livingRooms = hallways;
    if (kitchens < 1) kitchens = 1;
    if (livingRooms < 1) livingRooms = 1;
    return {
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      kitchens: kitchens,
      livingRooms: livingRooms,
    };
  }

  function copyRooms(rooms) {
    return rooms.map(function (r) {
      return { key: r.key, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 };
    });
  }

  function mirrorRoomsHoriz(rooms) {
    return rooms.map(function (r) {
      return {
        key: r.key,
        x0: 1 - r.x1,
        x1: 1 - r.x0,
        z0: r.z0,
        z1: r.z1,
      };
    });
  }

  function tileDims(bedCount, bathCount) {
    var total = bedCount + bathCount + 1;
    if (total <= 4) {
      return { bedW: 4, bedH: 4, bathW: 4, bathH: 2, kitW: 4, kitH: 3 };
    }
    if (total <= 7) {
      return { bedW: 3, bedH: 3, bathW: 3, bathH: 2, kitW: 3, kitH: 3 };
    }
    return { bedW: 3, bedH: 3, bathW: 3, bathH: 1, kitW: 3, kitH: 3 };
  }

  /**
   * Hand-tuned showcase layouts (demo-friendly) — all bedroom × bathroom pairs 1–5.
   * Grid row 0 = visual BOTTOM of the plan; row GR−h = visual TOP.
   */
  var EXPLICIT_SLOTS = {
    '1x1': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL']],
      baths: [['bath_BC']],
    },
    '1x2': {
      kitchen: ['kit_MR'],
      beds: [['bed_TL']],
      baths: [['bath_TC'], ['bath_BC']],
    },
    '1x3': {
      kitchen: ['kit_MR'],
      beds: [['bed_TL']],
      baths: [['bath_TC'], ['bath_ML'], ['bath_BC']],
    },
    '1x4': {
      kitchen: ['kit_BL'],
      beds: [['bed_TR']],
      baths: [['bath_TC'], ['bath_ML'], ['bath_MR'], ['bath_BC']],
    },
    '1x5': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR'], ['bath_ML']],
    },
    '2x1': {
      kitchen: ['kit_BL'],
      beds: [['bed_TR'], ['bed_MR']],
      baths: [['bath_TC']],
    },
    '2x2': {
      kitchen: ['kit_MR'],
      beds: [['bed_BL'], ['bed_BR']],
      baths: [['bath_TC'], ['bath_ML']],
    },
    '2x3': {
      kitchen: ['kit_BC'],
      beds: [['bed_TL'], ['bed_BR']],
      baths: [['bath_TC'], ['bath_ML'], ['bath_MR']],
    },
    '2x4': {
      kitchen: ['kit_TL'],
      beds: [['bed_BL'], ['bed_TR']],
      baths: [['bath_TC'], ['bath_BC'], ['bath_ML'], ['bath_MR']],
    },
    '2x5': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR'], ['bath_ML']],
    },
    '3x1': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_MR']],
      baths: [['bath_BC']],
    },
    '3x2': {
      kitchen: ['kit_MR'],
      beds: [['bed_TL'], ['bed_BL'], ['bed_TR']],
      baths: [['bath_TC'], ['bath_ML']],
    },
    '3x3': {
      kitchen: ['kit_TL'],
      beds: [['bed_BL'], ['bed_TR'], ['bed_MR']],
      baths: [['bath_TC'], ['bath_ML'], ['bath_BR']],
    },
    '3x4': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR']],
    },
    '3x5': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR'], ['bath_ML']],
    },
    '4x1': {
      kitchen: ['kit_TC'],
      beds: [['bed_TL'], ['bed_BL'], ['bed_TR'], ['bed_MR']],
      baths: [['bath_BC']],
    },
    '4x2': {
      kitchen: ['kit_BC'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BL'], ['bed_ML']],
      baths: [['bath_TC'], ['bath_MR']],
    },
    '4x3': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL']],
    },
    '4x4': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR']],
    },
    '4x5': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR'], ['bath_MR']],
    },
    '5x1': {
      kitchen: ['kit_MR'],
      beds: [['bed_TL'], ['bed_BL'], ['bed_TR'], ['bed_BR'], ['bed_TC']],
      baths: [['bath_BC']],
    },
    '5x2': {
      kitchen: ['kit_BC'],
      beds: [['bed_TL'], ['bed_BL'], ['bed_TR'], ['bed_BR'], ['bed_ML']],
      baths: [['bath_TC'], ['bath_MR']],
    },
    '5x3': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML'], ['bed_MR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL']],
    },
    '5x4': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML'], ['bed_MR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR']],
    },
    '5x5': {
      kitchen: ['kit_BL'],
      beds: [['bed_TL'], ['bed_TR'], ['bed_BR'], ['bed_ML'], ['bed_MR']],
      baths: [['bath_TL'], ['bath_TR'], ['bath_BL'], ['bath_BR'], ['bath_M7L']],
    },
  };

  /**
   * Rows = bedrooms 1–5, cols = bathrooms 1–5.
   */
  var KITCHEN_BY_COUNT = [
    ['kit_BL', 'kit_TL', 'kit_TR', 'kit_TC', 'kit_MR'],
    ['kit_MR', 'kit_BL', 'kit_TL', 'kit_TR', 'kit_BC'],
    ['kit_BC', 'kit_TR', 'kit_TL', 'kit_MR', 'kit_TC'],
    ['kit_TC', 'kit_MR', 'kit_BC', 'kit_BL', 'kit_TL'],
    ['kit_TL', 'kit_TC', 'kit_MR', 'kit_BC', 'kit_BL'],
  ];

  /** Rotated slot pools — start index shifts per count combo. */
  var BED_POOL = ['bed_TL', 'bed_BR', 'bed_BL', 'bed_TR', 'bed_MR', 'bed_ML', 'bed_TC'];
  var BATH_POOL = ['bath_TC', 'bath_BR', 'bath_ML', 'bath_BL', 'bath_MR', 'bath_TL', 'bath_BC'];

  function resolveSlots(d) {
    var G = GR;
    var midC = Math.floor((G - d.kitW) / 2);
    var midR = Math.floor((G - d.kitH) / 2);
    var midBedC = Math.floor((G - d.bedW) / 2);
    var midBedR = Math.floor((G - d.bedH) / 2);
    var midBathC = Math.floor((G - d.bathW) / 2);

    return {
      kit_BL: { c: 0, r: 0, w: d.kitW, h: d.kitH },
      kit_TL: { c: 0, r: G - d.kitH, w: d.kitW, h: d.kitH },
      kit_TR: { c: G - d.kitW, r: G - d.kitH, w: d.kitW, h: d.kitH },
      kit_TC: { c: midC, r: G - d.kitH, w: d.kitW, h: d.kitH },
      kit_MR: { c: G - d.kitW, r: midR, w: d.kitW, h: d.kitH },
      kit_BC: { c: midC, r: 0, w: d.kitW, h: d.kitH },

      bed_TL: { c: 0, r: G - d.bedH, w: d.bedW, h: d.bedH },
      bed_BL: { c: 0, r: 0, w: d.bedW, h: d.bedH },
      bed_TR: { c: G - d.bedW, r: G - d.bedH, w: d.bedW, h: d.bedH },
      bed_BR: { c: G - d.bedW, r: 0, w: d.bedW, h: d.bedH },
      bed_ML: { c: 0, r: midBedR, w: d.bedW, h: d.bedH },
      bed_MR: { c: G - d.bedW, r: midBedR, w: d.bedW, h: d.bedH },
      bed_TC: { c: midBedC, r: G - d.bedH, w: d.bedW, h: d.bedH },

      bath_TL: { c: d.bedW, r: G - d.bathH, w: d.bathW, h: d.bathH },
      bath_TR: { c: G - d.bathW - d.bedW, r: G - d.bathH, w: d.bathW, h: d.bathH },
      bath_BL: { c: d.bedW, r: 0, w: d.bathW, h: d.bathH },
      bath_BR: { c: G - d.bathW - d.bedW, r: 0, w: d.bathW, h: d.bathH },
      bath_TC: { c: midBathC, r: G - d.bathH, w: d.bathW, h: d.bathH },
      bath_BC: { c: midBathC, r: 0, w: d.bathW, h: d.bathH },
      bath_ML: { c: 0, r: midBedR, w: d.bathW, h: d.bathH },
      bath_MR: { c: G - d.bathW, r: midBedR, w: d.bathW, h: d.bathH },
      /* Extra tier-3 slots for 5+5 dense plans */
      bath_M7L: { c: 0, r: midBedR + d.bedH, w: d.bathW, h: d.bathH },
      bath_M7R: { c: G - d.bathW, r: midBedR + d.bedH, w: d.bathW, h: d.bathH },
      bath_M8L: { c: 0, r: midBedR + d.bedH + 1, w: d.bathW, h: d.bathH },
      bath_M8R: { c: G - d.bathW, r: midBedR + d.bedH + 1, w: d.bathW, h: d.bathH },
      bath_mid7: { c: d.bedW, r: midBedR + d.bedH, w: d.bathW, h: d.bathH },
      bath_mid8: { c: G - d.bathW - d.bedW, r: midBedR + d.bedH + 1, w: d.bathW, h: d.bathH },
    };
  }

  function createGrid() {
    var grid = [];
    var r;
    for (r = 0; r < GR; r++) {
      grid.push(new Array(GR).fill(null));
    }
    return grid;
  }

  function canPlace(grid, c, r, w, h) {
    if (c < 0 || r < 0 || c + w > GR || r + h > GR) return false;
    var y;
    var x;
    for (y = r; y < r + h; y++) {
      for (x = c; x < c + w; x++) {
        if (grid[y][x]) return false;
      }
    }
    return true;
  }

  function markGrid(grid, c, r, w, h, key) {
    var y;
    var x;
    for (y = r; y < r + h; y++) {
      for (x = c; x < c + w; x++) {
        grid[y][x] = key;
      }
    }
  }

  function slotToRoom(slot, key) {
    return room(key, slot.c / GR, (slot.c + slot.w) / GR, slot.r / GR, (slot.r + slot.h) / GR);
  }

  function rotatedChoices(pool, start, count, i) {
    var choices = [];
    var j;
    for (j = 0; j < pool.length; j++) {
      choices.push(pool[(start + i * 2 + j) % pool.length]);
    }
    return choices;
  }

  function tryPlaceNamed(grid, resolved, names, key, rooms) {
    var i;
    for (i = 0; i < names.length; i++) {
      var slot = resolved[names[i]];
      if (!slot) continue;
      if (!canPlace(grid, slot.c, slot.r, slot.w, slot.h)) continue;
      markGrid(grid, slot.c, slot.r, slot.w, slot.h, key);
      rooms.push(slotToRoom(slot, key));
      return true;
    }
    return false;
  }

  function livingRectsFromGrid(grid) {
    var rects = [];
    var active = {};
    var r;
    var c;

    for (r = 0; r < GR; r++) {
      var runs = [];
      c = 0;
      while (c < GR) {
        while (c < GR && grid[r][c]) c++;
        var start = c;
        while (c < GR && !grid[r][c]) c++;
        if (c > start) runs.push({ x0: start, x1: c });
      }

      var newActive = {};
      var ri;
      for (ri = 0; ri < runs.length; ri++) {
        var run = runs[ri];
        var key = run.x0 + '-' + run.x1;
        if (active[key]) {
          active[key].r1 = r + 1;
          newActive[key] = active[key];
        } else {
          newActive[key] = { c0: run.x0, c1: run.x1, r0: r, r1: r + 1 };
        }
      }

      Object.keys(active).forEach(function (k) {
        if (!newActive[k]) {
          var a = active[k];
          rects.push(room('living', a.c0 / GR, a.c1 / GR, a.r0 / GR, a.r1 / GR));
        }
      });
      active = newActive;
    }

    Object.keys(active).forEach(function (k) {
      var a = active[k];
      rects.push(room('living', a.c0 / GR, a.c1 / GR, a.r0 / GR, a.r1 / GR));
    });

    return rects;
  }

  function buildScatterLayout(bedCount, bathCount) {
    var beds = clamp(bedCount, 1, 5);
    var baths = clamp(bathCount, 1, 5);
    var d = tileDims(beds, baths);
    var resolved = resolveSlots(d);
    var grid = createGrid();
    var satellites = [];
    var explicit = EXPLICIT_SLOTS[beds + 'x' + baths];
    var bi;
    var bai;

    if (explicit) {
      tryPlaceNamed(grid, resolved, explicit.kitchen, 'kitchen', satellites);
      for (bi = 0; bi < explicit.beds.length; bi++) {
        tryPlaceNamed(grid, resolved, explicit.beds[bi], 'bedroom', satellites);
      }
      for (bai = 0; bai < explicit.baths.length; bai++) {
        tryPlaceNamed(grid, resolved, explicit.baths[bai], 'bathroom', satellites);
      }
    } else {
      var kitName = KITCHEN_BY_COUNT[beds - 1][baths - 1];
      tryPlaceNamed(
        grid,
        resolved,
        [kitName, 'kit_TL', 'kit_BL', 'kit_TR', 'kit_TC', 'kit_MR', 'kit_BC'],
        'kitchen',
        satellites
      );

      var bedStart = (beds * 2 + baths) % BED_POOL.length;
      var bathStart = (beds + baths * 3 + 1) % BATH_POOL.length;

      for (bi = 0; bi < beds; bi++) {
        tryPlaceNamed(
          grid,
          resolved,
          rotatedChoices(BED_POOL, bedStart, beds, bi),
          'bedroom',
          satellites
        );
      }

      for (bai = 0; bai < baths; bai++) {
        tryPlaceNamed(
          grid,
          resolved,
          rotatedChoices(BATH_POOL, bathStart, baths, bai),
          'bathroom',
          satellites
        );
      }
    }

    var living = livingRectsFromGrid(grid);
    if (!living.length) {
      living.push(room('living', 0.34, 1, 0.1, 0.9));
    }

    return satellites.concat(living);
  }

  var LAYOUT_CACHE = {};
  var LAYOUT_VERSION = 6;

  function getCachedLayout(b, ba) {
    var key = LAYOUT_VERSION + ':' + b + 'x' + ba;
    if (!LAYOUT_CACHE[key]) {
      LAYOUT_CACHE[key] = buildScatterLayout(b, ba);
    }
    return copyRooms(LAYOUT_CACHE[key]);
  }

  function templateKey(apt) {
    var c = normalizeCounts(apt);
    return c.bedrooms + '-' + c.kitchens + '-' + c.bathrooms + '-' + c.livingRooms;
  }

  function getApartmentPlanRooms(apt, options) {
    options = options || {};
    var c = normalizeCounts(apt);
    var rooms = getCachedLayout(c.bedrooms, c.bathrooms);
    if (options.mirror) {
      rooms = mirrorRoomsHoriz(rooms);
    }
    return rooms;
  }

  function hasApartmentPlanTemplate(apt) {
    var c = normalizeCounts(apt);
    return c.bedrooms >= 1 && c.bedrooms <= 5 && c.bathrooms >= 1 && c.bathrooms <= 5;
  }

  window.ApartmentPlanTemplates = {
    getApartmentPlanRooms: getApartmentPlanRooms,
    hasApartmentPlanTemplate: hasApartmentPlanTemplate,
    mirrorRoomsHoriz: mirrorRoomsHoriz,
    buildScatterLayout: buildScatterLayout,
    livingRectsFromGrid: livingRectsFromGrid,
    normalizeCounts: normalizeCounts,
    templateKey: templateKey,
    KITCHEN_BY_COUNT: KITCHEN_BY_COUNT,
  };
})();
