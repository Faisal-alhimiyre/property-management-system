(function (global) {
  "use strict";
  /** Saudi national ID: 1… ; Iqama: 2… — 10 digits (format only; no checksum). */
  var RE_SAUDI_NATIONAL_OR_IQAMA = /^[12]\d{9}$/;

  function isSaudiNationalOrIqamaFormat(value) {
    return RE_SAUDI_NATIONAL_OR_IQAMA.test(String(value == null ? "" : value).trim());
  }

  global.isSaudiNationalOrIqamaFormat = isSaudiNationalOrIqamaFormat;
})(typeof window !== "undefined" ? window : globalThis);
