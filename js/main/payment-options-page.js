document.addEventListener("DOMContentLoaded", function () {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");
  const paymentId = params.get("paymentId");

  const payments = JSON.parse(localStorage.getItem("walajna_payments") || "[]");
  const payment = payments.find((item) => String(item.id) === String(paymentId));

  const summaryBox = document.getElementById("paymentSummaryBox");
  const backLink = document.getElementById("backToPaymentsLink");

  const loc =
    window.walajna_language && window.walajna_language.get() === "en"
      ? "en-SA"
      : "ar-SA";

  function renderSummary() {
    if (!summaryBox) return;
    if (!payment) {
      summaryBox.textContent = T("paymentOpt.notFound");
      return;
    }
    const sar = T("common.sar");
    const amt = `${Number(payment.amount || 0).toLocaleString(loc)} ${sar}`;
    summaryBox.innerHTML = `
      <div class="payment-summary-row">
        <span class="payment-summary-label">${escapeHtml(T("paymentOpt.amount"))}</span>
        <strong class="payment-summary-value">${escapeHtml(amt)}</strong>
      </div>
      <div class="payment-summary-row">
        <span class="payment-summary-label">${escapeHtml(T("paymentOpt.dueDate"))}</span>
        <strong class="payment-summary-value">${escapeHtml(payment.dueDate || "—")}</strong>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        c
      ])
    );
  }

  if (backLink && apartmentId) {
    backLink.href = `../main/payments.html?id=${encodeURIComponent(apartmentId)}`;
  }

  renderSummary();

  document.addEventListener("walajna:i18n-applied", () => {
    if (summaryBox && payment) renderSummary();
  });

  document.querySelectorAll(".payment-method-card").forEach((card) => {
    card.addEventListener("click", function () {
      const method = this.dataset.method;

      if (!payment) {
        alert(T("paymentOpt.payMissing"));
        return;
      }

      const updatedPayments = payments.map((item) => {
        if (item.id !== payment.id) return item;

        return {
          ...item,
          status: "paid",
          paymentMethod: method,
          paidAt: new Date().toISOString().slice(0, 10),
          notes: T("paymentOpt.paidNote")
        };
      });

      localStorage.setItem("walajna_payments", JSON.stringify(updatedPayments));

      alert(T("paymentOpt.success"));
      window.location.href = `../main/payments.html?id=${encodeURIComponent(apartmentId)}`;
    });
  });
});
