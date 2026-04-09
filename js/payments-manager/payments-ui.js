(function () {
  function wt(k, p) {
    return window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  }

  function ensurePaymentsStyles() {
    if (document.getElementById("walajnaPaymentsStyles")) return;

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
      .payments-summary-grid{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
        gap:12px;
        margin-bottom:16px;
      }
      .payments-summary-card{
        background:#f8fafc;
        border:1px solid #e5e7eb;
        border-radius:12px;
        padding:14px;
      }
      .payments-summary-card .label{
        display:block;
        font-size:13px;
        color:#6b7280;
        margin-bottom:6px;
      }
      .payments-summary-card .value{
        font-size:18px;
        font-weight:700;
        color:#111827;
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
      .wl-modal{
        display:none;
        position:fixed;
        inset:0;
        z-index:9999;
      }
      .wl-modal.is-open{
        display:block;
      }
      .wl-modal__backdrop{
        position:absolute;
        inset:0;
        background:rgba(15,23,42,.45);
      }
      .wl-modal__panel{
        position:relative;
        width:min(92vw, 680px);
        margin:6vh auto 0;
        background:#fff;
        border-radius:20px;
        padding:20px;
        box-shadow:0 24px 48px rgba(0,0,0,.18);
      }
      .wl-modal__header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        margin-bottom:18px;
      }
      .wl-modal__title{
        margin:0;
        font-size:24px;
        font-weight:800;
        color:#0f172a;
      }
      .wl-modal__subtitle{
        margin:6px 0 0;
        color:#64748b;
        font-size:14px;
      }
      .wl-modal__body{
        margin-bottom:18px;
      }
      .wl-modal__footer{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }
      .wl-btn{
        border:none;
        border-radius:12px;
        padding:10px 16px;
        font-family:inherit;
        font-size:14px;
        cursor:pointer;
      }
      .wl-btn--primary{
        background:#111827;
        color:#fff;
      }
      .wl-btn--ghost{
        background:#f3f4f6;
        color:#111827;
      }
      .wl-icon-btn{
        border:none;
        background:#f3f4f6;
        width:40px;
        height:40px;
        border-radius:12px;
        cursor:pointer;
        font-size:18px;
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

 function renderSummary(container, summary, utils, contractInfo = null) {
  if (!container) return;

  const contractCards = contractInfo
    ? `
      <div class="payments-summary-card compact">
        <span class="label">${wt("paymentsUi.tenant")}</span>
        <span class="value">${contractInfo.tenantName || "—"}</span>
      </div>

      <div class="payments-summary-card compact">
        <span class="label">${wt("paymentsUi.monthlyRent")}</span>
        <span class="value">${utils.formatCurrency(contractInfo.monthlyRent)}</span>
      </div>

      <div class="payments-summary-card compact">
        <span class="label">${wt("paymentsUi.payCycle")}</span>
        <span class="value">${contractInfo.paymentCycleLabel || "—"}</span>
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="payments-summary-grid clean-layout">
      ${contractCards}

      <div class="payments-summary-card strong-card">
        <span class="label">${wt("paymentsUi.annualRent")}</span>
        <span class="value">${utils.formatCurrency(summary.annualOriginalTotal)}</span>
      </div>

      <div class="payments-summary-card compact">
        <span class="label">${wt("paymentsUi.discounts")}</span>
        <span class="value">${utils.formatCurrency(summary.discountsTotal)}</span>
      </div>

      <div class="payments-summary-card compact">
        <span class="label">${wt("paymentsUi.remaining")}</span>
        <span class="value">${utils.formatCurrency(summary.pending)}</span>
      </div>

      <div class="payments-summary-card compact paid-card">
        <span class="label">${wt("paymentsUi.paid")}</span>
        <span class="value">${utils.formatCurrency(summary.paid)}</span>
        <small class="sub-value">
          ${wt("paymentsUi.ofTotal", { a: utils.formatCurrency(summary.adjustedTotal) })}
        </small>
      </div>
    </div>
  `;
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
      <div class="payments-toolbar">
        <div>${wt("paymentsUi.count", { n: payments.length })}</div>
      </div>

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

    if (amountInput) amountInput.value = payment.amount || "";
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