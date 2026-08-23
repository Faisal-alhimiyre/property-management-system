/**
 * Compact insurance refund / settlement prompts.
 * Does not change rent, costs, or profit — records ledger refunds only.
 */
(function () {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  function formatMoney(value) {
    const n = Number(value || 0);
    const loc =
      window.walajna_language &&
      typeof window.walajna_language.localeForNumbers === "function"
        ? window.walajna_language.localeForNumbers()
        : "ar-SA-u-nu-latn";
    return `${n.toLocaleString(loc)} ${T("common.sar")}`;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  async function fetchBalance(contractId) {
    if (
      !contractId ||
      typeof WalajnaAuth === "undefined" ||
      !WalajnaAuth.fetchWithAuth
    ) {
      return null;
    }
    const res = await WalajnaAuth.fetchWithAuth(
      `${WalajnaAuth.API_BASE}/api/deposits/balance?contract_id=${encodeURIComponent(
        String(contractId)
      )}`,
      { method: "GET" }
    );
    if (!res.ok) return null;
    return res.json();
  }

  function ensureModal() {
    let modal = document.getElementById("insuranceSettleModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "insuranceSettleModal";
    modal.className = "wl-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="wl-modal__backdrop" data-ins-settle-close="true"></div>
      <div class="wl-modal__panel ins-settle-panel" role="dialog" aria-modal="true">
        <div class="wl-modal__header">
          <div>
            <h3 class="wl-modal__title" id="insSettleTitle"></h3>
          </div>
          <button type="button" class="wl-icon-btn" data-ins-settle-close="true" aria-label="✕">✕</button>
        </div>
        <div class="wl-modal__body">
          <div class="ins-settle-table">
            <div id="insSettleRows"></div>
            <div class="ins-settle-row ins-settle-row--input">
              <label for="insSettleRefundInput" id="insSettleRefundLabel"></label>
              <input id="insSettleRefundInput" class="ins-settle-input" type="text" inputmode="decimal" autocomplete="off" />
            </div>
            <div id="insSettleLeftover" class="ins-settle-row ins-settle-row--leftover"></div>
          </div>
          <p id="insSettleError" class="error ins-settle-error" role="alert"></p>
        </div>
        <div class="wl-modal__footer">
          <button type="button" class="wl-btn wl-btn--ghost" data-ins-settle-close="true" id="insSettleCancelBtn"></button>
          <button type="button" class="wl-btn wl-btn--primary" id="insSettleConfirmBtn"></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (!document.getElementById("insSettleStyles")) {
      const style = document.createElement("style");
      style.id = "insSettleStyles";
      style.textContent = `
        #insuranceSettleModal .ins-settle-panel{width:min(440px,92vw);}
        #insuranceSettleModal .wl-modal__body{padding:16px 18px 8px;}
        #insuranceSettleModal .wl-modal__footer{display:flex;justify-content:flex-start;gap:10px;padding:14px 18px 18px;}
        #insuranceSettleModal .wl-btn--primary{
          background:linear-gradient(135deg,#ef4444,#dc2626);
          border:none;
          color:#fff;
          box-shadow:0 10px 22px rgba(220,38,38,.18);
        }
        #insuranceSettleModal .wl-btn--primary:hover{
          background:linear-gradient(135deg,#dc2626,#b91c1c);
          box-shadow:0 14px 24px rgba(220,38,38,.28);
        }
        #insuranceSettleModal .wl-btn--ghost{
          background:#fff;
          border:1px solid #fecaca;
          color:#b91c1c;
        }
        #insuranceSettleModal .wl-btn--ghost:hover{
          background:#fef2f2;
          border-color:#fca5a5;
        }
        .ins-settle-table{border:1px solid #dbe4ee;border-radius:14px;overflow:hidden;background:#fff;}
        #insSettleRows{display:contents;}
        .ins-settle-row{display:grid;grid-template-columns:minmax(0,1fr) 9.5rem;align-items:center;gap:12px;padding:11px 14px;font-size:13px;border-bottom:1px solid #edf2f7;margin:0;}
        .ins-settle-row:last-child{border-bottom:0;}
        .ins-settle-row span,
        .ins-settle-row label{color:#64748b;font-weight:700;}
        .ins-settle-row strong{font-weight:900;text-align:start;font-variant-numeric:tabular-nums;color:#0f2740;}
        .ins-settle-row--input{background:#f8fafc;}
        .ins-settle-input{width:100%;height:38px;box-sizing:border-box;border:1px solid #dbe4ee;border-radius:10px;padding:0 10px;font-size:14px;font-weight:800;text-align:start;font-variant-numeric:tabular-nums;color:#0f2740;background:#fff;}
        .ins-settle-input:focus{outline:none;border-color:#18c7c3;box-shadow:0 0 0 3px rgba(24,199,195,.18);}
        .ins-settle-row--leftover strong.is-leftover{color:#b45309;}
        .ins-settle-error{min-height:1.2em;margin:10px 2px 0;font-size:13px;font-weight:700;color:#b91c1c;}
        body.dark-mode .ins-settle-table{background:#101825;border-color:rgba(148,163,184,.35);}
        body.dark-mode .ins-settle-row{border-bottom-color:rgba(148,163,184,.18);}
        body.dark-mode .ins-settle-row--input{background:#0b1220;}
        body.dark-mode .ins-settle-row strong{color:#e5edf7;}
        body.dark-mode .ins-settle-input{background:#0b1220;border-color:rgba(148,163,184,.35);color:#e5edf7;}
      `;
      document.head.appendChild(style);
    }
    return modal;
  }

  function openModal() {
    const modal = ensureModal();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById("insuranceSettleModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function promptRefundAmount({ mode, summary }) {
    return new Promise((resolve) => {
      const available = round2(summary.remaining);
      const modal = openModal();
      const title = document.getElementById("insSettleTitle");
      const rows = document.getElementById("insSettleRows");
      const label = document.getElementById("insSettleRefundLabel");
      const input = document.getElementById("insSettleRefundInput");
      const leftoverEl = document.getElementById("insSettleLeftover");
      const errEl = document.getElementById("insSettleError");
      const confirmBtn = document.getElementById("insSettleConfirmBtn");
      const cancelBtn = document.getElementById("insSettleCancelBtn");

      if (title) title.textContent = T("insSettle.title");
      if (label) {
        label.textContent = T("insSettle.refundLabel");
      }
      if (confirmBtn) {
        confirmBtn.textContent =
          mode === "settle" ? T("insSettle.confirmSettle") : T("insSettle.continueEvict");
      }
      if (cancelBtn) cancelBtn.textContent = T("common.cancel");
      if (errEl) errEl.textContent = "";

      const original = round2(summary.original);
      const used = round2(summary.used);
      if (rows) {
        if (mode === "settle") {
          rows.innerHTML = `
            <div class="ins-settle-row"><span>${T("insSettle.unsettled")}</span><strong>${formatMoney(available)}</strong></div>
          `;
        } else {
          rows.innerHTML = `
            <div class="ins-settle-row"><span>${T("insSettle.original")}</span><strong>${formatMoney(original)}</strong></div>
            <div class="ins-settle-row"><span>${T("insSettle.used")}</span><strong>${formatMoney(used)}</strong></div>
            <div class="ins-settle-row"><span>${T("insSettle.available")}</span><strong>${formatMoney(available)}</strong></div>
          `;
        }
      }

      const updateLeftover = () => {
        const raw = Number(input && input.value);
        const refund = Number.isFinite(raw) ? round2(raw) : 0;
        const left = round2(Math.max(0, available - refund));
        if (leftoverEl) {
          leftoverEl.innerHTML = `<span>${T("insSettle.leftover")}</span><strong class="${
            left > 0.009 ? "is-leftover" : ""
          }">${formatMoney(left)}</strong>`;
        }
      };

      if (input) {
        input.min = "0";
        input.max = String(available);
        input.value = String(available);
        input.oninput = () => {
          input.value = String(input.value || "").replace(/[^\d.]/g, "");
          updateLeftover();
        };
      }
      updateLeftover();

      const finish = (value) => {
        modal.querySelectorAll("[data-ins-settle-close]").forEach((el) => {
          el.onclick = null;
        });
        if (confirmBtn) confirmBtn.onclick = null;
        closeModal();
        resolve(value);
      };

      modal.querySelectorAll("[data-ins-settle-close]").forEach((el) => {
        el.onclick = () => finish(null);
      });

      if (confirmBtn) {
        confirmBtn.onclick = () => {
          const raw = String(input.value || "").trim();
          if (raw === "") {
            errEl.textContent = T("insSettle.needNumber");
            return;
          }
          const refund = Number(raw);
          if (!Number.isFinite(refund) || refund < 0) {
            errEl.textContent = T("insSettle.needNumber");
            return;
          }
          if (refund > available + 0.0001) {
            errEl.textContent = T("insSettle.exceeds");
            return;
          }
          finish(round2(refund));
        };
      }

      input?.focus();
      input?.select();
    });
  }

  /**
   * Eviction: if remaining insurance > 0, collect refund amount.
   * Returns { proceed, refundAmount }. proceed=false if cancelled.
   */
  async function confirmEvictionRefund(contractId, options = {}) {
    const confirmKey = options.confirmKey || "aptPage.confirmEvict";
    let summary = null;
    try {
      summary = await fetchBalance(contractId);
    } catch (e) {
      console.warn("insurance-settle: balance fetch failed", e);
    }
    const remaining = round2(summary?.remaining);
    if (!summary || remaining <= 0.009) {
      if (options.skipConfirmIfZero) {
        return { proceed: true, refundAmount: 0 };
      }
      return {
        proceed: await WalajnaDialog.confirm(T(confirmKey), { danger: true }),
        refundAmount: 0,
      };
    }

    const refundAmount = await promptRefundAmount({ mode: "evict", summary });
    if (refundAmount == null) {
      return { proceed: false, refundAmount: 0 };
    }
    const leftover = round2(remaining - refundAmount);
    if (leftover > 0.009) {
      const ok = await WalajnaDialog.confirm(
        T("insSettle.warnUnsettled", { n: formatMoney(leftover) }),
        { danger: true, confirmLabel: T("insSettle.continueEvict") }
      );
      if (!ok) return { proceed: false, refundAmount: 0 };
    }
    return { proceed: true, refundAmount };
  }

  async function postRefund({ contractId, apartmentId, amount, notes }) {
    const res = await WalajnaAuth.fetchWithAuth(
      `${WalajnaAuth.API_BASE}/api/deposits/transactions`,
      {
        method: "POST",
        body: JSON.stringify({
          contract_id: Number(contractId),
          apartment_id: Number(apartmentId),
          type: "refund",
          amount: Number(amount),
          notes: notes || "Refunded to tenant after vacate",
        }),
      }
    );
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.detail || msg;
      } catch {
        /* ignore */
      }
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return res.json();
  }

  /**
   * Post-eviction settlement for an ended contract.
   * Returns updated summary or null if cancelled.
   */
  async function settleEndedContract({ contractId, apartmentId }) {
    const summary = await fetchBalance(contractId);
    const remaining = round2(summary?.remaining);
    if (!summary || remaining <= 0.009) {
      return summary;
    }
    const refundAmount = await promptRefundAmount({ mode: "settle", summary });
    if (refundAmount == null) return null;
    if (refundAmount <= 0.009) {
      return summary;
    }
    await postRefund({
      contractId,
      apartmentId,
      amount: refundAmount,
      notes: "Refunded to tenant after vacate",
    });
    return fetchBalance(contractId);
  }

  window.WalajnaInsuranceSettle = {
    fetchBalance,
    formatMoney,
    confirmEvictionRefund,
    settleEndedContract,
  };
})();
