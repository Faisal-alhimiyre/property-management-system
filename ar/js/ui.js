/** Form validation and input handling. */

(function () {
  'use strict';

  var DEFAULT_WIDTH = 20;
  var DEFAULT_DEPTH = 20;
  var DEFAULT_CEILING = 3;
  var DEFAULT_KITCHENS = 1;
  var DEFAULT_LIVING_ROOMS = 1;

  /**
   * @returns {HTMLFormElement|null}
   */
  function getForm() {
    return document.getElementById('building-form');
  }

  /**
   * @param {string} text
   */
  function setMessage(text) {
    var el = document.getElementById('form-message');
    if (el) el.textContent = text || '';
  }

  /**
   * Parse numbers safely; fallback to default if blank/invalid.
   * @param {HTMLInputElement|null} input
   * @param {number} fallback
   * @returns {number}
   */
  function readNumber(input, fallback) {
    if (!input) return fallback;
    var v = parseFloat(input.value);
    return isFinite(v) ? v : fallback;
  }

  /** Updates the live summary under Building. */
  function syncFootprintMath() {
    var form = getForm();
    if (!form) return;

    var floors = Math.round(readNumber(form.querySelector('#floors'), 5));
    var apartments = Math.round(readNumber(form.querySelector('#apartments'), 1));
    var statsEl = document.getElementById('form-stats');

    if (statsEl) {
      statsEl.textContent =
        floors +
        ' floor' +
        (floors === 1 ? '' : 's') +
        ' · ' +
        apartments +
        ' apartment' +
        (apartments === 1 ? '' : 's') +
        ' per floor';
    }
  }

  /**
   * Reads current numeric inputs into a plain object consumed by BuildingGenerator.
   * @returns {object|null}
   */
  function readBuildingSpecFromForm() {
    var form = getForm();
    if (!form) return null;

    var floors = Math.round(readNumber(form.querySelector('#floors'), 5));
    var apartments = Math.round(readNumber(form.querySelector('#apartments'), 1));
    var bedrooms = Math.round(readNumber(form.querySelector('#bedrooms'), 2));
    var bathrooms = Math.round(readNumber(form.querySelector('#bathrooms'), 1));
    var height = Math.max(0.5, floors * DEFAULT_CEILING);

    return {
      width: DEFAULT_WIDTH,
      depth: DEFAULT_DEPTH,
      height: height,
      floors: floors,
      ceiling: DEFAULT_CEILING,
      apartments: apartments,
      facadeColor: DEFAULT_FACADE,
      apartment: {
        bedrooms: bedrooms,
        kitchens: DEFAULT_KITCHENS,
        bathrooms: bathrooms,
        hallways: 0,
        livingRooms: DEFAULT_LIVING_ROOMS,
      },
    };
  }

  /**
   * @param {ReturnType<typeof readBuildingSpecFromForm>} spec
   * @returns {string|null} error message or null if OK
   */
  function validateSpec(spec) {
    if (!spec) return 'Missing form.';
    if (!(spec.floors >= 1)) return 'Floors must be at least 1.';
    if (!(spec.apartments >= 1)) return 'Apartments must be at least 1.';
    var apt = spec.apartment;
    var lr = typeof apt.livingRooms === 'number' ? apt.livingRooms : 0;
    if (apt.bedrooms < 0 || apt.kitchens < 0 || apt.bathrooms < 0 || lr < 0) {
      return 'Room counts cannot be negative.';
    }
    if (apt.bedrooms + apt.kitchens + apt.bathrooms + lr < 1 && !spec.useFixedApartmentTemplate) {
      return 'Add at least one room so the floor plan has something to place.';
    }
    return null;
  }

  /**
   * @param {(spec: object) => void} onSubmitValid
   */
  function bindForm(onSubmitValid) {
    var form = getForm();
    if (!form) return;

    function onInput() {
      syncFootprintMath();
    }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    syncFootprintMath();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      syncFootprintMath();
      var spec = readBuildingSpecFromForm();
      var err = validateSpec(spec);
      if (err) {
        setMessage(err);
        return;
      }
      setMessage('Saved — opening 3D preview…');
      onSubmitValid(spec);
    });
  }

  window.Ui = {
    bindForm: bindForm,
    setMessage: setMessage,
    readBuildingSpecFromForm: readBuildingSpecFromForm,
    validateSpec: validateSpec,
    syncFootprintMath: syncFootprintMath,
  };
})();
