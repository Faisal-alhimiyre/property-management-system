/**
 * Full-page unit layout wizard after create building (or resume incomplete layout).
 * Query: ?buildingId=...
 */
document.addEventListener("DOMContentLoaded", async () => {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  function setBuildingLayoutLoading(isLoading) {
    document.body.classList.toggle("building-layout--loading", !!isLoading);
    const main = document.querySelector(".building-layout-page");
    const loadingEl = document.getElementById("buildingLayoutLoading");
    const shell = document.getElementById("buildingLayoutShell");
    const nameEl = document.getElementById("layoutBuildingName");
    if (main) main.setAttribute("aria-busy", isLoading ? "true" : "false");
    if (loadingEl) {
      loadingEl.hidden = !isLoading;
      if (!isLoading) loadingEl.remove();
    }
    if (shell) shell.hidden = !!isLoading;
    if (nameEl) nameEl.hidden = !!isLoading;
  }

  setBuildingLayoutLoading(true);

  if (typeof WalajnaAuth !== "undefined" && WalajnaAuth.hydrateSession) {
    await WalajnaAuth.hydrateSession();
  }
  if (typeof requireAuth === "function" && !requireAuth()) return;
  if (typeof requireRole === "function" && !requireRole("owner")) return;

  const params = new URLSearchParams(window.location.search);
  const buildingId = String(params.get("buildingId") || "").trim();
  if (!buildingId) {
    alert(T("building.notFound"));
    window.location.href = "owner_home.html";
    return;
  }

  let building = null;
  let apartments = [];
  let apiLoadError = null;
  let apiPathBuildingId = buildingId;

  function apartmentRowMatchesBuildingRef(a, urlParam, bld) {
    const ab = String(a.buildingId ?? a.building_id ?? "");
    const urlP = String(urlParam ?? "");
    if (!bld) return ab === urlP;
    const pk = String(bld.id ?? "");
    const bc = bld.code != null ? String(bld.code).trim() : "";
    return ab === urlP || ab === pk || (!!bc && ab === bc);
  }

  try {
    const bRes = await WalajnaAuth.fetchWithAuth(
      `${WalajnaAuth.API_BASE}/api/buildings`,
      { method: "GET" }
    );
    if (!bRes.ok) throw new Error("buildings");
    const list = await bRes.json();
    const raw = (Array.isArray(list) ? list : []).find(
      (b) => String(b.id) === buildingId || String(b.code ?? "").trim() === buildingId
    );
    if (!raw) throw new Error("not found");
    building = {
      ...raw,
      id: String(raw.id),
      apartmentCount: raw.apartmentCount ?? raw.apartments_count ?? 0,
      totalFloors: raw.totalFloors ?? raw.total_floors ?? null,
    };
    apiPathBuildingId = building.id;
    const title = document.getElementById("layoutBuildingName");
    if (title) title.textContent = building.name || T("building.detailsWizardTitle");

    if (typeof WalajnaApartmentsApi !== "undefined" && WalajnaApartmentsApi.listForBuilding) {
      apartments = await WalajnaApartmentsApi.listForBuilding(building.id);
    }
    if (
      WalajnaApartmentsApi?.isBuildingUnitLayoutComplete?.(building, apartments)
    ) {
      window.location.replace(
        "owner_building.html?buildingId=" + encodeURIComponent(String(building.id))
      );
      return;
    }
  } catch (e) {
    apiLoadError = e;
    console.warn("[building-layout] load failed", e);
    alert(T("building.notFound"));
    window.location.href = "owner_home.html";
    return;
  }

  /** Per-floor apartment counts → room mix per unit (POST /api/buildings/:id/unit-layout). */
  const buildingDetailsModal =
    document.getElementById("buildingDetailsModal") ||
    document.getElementById("buildingLayoutShell");
  let wizardUnitsDraft = [];
  let wizardBulkPendingKey = "";

  function layoutDraftStorageKey() {
    return "walajna_building_layout_draft:" + String(apiPathBuildingId);
  }

  function loadLayoutDraft() {
    try {
      const raw = localStorage.getItem(layoutDraftStorageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function clearLayoutDraft() {
    try {
      localStorage.removeItem(layoutDraftStorageKey());
    } catch {
      /* ignore */
    }
  }

  function readFloorCountsArray() {
    const floors = getWizardFloorCount();
    const counts = [];
    for (let f = 1; f <= floors; f++) {
      const inp = document.getElementById(`floorCount${f}`);
      const v = String(inp?.value ?? "").trim();
      if (v === "" || !/^\d+$/.test(v)) counts.push(0);
      else counts.push(Number(v));
    }
    return counts;
  }

  function applyFloorCountsArray(counts) {
    if (!Array.isArray(counts)) return;
    const floors = getWizardFloorCount();
    for (let f = 1; f <= floors; f++) {
      const inp = document.getElementById(`floorCount${f}`);
      if (!inp) continue;
      const n = counts[f - 1];
      inp.value = n == null || !Number.isFinite(Number(n)) ? "0" : String(Math.max(0, Number(n)));
    }
  }

  function normalizeDraftUnits(units) {
    if (!Array.isArray(units)) return [];
    return units
      .map((u) => ({
        floor_number: Math.max(1, Number(u.floor_number ?? u.floorNumber ?? 1) || 1),
        apartment_number: String(u.apartment_number ?? u.apartmentNumber ?? "").trim(),
        bedrooms: Math.max(0, Number(u.bedrooms ?? 0) || 0),
        bathrooms: Math.max(0, Number(u.bathrooms ?? 0) || 0),
        living_rooms: Math.max(0, Number(u.living_rooms ?? u.livingRooms ?? 0) || 0),
      }))
      .filter((u) => u.apartment_number);
  }

  function persistLayoutDraft(step) {
    const floors = getWizardFloorCount();
    const floorCounts = readFloorCountsArray();
    if (floorCounts.length !== floors) return;
    const payload = {
      buildingId: String(apiPathBuildingId),
      step: Math.max(1, Number(step) || 1),
      floorCounts,
      totalFloors: floors,
      units: wizardUnitsDraft.length ? wizardUnitsDraft : undefined,
      updatedAt: Date.now(),
    };
    try {
      localStorage.setItem(layoutDraftStorageKey(), JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function draftUnitsMatchCapacity(units) {
    const cap = getWizardApartmentsCapacity();
    if (!Array.isArray(units) || !units.length) return false;
    if (cap >= 1) return units.length === cap;
    return units.length >= 1;
  }

  function setWizardFooterMode(mode) {
    const nextBtn = document.getElementById("buildingDetailsNextBtn");
    const backBtn = document.getElementById("buildingDetailsBackBtn");
    const saveBtn = document.getElementById("buildingDetailsSaveBtn");
    const confirmSaveBtn = document.getElementById("buildingDetailsConfirmSaveBtn");
    if (nextBtn) nextBtn.hidden = mode !== "step1";
    if (saveBtn) saveBtn.hidden = mode !== "step2";
    if (confirmSaveBtn) confirmSaveBtn.hidden = mode !== "step3";
    if (backBtn) backBtn.hidden = mode === "step1";
  }

  function resetBuildingDetailsWizard() {
    wizardUnitsDraft = [];
    wizardBulkPendingKey = "";
    const err = document.getElementById("buildingDetailsError");
    if (err) err.textContent = "";
    const step1 = document.getElementById("buildingDetailsStep1Wrap");
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    if (step3) step3.hidden = true;
    if (step2) step2.hidden = true;
    if (step1) step1.hidden = false;
    const nextBtn = document.getElementById("buildingDetailsNextBtn");
    if (nextBtn) nextBtn.disabled = true;
    setWizardFooterMode("step1");
    const titleEl = document.getElementById("buildingDetailsModalTitle");
    const sub = document.getElementById("buildingDetailsModalSubtitle");
    if (titleEl) titleEl.textContent = T("building.detailsWizardTitle");
    if (sub) sub.textContent = T("building.detailsWizardStep1Short");
  }

  function closeBuildingDetailsModal() {
    window.location.href = "owner_home.html";
  }

  function resolveWizardTotalFloors() {
    const fromBuilding = Number(building?.totalFloors ?? building?.total_floors ?? 0);
    if (fromBuilding >= 1) return Math.min(200, fromBuilding);
    let maxF = 0;
    for (const a of apartments) {
      if (!apartmentRowMatchesBuildingRef(a, buildingId, building)) continue;
      const f = Number(a.floorNumber ?? a.floor_number ?? 0);
      if (Number.isFinite(f) && f > maxF) maxF = f;
    }
    if (maxF >= 1) return Math.min(200, maxF);
    return 1;
  }

  function getWizardFloorCount() {
    const el = document.getElementById("wizardTotalFloorsInput");
    const n = el ? Number(el.value) : 0;
    return Math.min(200, Math.max(1, n || 1));
  }

  /** Registered apartment capacity from add-building / building record (0 = not set, no cap in UI). */
  function getWizardApartmentsCapacity() {
    const c = Number(building?.apartmentCount ?? building?.apartments_count ?? 0);
    return Number.isFinite(c) && c >= 1 ? Math.floor(c) : 0;
  }

  function bindPerFloorInputs() {
    const wrap = document.getElementById("buildingDetailsPerFloorFields");
    if (!wrap) return;
    wrap.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const floorsDone = validateFloorCountsStep();
        // Save progress so refresh / home badge can resume (jump to rooms when floors are done).
        persistLayoutDraft(floorsDone ? 2 : 1);
      });
    });
  }

  function renderPerFloorCountFields() {
    const wrap = document.getElementById("buildingDetailsPerFloorFields");
    if (!wrap) return;
    const floors = getWizardFloorCount();
    wrap.innerHTML = "";
    for (let f = 1; f <= floors; f++) {
      const row = document.createElement("div");
      row.className = "building-details-floor-row";
      const label = document.createElement("label");
      label.className = "label";
      label.htmlFor = `floorCount${f}`;
      label.textContent = T("building.floorAptsShort", { n: f });
      label.title = T("building.apartmentsOnFloor", { n: f });
      const input = document.createElement("input");
      input.type = "number";
      input.id = `floorCount${f}`;
      input.min = "0";
      input.step = "1";
      input.value = "0";
      input.inputMode = "numeric";
      row.appendChild(label);
      row.appendChild(input);
      wrap.appendChild(row);
    }
    bindPerFloorInputs();
    updateLayoutRemainingCounter();
    validateFloorCountsStep();
  }

  function readFloorCountsSum() {
    const floors = getWizardFloorCount();
    let sum = 0;
    let ok = true;
    for (let f = 1; f <= floors; f++) {
      const inp = document.getElementById(`floorCount${f}`);
      if (!inp) {
        ok = false;
        break;
      }
      const v = String(inp.value ?? "").trim();
      // Empty counts as 0 so remaining updates while typing (not only after the last floor).
      if (v === "") {
        continue;
      }
      if (!/^\d+$/.test(v)) {
        ok = false;
        break;
      }
      const n = Number(v);
      if (n < 0 || !Number.isFinite(n)) {
        ok = false;
        break;
      }
      sum += n;
    }
    return { sum, ok };
  }

  function updateLayoutRemainingCounter() {
    const bar = document.getElementById("buildingLayoutRemainingBar");
    const countEl = document.getElementById("buildingLayoutRemainingCount");
    const cap = getWizardApartmentsCapacity();
    if (!bar || !countEl) return;
    // Never flash "0 remaining" before the floor fields exist.
    const floorsReady = document.querySelectorAll("#buildingDetailsPerFloorFields input").length > 0;
    if (cap < 1 || !floorsReady || document.body.classList.contains("building-layout--loading")) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const { sum, ok } = readFloorCountsSum();
    const remaining = cap - sum;
    countEl.textContent = String(remaining);
    bar.classList.toggle("is-complete", ok && remaining === 0);
    bar.classList.toggle("is-over", ok && remaining < 0);
  }

  function validateFloorCountsStep() {
    const nextBtn = document.getElementById("buildingDetailsNextBtn");
    const errEl = document.getElementById("buildingDetailsError");
    if (!nextBtn) return false;
    const { sum, ok } = readFloorCountsSum();
    const cap = getWizardApartmentsCapacity();
    let valid = false;
    if (ok) {
      if (cap >= 1) valid = sum === cap;
      else valid = sum >= 1;
    }

    updateLayoutRemainingCounter();
    nextBtn.disabled = !valid;

    if (errEl) {
      if (!ok) {
        errEl.textContent = T("building.layoutNeedCountsShort");
      } else if (cap >= 1 && sum > cap) {
        errEl.textContent = T("building.layoutOverCapacity", { n: cap });
      } else if (cap < 1 && sum < 1) {
        errEl.textContent = T("building.layoutNeedCountsShort");
      } else {
        errEl.textContent = "";
      }
    }
    return valid;
  }

  function openBuildingDetailsWizard() {
    if (apiLoadError) {
      alert(T("building.wizardNeedsServer"));
      return;
    }
    if (!building) {
      alert(T("building.noBuildingWizard"));
      return;
    }
    const tfInput = document.getElementById("wizardTotalFloorsInput");
    if (tfInput) tfInput.value = String(resolveWizardTotalFloors());
    resetBuildingDetailsWizard();
    renderPerFloorCountFields();

    const draft = loadLayoutDraft();
    const floors = getWizardFloorCount();
    if (
      draft &&
      Array.isArray(draft.floorCounts) &&
      draft.floorCounts.length === floors &&
      (draft.totalFloors == null || Number(draft.totalFloors) === floors)
    ) {
      applyFloorCountsArray(draft.floorCounts);
    }

    const floorsComplete = validateFloorCountsStep();
    const draftUnits = normalizeDraftUnits(draft?.units);
    const savedStep = Math.max(1, Number(draft?.step) || 1);

    // Floors already filled (even if they left before clicking Next) → resume at rooms step.
    if (floorsComplete) {
      if (draftUnitsMatchCapacity(draftUnits)) {
        wizardUnitsDraft = draftUnits;
      } else {
        wizardUnitsDraft = buildUnitsFromFloorCounts();
      }
      if (savedStep >= 3 && draftUnitsMatchCapacity(wizardUnitsDraft)) {
        enterWizardStep2({ keepUnits: true, resetBulk: false });
        showWizardStep3();
        persistLayoutDraft(3);
      } else {
        enterWizardStep2({ keepUnits: true, resetBulk: true });
        persistLayoutDraft(2);
      }
    }
  }

  function buildUnitsFromFloorCounts() {
    const floors = getWizardFloorCount();
    const units = [];
    let aptNum = 1;
    for (let f = 1; f <= floors; f++) {
      const inp = document.getElementById(`floorCount${f}`);
      const count = inp ? Math.max(0, Number(inp.value || 0)) : 0;
      for (let i = 0; i < count; i++) {
        units.push({
          floor_number: f,
          apartment_number: String(aptNum++),
          bedrooms: 0,
          bathrooms: 0,
          living_rooms: 0,
        });
      }
    }
    return units;
  }

  function wizardStep2ParseRoomInput(el) {
    if (!el) return { ok: false, value: 0 };
    const raw = String(el.value ?? "").trim();
    if (raw === "" || !/^\d+$/.test(raw)) return { ok: false, value: 0 };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { ok: false, value: 0 };
    return { ok: true, value: n };
  }

  function isWizardUnitRoomConfigured(idx) {
    const u = wizardUnitsDraft[idx];
    if (!u) return false;
    const fromDraft =
      Math.max(0, Number(u.bedrooms ?? 0)) +
        Math.max(0, Number(u.bathrooms ?? 0)) +
        Math.max(0, Number(u.living_rooms ?? 0)) >=
      1;
    if (fromDraft) return true;
    const b = document.getElementById(`unit-${idx}-bedrooms`);
    const ba = document.getElementById(`unit-${idx}-bathrooms`);
    const lv = document.getElementById(`unit-${idx}-living_rooms`);
    const pb = wizardStep2ParseRoomInput(b);
    const pba = wizardStep2ParseRoomInput(ba);
    const plv = wizardStep2ParseRoomInput(lv);
    if (!pb.ok || !pba.ok || !plv.ok) return false;
    return pb.value + pba.value + plv.value >= 1;
  }

  function getWizardUnitRoomValidation(idx) {
    const b = document.getElementById(`unit-${idx}-bedrooms`);
    const ba = document.getElementById(`unit-${idx}-bathrooms`);
    const lv = document.getElementById(`unit-${idx}-living_rooms`);
    const pb = wizardStep2ParseRoomInput(b);
    const pba = wizardStep2ParseRoomInput(ba);
    const plv = wizardStep2ParseRoomInput(lv);
    if (!pb.ok || !pba.ok || !plv.ok) {
      return { ok: false, errorKey: "building.layoutRoomsInvalid" };
    }
    if (pb.value + pba.value + plv.value < 1) {
      return { ok: false, errorKey: "building.layoutRoomsIncomplete" };
    }
    return { ok: true, errorKey: null };
  }

  function getWizardPendingUnitIndices() {
    const pending = [];
    for (let idx = 0; idx < wizardUnitsDraft.length; idx++) {
      if (!isWizardUnitRoomConfigured(idx)) pending.push(idx);
    }
    return pending;
  }

  function wizardAllUnitsRoomValidation() {
    if (!wizardUnitsDraft.length) return { ok: false, errorKey: "building.layoutRoomsIncomplete" };
    for (let idx = 0; idx < wizardUnitsDraft.length; idx++) {
      if (!isWizardUnitRoomConfigured(idx)) {
        return { ok: false, errorKey: "building.layoutRoomsIncomplete" };
      }
    }
    return { ok: true, errorKey: null };
  }

  function syncWizardStep2SaveState() {
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const saveBtn = document.getElementById("buildingDetailsSaveBtn");
    if (!step2 || step2.hidden || !saveBtn || saveBtn.hidden) return;
    saveBtn.disabled = !wizardUnitsDraft.length;
  }

  function collectAllConfirmIntoDraft() {
    wizardUnitsDraft.forEach((u, idx) => {
      const b = document.getElementById(`unit-${idx}-bedrooms`);
      const ba = document.getElementById(`unit-${idx}-bathrooms`);
      const lv = document.getElementById(`unit-${idx}-living_rooms`);
      if (!b && !ba && !lv) return;
      u.bedrooms = Math.max(0, Number(b?.value ?? 0));
      u.bathrooms = Math.max(0, Number(ba?.value ?? 0));
      u.living_rooms = Math.max(0, Number(lv?.value ?? 0));
    });
  }

  function syncWizardConfirmSaveState() {
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const confirmSaveBtn = document.getElementById("buildingDetailsConfirmSaveBtn");
    const errEl = document.getElementById("buildingDetailsError");
    if (!step3 || step3.hidden) return;
    collectAllConfirmIntoDraft();
    const v = wizardAllUnitsRoomValidation();
    if (confirmSaveBtn) confirmSaveBtn.disabled = !v.ok;
    if (errEl && !v.ok) errEl.textContent = T(v.errorKey);
    else if (errEl) errEl.textContent = "";
  }

  function renderWizardConfirmAll() {
    const wrap = document.getElementById("buildingDetailsConfirmFields");
    const progress = document.getElementById("wizardConfirmProgress");
    if (!wrap) return;
    wrap.innerHTML = "";
    const total = wizardUnitsDraft.length;
    if (progress) {
      progress.textContent = T("building.confirmAllApts", { total });
    }

    wizardUnitsDraft.forEach((u, idx) => {
      const row = document.createElement("div");
      row.className = "building-details-confirm-row";
      row.dataset.unitIdx = String(idx);

      const label = document.createElement("div");
      label.className = "building-details-confirm-row__label";
      label.textContent = `${T("building.aptLabel", { n: u.apartment_number })} · ${T("building.floorTitle", { n: u.floor_number })}`;

      function field(suffix, labelKey, value) {
        const d = document.createElement("div");
        d.className = "building-details-confirm-field";
        const l = document.createElement("label");
        l.className = "building-details-confirm-label";
        l.htmlFor = `unit-${idx}-${suffix}`;
        l.textContent = T(labelKey);
        const inp = document.createElement("input");
        inp.type = "number";
        inp.className = "building-details-confirm-input";
        inp.id = `unit-${idx}-${suffix}`;
        inp.min = "0";
        inp.step = "1";
        inp.inputMode = "numeric";
        inp.value = String(value ?? 0);
        d.appendChild(l);
        d.appendChild(inp);
        return d;
      }

      row.appendChild(label);
      row.appendChild(field("bedrooms", "lease.rooms", u.bedrooms));
      row.appendChild(field("bathrooms", "lease.bathrooms", u.bathrooms));
      row.appendChild(field("living_rooms", "lease.living", u.living_rooms));
      wrap.appendChild(row);
    });

    if (window.walajna_language && typeof window.walajna_language.apply === "function") {
      window.walajna_language.apply(wrap);
    }
    syncWizardConfirmSaveState();
  }

  function enterWizardStep2(options = {}) {
    const { keepUnits = false, resetBulk = true } = options;
    const errClear = document.getElementById("buildingDetailsError");
    if (errClear) errClear.textContent = "";
    if (!keepUnits) {
      wizardUnitsDraft = buildUnitsFromFloorCounts();
    }
    const step1 = document.getElementById("buildingDetailsStep1Wrap");
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const titleEl = document.getElementById("buildingDetailsModalTitle");
    const sub = document.getElementById("buildingDetailsModalSubtitle");
    if (step1) step1.hidden = true;
    if (step3) step3.hidden = true;
    if (step2) step2.hidden = false;
    if (titleEl) titleEl.textContent = T("building.detailsWizardTitle");
    if (sub) sub.textContent = T("building.detailsWizardStep2");
    setWizardFooterMode("step2");

    refreshWizardBulkChecklist({ resetBulkInputs: resetBulk });
    if (window.walajna_language && typeof window.walajna_language.apply === "function") {
      if (step2) window.walajna_language.apply(step2);
    }

    syncWizardStep2SaveState();
  }

  function showWizardStep2() {
    if (!validateFloorCountsStep()) return;
    enterWizardStep2({ keepUnits: false, resetBulk: true });
    persistLayoutDraft(2);
  }

  function showWizardStep3() {
    const errClear = document.getElementById("buildingDetailsError");
    if (errClear) errClear.textContent = "";
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const titleEl = document.getElementById("buildingDetailsModalTitle");
    const sub = document.getElementById("buildingDetailsModalSubtitle");
    if (step2) step2.hidden = true;
    if (step3) step3.hidden = false;
    if (titleEl) titleEl.textContent = T("building.confirmLayoutTitle");
    if (sub) sub.textContent = T("building.confirmLayoutSubtitle");
    setWizardFooterMode("step3");
    renderWizardConfirmAll();
    if (window.walajna_language && typeof window.walajna_language.apply === "function" && step3) {
      window.walajna_language.apply(step3);
    }
    persistLayoutDraft(3);
  }

  function proceedToWizardConfirm() {
    if (!wizardUnitsDraft.length) return;
    showWizardStep3();
  }

  function refreshWizardBulkChecklist(options = {}) {
    const { resetBulkInputs = false } = options;
    const box = document.getElementById("wizardBulkChecklist");
    const doneEl = document.getElementById("wizardBulkAllDone");
    const selectAllBtn = document.getElementById("wizardBulkSelectAllBtn");
    const applyRow = document.querySelector(".building-details-bulk-apply-row");
    if (!box) return;

    const pending = getWizardPendingUnitIndices();
    const pendingKey = pending.join(",");
    if (!resetBulkInputs && pendingKey === wizardBulkPendingKey) {
      return;
    }
    wizardBulkPendingKey = pendingKey;

    const checkedBefore = new Set(
      [...box.querySelectorAll('input[type="checkbox"].wizard-bulk-cb:checked')].map((cb) =>
        Number(cb.dataset.idx)
      )
    );

    box.innerHTML = "";

    if (pending.length === 0) {
      if (doneEl) doneEl.hidden = false;
      if (selectAllBtn) selectAllBtn.disabled = true;
      if (applyRow) applyRow.hidden = true;
    } else {
      if (doneEl) doneEl.hidden = true;
      if (selectAllBtn) selectAllBtn.disabled = false;
      if (applyRow) applyRow.hidden = false;
      pending.forEach((idx) => {
        const u = wizardUnitsDraft[idx];
        const lab = document.createElement("label");
        lab.className = "building-details-bulk-checkitem";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "wizard-bulk-cb";
        cb.dataset.idx = String(idx);
        if (checkedBefore.has(idx)) cb.checked = true;
        const span = document.createElement("span");
        span.textContent = T("building.aptLabel", { n: u.apartment_number });
        lab.appendChild(cb);
        lab.appendChild(span);
        box.appendChild(lab);
      });
    }

    if (resetBulkInputs) {
      const br = document.getElementById("wizardBulkBedrooms");
      const ba = document.getElementById("wizardBulkBathrooms");
      const lv = document.getElementById("wizardBulkLiving");
      if (br) br.value = "0";
      if (ba) ba.value = "0";
      if (lv) lv.value = "0";
    }

  }

  function applyWizardBulkRoomLayout() {
    const err = document.getElementById("buildingDetailsError");
    const box = document.getElementById("wizardBulkChecklist");
    const brIn = document.getElementById("wizardBulkBedrooms");
    const baIn = document.getElementById("wizardBulkBathrooms");
    const lvIn = document.getElementById("wizardBulkLiving");
    if (!box || !wizardUnitsDraft.length) return;
    const checked = box.querySelectorAll('input[type="checkbox"].wizard-bulk-cb:checked');
    if (!checked.length) {
      if (err) err.textContent = T("building.bulkNoneSelected");
      return;
    }
    const bedrooms = Math.max(0, Number(brIn?.value ?? 0));
    const bathrooms = Math.max(0, Number(baIn?.value ?? 0));
    const living = Math.max(0, Number(lvIn?.value ?? 0));
    checked.forEach((cb) => {
      const idx = Number(cb.dataset.idx);
      if (!Number.isFinite(idx) || idx < 0 || idx >= wizardUnitsDraft.length) return;
      const u = wizardUnitsDraft[idx];
      u.bedrooms = bedrooms;
      u.bathrooms = bathrooms;
      u.living_rooms = living;
    });
    if (err) err.textContent = "";
    refreshWizardBulkChecklist();
    syncWizardStep2SaveState();
    persistLayoutDraft(2);
  }

  function wizardBackToStep1() {
    const step1 = document.getElementById("buildingDetailsStep1Wrap");
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const titleEl = document.getElementById("buildingDetailsModalTitle");
    const sub = document.getElementById("buildingDetailsModalSubtitle");
    if (step3) step3.hidden = true;
    if (step1) step1.hidden = false;
    if (step2) step2.hidden = true;
    if (titleEl) titleEl.textContent = T("building.detailsWizardTitle");
    if (sub) sub.textContent = T("building.detailsWizardStep1Short");
    setWizardFooterMode("step1");
    validateFloorCountsStep();
    persistLayoutDraft(1);
  }

  function wizardBackToStep2() {
    const err = document.getElementById("buildingDetailsError");
    if (err) err.textContent = "";
    collectAllConfirmIntoDraft();
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const titleEl = document.getElementById("buildingDetailsModalTitle");
    const sub = document.getElementById("buildingDetailsModalSubtitle");
    if (step3) step3.hidden = true;
    if (step2) step2.hidden = false;
    if (titleEl) titleEl.textContent = T("building.detailsWizardTitle");
    if (sub) sub.textContent = T("building.detailsWizardStep2");
    setWizardFooterMode("step2");
    refreshWizardBulkChecklist();
    syncWizardStep2SaveState();
    persistLayoutDraft(2);
  }

  function wizardConfirmGoBack() {
    const step3 = document.getElementById("buildingDetailsStep3Wrap");
    const step2 = document.getElementById("buildingDetailsStep2Wrap");
    if (step3 && !step3.hidden) {
      collectAllConfirmIntoDraft();
      wizardBackToStep2();
      return;
    }
    if (step2 && !step2.hidden) {
      wizardBackToStep1();
    }
  }

  async function saveBuildingUnitLayout() {
    const confirmSaveBtn = document.getElementById("buildingDetailsConfirmSaveBtn");
    const err = document.getElementById("buildingDetailsError");
    collectAllConfirmIntoDraft();
    const v = wizardAllUnitsRoomValidation();
    if (!v.ok) {
      if (err) err.textContent = T(v.errorKey);
      syncWizardConfirmSaveState();
      return;
    }
    if (confirmSaveBtn) confirmSaveBtn.disabled = true;
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${WalajnaAuth.API_BASE}/api/buildings/${encodeURIComponent(String(apiPathBuildingId))}/unit-layout`,
        { method: "POST", body: JSON.stringify({ units: wizardUnitsDraft }) }
      );
      if (!res.ok) {
        let msg = T("building.layoutError");
        try {
          const j = await res.json();
          if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        } catch {
          /* ignore */
        }
        if (err) err.textContent = msg;
        if (confirmSaveBtn) confirmSaveBtn.disabled = false;
        syncWizardConfirmSaveState();
        return;
      }
      alert(T("building.layoutSaved"));
      clearLayoutDraft();
      window.location.href = "owner_building.html?buildingId=" + encodeURIComponent(String(apiPathBuildingId));
    } catch {
      if (err) err.textContent = T("building.layoutError");
      if (confirmSaveBtn) confirmSaveBtn.disabled = false;
      syncWizardConfirmSaveState();
    }
  }
  document.getElementById("closeBuildingDetailsModal")?.addEventListener("click", closeBuildingDetailsModal);
  document.getElementById("cancelBuildingDetailsModal")?.addEventListener("click", closeBuildingDetailsModal);
  document.querySelectorAll("[data-close-building-details]").forEach((el) => {
    el.addEventListener("click", closeBuildingDetailsModal);
  });
  document.getElementById("buildingDetailsNextBtn")?.addEventListener("click", showWizardStep2);
  document.getElementById("buildingDetailsBackBtn")?.addEventListener("click", wizardConfirmGoBack);
  document.getElementById("buildingDetailsSaveBtn")?.addEventListener("click", proceedToWizardConfirm);
  document.getElementById("buildingDetailsConfirmSaveBtn")?.addEventListener("click", () => {
    void saveBuildingUnitLayout();
  });
  document.getElementById("wizardBulkApplyBtn")?.addEventListener("click", applyWizardBulkRoomLayout);
  document.getElementById("wizardBulkSelectAllBtn")?.addEventListener("click", () => {
    document.querySelectorAll("#wizardBulkChecklist .wizard-bulk-cb:not(:disabled)").forEach((cb) => {
      cb.checked = true;
    });
  });
  document.getElementById("wizardBulkClearChecksBtn")?.addEventListener("click", () => {
    document.querySelectorAll("#wizardBulkChecklist .wizard-bulk-cb").forEach((cb) => {
      cb.checked = false;
    });
  });
  if (buildingDetailsModal) {
    buildingDetailsModal.addEventListener("input", (e) => {
      const confirmWrap = document.getElementById("buildingDetailsConfirmFields");
      if (confirmWrap && confirmWrap.contains(e.target)) {
        syncWizardConfirmSaveState();
        persistLayoutDraft(3);
        return;
      }
    });
  }

  openBuildingDetailsWizard();
  setBuildingLayoutLoading(false);
  updateLayoutRemainingCounter();
  if (window.walajna_language && window.walajna_language.apply) {
    window.walajna_language.apply(document.body);
  }
});
