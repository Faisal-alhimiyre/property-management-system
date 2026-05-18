(function () {
  function wt(k, p) {
    return window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  }

  function ensurePaymentsStyles() {
    const prev = document.getElementById("walajnaPaymentsStyles");
    if (prev) prev.remove();

    const style = document.createElement("style");
    style.id = "walajnaPaymentsStyles";
    style.textContent = `
      .payments-alert{
        margin-bottom:16px;
        padding:14px 16px;
        border-radius:12px;
        font-size:14px;
        font-weight:600;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
      }
      .payments-alert.upcoming{
        background:#fff7ed;
        color:#9a3412;
        border:1px solid #fdba74;
      }
      .payments-alert.overdue{
        background:#fef2f2;
        color:#991b1b;
        border:1px solid #fca5a5;
      }
      .payments-dash{
        margin-bottom:22px;
        border-radius:20px;
        border:1px solid rgba(15,23,42,0.08);
        background:#fff;
        box-shadow:0 8px 24px rgba(15,23,42,0.06);
        overflow:hidden;
      }
      .payments-dash__titlebar{
        display:flex;
        flex-wrap:wrap;
        align-items:flex-end;
        justify-content:space-between;
        gap:16px;
        padding:20px 22px 16px;
        border-bottom:1px solid rgba(15,23,42,0.06);
      }
      .payments-dash__page-title{
        margin:0;
        font-size:26px;
        font-weight:900;
        color:#0f172a;
        line-height:1.2;
        letter-spacing:-0.02em;
      }
      .payments-dash__page-sub{
        margin:8px 0 0;
        font-size:13px;
        font-weight:700;
        color:#64748b;
        line-height:1.35;
      }
      .payments-dash__search-wrap{
        flex-shrink:0;
      }
      .payments-dash__filters{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap:wrap;
      }
      .payments-dash__search{
        width:min(190px, 100%);
        box-sizing:border-box;
        border:1px solid rgba(15,23,42,0.12);
        border-radius:14px;
        padding:11px 14px;
        font-size:14px;
        font-weight:700;
        background:#f8fafc;
        color:#0f172a;
      }
      .payments-dash__search:focus{
        outline:none;
        border-color:rgba(15,23,42,0.28);
        background:#fff;
      }
      .payments-dash__header{
        display:flex;
        flex-wrap:wrap;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
        padding:18px 22px;
        border-bottom:1px solid rgba(15,23,42,0.06);
        background:#fafbfc;
      }
      .payments-dash__eyebrow{
        font-size:12px;
        font-weight:800;
        letter-spacing:0.04em;
        text-transform:uppercase;
        color:#64748b;
      }
      .payments-dash__tenant-name{
        margin-top:6px;
        font-size:22px;
        font-weight:900;
        color:#0f172a;
        line-height:1.25;
      }
      .payments-dash__chips{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-top:12px;
      }
      .payments-dash__chip{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding:8px 14px;
        border-radius:999px;
        font-size:13px;
        font-weight:800;
        background:#f1f5f9;
        color:#334155;
        border:1px solid rgba(15,23,42,0.06);
      }
      .payments-dash__chip b{
        font-weight:900;
        color:#0f172a;
      }
      .payments-dash__chip--accent{
        background:#f1f5f9;
        border-color:rgba(15,23,42,0.06);
        color:#334155;
      }
      .payments-dash__count{
        font-size:13px;
        font-weight:800;
        color:#475569;
        padding:10px 14px;
        border-radius:14px;
        background:#fff;
        border:1px solid rgba(15,23,42,0.08);
        align-self:center;
      }
      .payments-dash__grid{
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
        gap:14px;
        padding:18px 22px 22px;
      }
      .payments-dash__stat{
        position:relative;
        border-radius:14px;
        padding:14px 16px;
        background:#fafbfc;
        border:1px solid rgba(15,23,42,0.08);
        min-height:88px;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
      }
      .payments-dash__stat .label{
        font-size:12px;
        font-weight:800;
        color:#64748b;
        margin-bottom:8px;
      }
      .payments-dash__stat .value{
        font-size:20px;
        font-weight:900;
        color:#0f172a;
        letter-spacing:-0.02em;
      }
      .payments-dash__stat .sub{
        margin-top:6px;
        font-size:12px;
        font-weight:700;
        color:#94a3b8;
      }
      .payments-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        margin-bottom:12px;
        flex-wrap:wrap;
      }
      .payments-table-wrap{
        overflow:auto;
        border:1px solid #e5e7eb;
        border-radius:12px;
        background:#fff;
      }
      .payments-table{
        width:100%;
        border-collapse:collapse;
        min-width:850px;
        background:#fff;
      }
      .payments-table th,
      .payments-table td{
        padding:12px;
        border-bottom:1px solid #eef2f7;
        text-align:right;
        vertical-align:middle;
        font-size:14px;
      }
      .payments-table th{
        background:#f9fafb;
        font-weight:700;
      }
      .payment-badge{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        padding:4px 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
      }
      .payment-badge.paid{
        background:#dcfce7;
        color:#166534;
      }
      .payment-badge.pending{
        background:#fef3c7;
        color:#92400e;
      }
      .payment-badge.overdue{
        background:#fee2e2;
        color:#991b1b;
      }
      .payment-badge.cancelled{
        background:#e5e7eb;
        color:#374151;
      }
      .payments-empty{
        text-align:center;
        padding:24px;
        color:#6b7280;
        background:#fff;
        border:1px solid #e5e7eb;
        border-radius:12px;
      }
      .payments-action-btn{
        border:none;
        border-radius:10px;
        padding:8px 12px;
        cursor:pointer;
        font-size:13px;
        font-family:inherit;
      }
      .payments-action-btn.primary{
        background:#111827;
        color:#fff;
      }
      .payments-action-btn.ghost{
        background:#f3f4f6;
        color:#111827;
      }
      .payments-action-btn[disabled]{
        opacity:.6;
        cursor:not-allowed;
      }
      .payments-form-grid{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
        gap:12px;
      }
      .payments-field{
        display:flex;
        flex-direction:column;
        gap:6px;
      }
      .payments-field input,
      .payments-field select,
      .payments-field textarea{
        width:100%;
        padding:10px 12px;
        border:1px solid #d1d5db;
        border-radius:10px;
        font-family:inherit;
        font-size:14px;
        box-sizing:border-box;
      }
      .payments-field textarea{
        min-height:90px;
        resize:vertical;
      }
      .payments-inline-note{
        background:#f9fafb;
        border:1px dashed #d1d5db;
        border-radius:10px;
        padding:10px 12px;
        margin-bottom:12px;
        font-size:13px;
        color:#374151;
      }
      .apartment-payment-reminder-box{
        margin:16px 0;
      }
      /* #recordPaymentModal layout lives in payments.css (!important) so it wins over this injected sheet */
      #recordPaymentModal .wl-modal__title{
        margin:0;
        font-size:22px;
        font-weight:800;
        color:#0f172a;
      }
      #recordPaymentModal .wl-modal__subtitle{
        margin:6px 0 0;
        color:#64748b;
        font-size:14px;
      }
      #recordPaymentModal .wl-btn{
        border:none;
        border-radius:12px;
        padding:10px 16px;
        font-family:inherit;
        font-size:14px;
        cursor:pointer;
      }
      #recordPaymentModal .wl-btn--primary{
        background:#111827;
        color:#fff;
      }
      #recordPaymentModal .wl-btn--ghost{
        background:#f3f4f6;
        color:#111827;
      }

      /*
        Dark mode must live in this injected sheet: it is appended after payments.css,
        so light-only rules above would otherwise win over body.dark-mode overrides
        that only set border-color (leaving #fafbfc backgrounds + light text colors).
      */
      body.dark-mode .payments-dash{
        background:#101825;
        border-color:rgba(148,163,184,0.35);
        box-shadow:0 18px 40px rgba(15,23,42,0.7);
      }
      body.dark-mode .payments-dash__titlebar{
        background:transparent;
        border-bottom-color:rgba(148,163,184,0.22);
      }
      body.dark-mode .payments-dash__header{
        background:#0b111c;
        border-bottom-color:rgba(148,163,184,0.22);
      }
      body.dark-mode .payments-dash__page-title{
        color:#e5edf7;
      }
      body.dark-mode .payments-dash__page-sub{
        color:#9ca9bf;
      }
      body.dark-mode .payments-dash__search{
        background:#020617;
        border-color:rgba(148,163,184,0.35);
        color:#e5edf7;
      }
      body.dark-mode .payments-dash__search:focus{
        border-color:#06b6d4;
        background:#0f172a;
      }
      body.dark-mode .payments-dash__search::placeholder{
        color:#6b7280;
      }
      body.dark-mode .payments-dash__eyebrow{
        color:#94a3b8;
      }
      body.dark-mode .payments-dash__tenant-name{
        color:#f8fafc;
      }
      body.dark-mode .payments-dash__chip,
      body.dark-mode .payments-dash__chip--accent{
        background:#0b111c;
        border-color:rgba(148,163,184,0.35);
        color:#cbd5e1;
      }
      body.dark-mode .payments-dash__chip b{
        color:#f8fafc;
      }
      body.dark-mode .payments-dash__count{
        background:#0b111c;
        border-color:rgba(148,163,184,0.35);
        color:#cbd5e1;
      }
      body.dark-mode .payments-dash__grid{
        background:transparent;
      }
      body.dark-mode .payments-dash__stat{
        background:#0b111c;
        border-color:rgba(148,163,184,0.35);
      }
      body.dark-mode .payments-dash__stat .label{
        color:#9ca9bf;
      }
      body.dark-mode .payments-dash__stat .value{
        color:#f8fafc;
      }
      body.dark-mode .payments-dash__stat .sub{
        color:#94a3b8;
      }

      body.dark-mode .payments-alert{
        background:#101825;
        border:1px solid rgba(148,163,184,0.35);
        color:#e5edf7;
      }
      body.dark-mode .payments-alert.upcoming{
        border-color:rgba(245,158,11,0.45);
        color:#fde68a;
      }
      body.dark-mode .payments-alert.overdue{
        border-color:rgba(239,68,68,0.45);
        color:#fecaca;
      }

      body.dark-mode .payments-table-wrap{
        background:#101825;
        border-color:rgba(148,163,184,0.35);
      }
      body.dark-mode .payments-table{
        background:#0b111c;
      }
      body.dark-mode .payments-table th,
      body.dark-mode .payments-table td{
        border-bottom-color:rgba(148,163,184,0.18);
      }
      body.dark-mode .payments-table th{
        background:#020617;
        color:#e5edf7;
      }
      body.dark-mode .payments-table td{
        background:#101825;
        color:#e5edf7;
      }

      body.dark-mode .payments-empty{
        background:#101825;
        border-color:rgba(148,163,184,0.35);
        color:#cbd5e1;
      }

      body.dark-mode .payment-badge.paid{
        background:rgba(34,197,94,0.22);
        color:#bbf7d0;
      }
      body.dark-mode .payment-badge.pending{
        background:rgba(245,158,11,0.22);
        color:#fde68a;
      }
      body.dark-mode .payment-badge.overdue{
        background:rgba(239,68,68,0.22);
        color:#fecaca;
      }
      body.dark-mode .payment-badge.cancelled{
        background:rgba(148,163,184,0.22);
        color:#e2e8f0;
      }

      body.dark-mode .payments-action-btn.primary{
        background:#36d7e8;
        color:#052626;
      }
      body.dark-mode .payments-action-btn.ghost{
        background:#0b111c;
        color:#e5edf7;
        border:1px solid rgba(148,163,184,0.35);
      }

      /*
        Record-payment modal footer: base rules above use #recordPaymentModal .wl-btn--*
        (light gray ghost + navy primary). Theme.css also forces all buttons to light text.
        Override with ID-scoped dark styles + !important so Save reads as primary and Cancel is legible.
      */
      body.dark-mode #recordPaymentModal .wl-btn--primary{
        background:#36d7e8 !important;
        color:#052626 !important;
        -webkit-text-fill-color:#052626 !important;
      }
      body.dark-mode #recordPaymentModal .wl-btn--primary:hover{
        background:#2ec8d8 !important;
        color:#021212 !important;
        -webkit-text-fill-color:#021212 !important;
      }
      body.dark-mode #recordPaymentModal .wl-btn--ghost{
        background:#0b111c !important;
        color:#e5edf7 !important;
        -webkit-text-fill-color:#e5edf7 !important;
        border:1px solid rgba(148,163,184,0.45) !important;
      }
      body.dark-mode #recordPaymentModal .wl-btn--ghost:hover{
        background:#172033 !important;
        color:#f8fafc !important;
        -webkit-text-fill-color:#f8fafc !important;
        border-color:rgba(186,198,216,0.55) !important;
      }
      body.dark-mode #recordPaymentModal .wl-modal__title{
        color:#e5edf7 !important;
      }
      body.dark-mode #recordPaymentModal .wl-modal__subtitle{
        color:#94a3b8 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function getRelatedPayments(payment, payments) {
    if (!payment) return [];

    return payments.filter((p) => {
      const sameApartment = p.apartmentId === payment.apartmentId;
      const sameContract =
        payment.contractId ? p.contractId === payment.contractId : true;

      return sameApartment && sameContract && p.status !== "cancelled";
    });
  }

  function canPay(payment, payments) {
    if (!payment) return false;

    const relatedPayments = getRelatedPayments(payment, payments);

    const unpaidBefore = relatedPayments.find((p) => {
      return (
        new Date(p.dueDate) < new Date(payment.dueDate) &&
        p.status !== "paid"
      );
    });

    return !unpaidBefore;
  }

  function payPayment(paymentId, options = {}) {
    const onSuccess = options.onSuccess || null;

    if (typeof getPayments !== "function" || typeof savePayments !== "function") {
      console.error(wt("console.payStorageUndefined"));
      alert(wt("paymentsUi.storageMissing"));
      return false;
    }

    const payments = getPayments();
    const payment = payments.find((p) => p.id === paymentId);

    if (!payment) {
      alert(wt("paymentsUi.payNotFound"));
      return false;
    }

    if (payment.status === "paid") {
      alert(wt("paymentsUi.alreadyPaid"));
      return false;
    }

    if (payment.status === "cancelled") {
      alert(wt("paymentsUi.cancelledPay"));
      return false;
    }

    if (!canPay(payment, payments)) {
      alert(wt("paymentsUi.payPreviousFirst"));
      return false;
    }

    payment.status = "paid";
    payment.paidAt = new Date().toISOString();
    payment.paymentMethod = payment.paymentMethod || "manual";
    payment.notes = payment.notes || wt("paymentsUi.paidFromOptions");

    savePayments(payments);

    if (typeof onSuccess === "function") {
      onSuccess(payment, payments);
    } else if (typeof window.renderPayments === "function") {
      window.renderPayments();
    }

    return true;
  }

  function renderReminder(container, reminder, activeRole) {
    if (!container) return;

    if (!reminder) {
      container.innerHTML = "";
      return;
    }

    const isOwner = activeRole === "owner";
    const actionButton = isOwner
      ? `<button id="quickPayReminderBtn" class="payments-action-btn primary" type="button">${wt(
          "paymentsUi.recordPay"
        )}</button>`
      : `<button id="tenantPayReminderBtn" class="payments-action-btn primary" type="button">${wt(
          "paymentsUi.payNow"
        )}</button>`;

    container.innerHTML = `
      <div class="payments-alert ${reminder.type}">
        <span>${reminder.message}</span>
        ${actionButton}
      </div>
    `;
  }

  function escSummaryHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSummary(
    container,
    summary,
    utils,
    contractInfo = null,
    periodFilter = null
  ) {
    if (!container) return;

    const lateTotal = Number(summary.overdue || 0);
    const instCount =
      contractInfo && contractInfo.installmentCount != null
        ? contractInfo.installmentCount
        : 0;

    const allMonthsLabel = "كل الشهور";
    const allYearsLabel = "كل السنوات";
    const monthOptions = Array.isArray(periodFilter?.options?.months)
      ? periodFilter.options.months
      : [];
    const yearOptions = Array.isArray(periodFilter?.options?.years)
      ? periodFilter.options.years
      : [];
    const selectedMonth = String(periodFilter?.selectedMonth || "");
    const selectedYear = String(periodFilter?.selectedYear || "");
    const monthOptionsHtml = monthOptions
      .map((m) => {
        const value = escSummaryHtml(String(m?.value || ""));
        const label = escSummaryHtml(String(m?.label || m?.value || ""));
        const selected = String(m?.value || "") === selectedMonth ? " selected" : "";
        return `<option value="${value}"${selected}>${label}</option>`;
      })
      .join("");
    const yearOptionsHtml = yearOptions
      .map((y) => {
        const value = escSummaryHtml(String(y || ""));
        const selected = String(y || "") === selectedYear ? " selected" : "";
        return `<option value="${value}"${selected}>${value}</option>`;
      })
      .join("");

    const titleBar = `
      <div class="payments-dash__titlebar">
        <div>
          <h1 class="payments-dash__page-title">${wt("payments.pageTitle")}</h1>
          <p class="payments-dash__page-sub">${wt("payments.pageSub")}</p>
        </div>
        <div class="payments-dash__search-wrap">
          <div class="payments-dash__filters">
            <select id="monthFilterInput" class="payments-dash__search">
              <option value="">${allMonthsLabel}</option>
              ${monthOptionsHtml}
            </select>
            <select id="yearFilterInput" class="payments-dash__search">
              <option value="">${allYearsLabel}</option>
              ${yearOptionsHtml}
            </select>
          </div>
        </div>
      </div>
    `;

    const headerBlock = contractInfo
      ? `
      <header class="payments-dash__header">
        <div>
          <div class="payments-dash__eyebrow">${wt("paymentsUi.tenant")}</div>
          <div class="payments-dash__tenant-name">${escSummaryHtml(contractInfo.tenantName || "—")}</div>
          <div class="payments-dash__chips">
            <span class="payments-dash__chip">${wt("paymentsUi.monthlyRent")}: <b>${utils.formatCurrency(contractInfo.monthlyRent)}</b></span>
            <span class="payments-dash__chip payments-dash__chip--accent">${wt("paymentsUi.payCycle")}: <b>${contractInfo.paymentCycleLabel || "—"}</b></span>
          </div>
        </div>
        <div class="payments-dash__count">${wt("paymentsUi.count", { n: instCount })}</div>
      </header>
    `
      : "";

    const statsBlock = `
      <div class="payments-dash__grid">
        <div class="payments-dash__stat">
          <span class="label">${wt("paymentsUi.annualRent")}</span>
          <span class="value">${utils.formatCurrency(summary.annualOriginalTotal)}</span>
        </div>
        <div class="payments-dash__stat">
          <span class="label">${wt("paymentsUi.discounts")}</span>
          <span class="value">${utils.formatCurrency(summary.discountsTotal)}</span>
        </div>
        <div class="payments-dash__stat">
          <span class="label">${wt("paymentsUi.latePaymentsTotal")}</span>
          <span class="value">${utils.formatCurrency(lateTotal)}</span>
        </div>
        <div class="payments-dash__stat">
          <span class="label">${wt("paymentsUi.remaining")}</span>
          <span class="value">${utils.formatCurrency(summary.unpaidTotal)}</span>
        </div>
        <div class="payments-dash__stat">
          <span class="label">${wt("paymentsUi.paid")}</span>
          <span class="value">${utils.formatCurrency(summary.paid)}</span>
          <span class="sub">${wt("paymentsUi.ofTotal", { a: utils.formatCurrency(summary.annualOriginalTotal) })}</span>
        </div>
      </div>
    `;

    container.innerHTML = `
      <section class="payments-dash" aria-label="">
        ${titleBar}
        ${headerBlock}
        ${statsBlock}
      </section>
    `;

    if (
      window.walajna_language &&
      typeof window.walajna_language.apply === "function"
    ) {
      window.walajna_language.apply(container);
    }
  }

  function renderPaymentsTable(container, payments, options = {}) {
    const { utils, activeRole } = options;

    if (!container) return;

    if (!payments.length) {
      container.innerHTML = `<div class="payments-empty">${wt("paymentsUi.empty")}</div>`;
      return;
    }

    const isOwner = activeRole === "owner";
    container.innerHTML = `
      <div class="payments-table-wrap">
        <table class="payments-table">
          <thead>
            <tr>
              <th>${wt("paymentsUi.th.due")}</th>
              <th>${wt("paymentsUi.th.amount")}</th>
              <th>${wt("paymentsUi.th.status")}</th>
              <th>${wt("paymentsUi.th.method")}</th>
              <th>${wt("paymentsUi.th.paidAt")}</th>
              <th>${wt("paymentsUi.th.notes")}</th>
              <th>${wt("paymentsUi.th.action")}</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map((payment) => {
              let actionHtml = `<button class="payments-action-btn ghost" type="button" disabled>—</button>`;

              const payAllowed = canPay(payment, payments);

              if (payment.status !== "paid" && payment.status !== "cancelled") {
                if (!payAllowed) {
                  actionHtml = `<button class="payments-action-btn ghost" type="button" disabled>${wt(
                    "paymentsUi.payPrevFirstBtn"
                  )}</button>`;
                } else if (isOwner) {
                  actionHtml = `<button class="payments-action-btn primary" data-pay-action="record" data-pay-id="${payment.id}">${wt(
                    "paymentsUi.recordPay"
                  )}</button>`;
                } else {
                  actionHtml = `<button class="payments-action-btn primary" data-pay-action="tenant-pay" data-pay-id="${payment.id}">${wt(
                    "paymentsUi.payNow"
                  )}</button>`;
                }
              }

              return `
                <tr>
                  <td>${utils.formatDate(payment.dueDate)}</td>
                  <td>${utils.formatCurrency(payment.amount)}</td>
                  <td><span class="${utils.getPaymentStatusClass(payment.status)}">${utils.getPaymentStatusLabel(payment.status)}</span></td>
                  <td>${payment.paymentMethod || "—"}</td>
                  <td>${payment.paidAt ? utils.formatDate(payment.paidAt) : "—"}</td>
                  <td>${payment.notes || "—"}</td>
                  <td>${actionHtml}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function fillPaymentRecordForm(payment, utils) {
    const info = document.getElementById("selectedPaymentInfo");
    const amountInput = document.getElementById("paymentAmountInput");
    const paidAtInput = document.getElementById("paymentPaidAtInput");
    const methodInput = document.getElementById("paymentMethodInput");
    const notesInput = document.getElementById("paymentNotesInput");

    if (info) {
      info.textContent = wt("paymentsUi.selectedPay", {
        a: utils.formatCurrency(payment.amount),
        d: utils.formatDate(payment.dueDate),
      });
    }

    if (amountInput) {
      const amt = Math.round(Number(payment.amount || 0));
      amountInput.value = amt > 0 ? String(amt) : "";
    }
    if (paidAtInput) paidAtInput.value = utils.getTodayDateString();
    if (methodInput) methodInput.value = "";
    if (notesInput) notesInput.value = "";
  }

  function bindPaymentsTableActions(container, options = {}) {
    if (!container) return;

    const onAfterPay = options.onAfterPay || null;
    const onRecordPayment = options.onRecordPayment || null;

    container.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-pay-action]");
      if (!btn) return;

      const action = btn.dataset.payAction;
      const paymentId = btn.dataset.payId;

      if (!paymentId) return;

      if (action === "tenant-pay") {
        payPayment(paymentId, {
          onSuccess: onAfterPay,
        });
        return;
      }

      if (action === "record") {
        if (typeof onRecordPayment === "function") {
          onRecordPayment(paymentId);
        } else {
          payPayment(paymentId, {
            onSuccess: onAfterPay,
          });
        }
      }
    });
  }

  window.WalajnaPaymentsUI = {
    ensurePaymentsStyles,
    openModal,
    closeModal,
    canPay,
    payPayment,
    renderReminder,
    renderSummary,
    renderPaymentsTable,
    fillPaymentRecordForm,
    bindPaymentsTableActions,
  };
})();