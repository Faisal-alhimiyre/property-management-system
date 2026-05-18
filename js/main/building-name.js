/**
 * Building display names: fixed type affix (per language) + owner-entered label.
 * Arabic/Urdu: prefix before label ("عمارة الخالدية").
 * English: suffix after label ("Al Khalidiyah building").
 */
(function (global) {
  const LABEL_MIN_LEN = 3;
  const LABEL_MAX_LEN = 30;
  const FULL_MAX_LEN = 40;

  const STRIP_AFFIXES = [
    "عمارة",
    "عمارت",
    "عمارتیں",
    "building",
    "tower",
    "block",
    "برج",
  ];

  function t(key) {
    if (global.walajna_language && typeof global.walajna_language.t === "function") {
      return global.walajna_language.t(key);
    }
    return key;
  }

  function normalizeLabel(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getAffix() {
    const localized = normalizeLabel(t("owner.buildingNamePrefix"));
    return localized || "عمارة";
  }

  /** @returns {"prefix"|"suffix"} */
  function getAffixPosition() {
    const pos = normalizeLabel(t("owner.buildingNameAffixPosition")).toLowerCase();
    return pos === "after" ? "suffix" : "prefix";
  }

  function getPrefix() {
    return getAffix();
  }

  function stripAffix(fullName) {
    let label = normalizeLabel(fullName);
    if (!label) return "";

    const candidates = [getAffix(), ...STRIP_AFFIXES]
      .map((p) => normalizeLabel(p))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const affix of candidates) {
      const prefixRe = new RegExp(`^${escapeRegex(affix)}\\s+`, "iu");
      if (prefixRe.test(label)) {
        label = label.replace(prefixRe, "").trim();
        break;
      }
      const suffixRe = new RegExp(`\\s+${escapeRegex(affix)}$`, "iu");
      if (suffixRe.test(label)) {
        label = label.replace(suffixRe, "").trim();
        break;
      }
    }
    return label;
  }

  function compose(label) {
    const part = normalizeLabel(label);
    const affix = getAffix();
    if (!part) return affix;
    if (getAffixPosition() === "suffix") {
      return `${part} ${affix}`;
    }
    return `${affix} ${part}`;
  }

  function validateLabel(label) {
    const part = normalizeLabel(label);
    if (part.length < LABEL_MIN_LEN) {
      return { ok: false, code: "short", part };
    }
    if (part.length > LABEL_MAX_LEN) {
      return { ok: false, code: "long", part };
    }
    const full = compose(part);
    if (full.length > FULL_MAX_LEN) {
      return { ok: false, code: "full_long", part, full };
    }
    return { ok: true, part, full };
  }

  global.WalajnaBuildingName = {
    LABEL_MIN_LEN,
    LABEL_MAX_LEN,
    FULL_MAX_LEN,
    getAffix,
    getAffixPosition,
    getPrefix,
    normalizeLabel,
    stripAffix,
    stripPrefix: stripAffix,
    compose,
    validateLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
