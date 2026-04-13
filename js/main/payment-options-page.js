document.addEventListener("DOMContentLoaded", async function () {
  const T = (k, p) =>
    window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;

  const params = new URLSearchParams(window.location.search);
  const apartmentId = params.get("id");
  const paymentId = params.get("paymentId");
  const contractId = params.get("contractId");

  const summaryBox = document.getElementById("paymentSummaryBox");
  const backLink = document.getElementById("backToPaymentsLink");

  const loc =
    window.walajna_language && typeof window.walajna_language.localeForNumbers === "function"
      ? window.walajna_language.localeForNumbers()
      : window.walajna_language && window.walajna_language.get() === "en"
        ? "en-SA"
        : "ar-SA";

  if (window.WalajnaAuth && typeof WalajnaAuth.hydrateSession === "function") {
    await WalajnaAuth.hydrateSession();
  }

  /** Unified shape: { id, amount, dueDate } */
  let payment = null;
  let payViaApi = false;

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        c
      ])
    );
  }

  if (
    contractId &&
    paymentId &&
    window.WalajnaAuth &&
    typeof WalajnaAuth.fetchWithAuth === "function"
  ) {
    payViaApi = true;
    const apiBase = WalajnaAuth.API_BASE;
    try {
      const res = await WalajnaAuth.fetchWithAuth(
        `${apiBase}/api/contracts/${encodeURIComponent(contractId)}/installments`,
        { method: "GET" }
      );
      if (res.status === 401) {
        if (typeof WalajnaAuth.handleUnauthorized === "function") {
          WalajnaAuth.handleUnauthorized();
        }
      } else if (res.ok) {
        const rows = await res.json();
        const row = Array.isArray(rows)
          ? rows.find((item) => String(item.id) === String(paymentId))
          : null;
        if (row) {
          payment = {
            id: String(row.id),
            amount: Number(row.amount || 0),
            dueDate: (row.due_date || "").toString().slice(0, 10),
          };
        }
      }
    } catch (e) {
      console.warn(e);
    }
  }

  if (!payment && paymentId && typeof WalajnaPaymentsApi !== "undefined" && WalajnaPaymentsApi.listMapped) {
    try {
      const rows = await WalajnaPaymentsApi.listMapped();
      const row = (rows || []).find((item) => String(item.id) === String(paymentId));
      if (row && row.dueDate) {
        payment = {
          id: String(row.id),
          amount: Number(row.amount || 0),
          dueDate: row.dueDate,
        };
      }
    } catch (e) {
      console.warn(e);
    }
  }

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

  if (backLink && apartmentId) {
    backLink.href = `../main/payments.html?id=${encodeURIComponent(apartmentId)}`;
  }

  renderSummary();

  document.addEventListener("walajna:i18n-applied", () => {
    if (summaryBox && payment) renderSummary();
  });

  document.querySelectorAll(".payment-method-card").forEach((card) => {
    card.addEventListener("click", async function () {
      const method = this.dataset.method;

      if (!payment) {
        alert(T("paymentOpt.payMissing"));
        return;
      }

      if (payViaApi && contractId && window.WalajnaAuth?.fetchWithAuth) {
        try {
          const patchRes = await WalajnaAuth.fetchWithAuth(
            `${WalajnaAuth.API_BASE}/api/payment-installments/${encodeURIComponent(paymentId)}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status: "paid",
                payment_method: method,
                notes: T("paymentOpt.paidNote"),
              }),
            }
          );
          if (patchRes.status === 401) {
            if (typeof WalajnaAuth.handleUnauthorized === "function") {
              WalajnaAuth.handleUnauthorized();
            }
            return;
          }
          if (!patchRes.ok) {
            const t = await patchRes.text();
            alert(T("paymentOpt.patchFailPrefix") + (t || patchRes.status));
            return;
          }
        } catch (err) {
          console.warn(err);
          alert(T("paymentOpt.networkErr"));
          return;
        }
        alert(T("paymentOpt.success"));
        window.location.href = `../main/payments.html?id=${encodeURIComponent(apartmentId)}`;
        return;
      }

      alert(T("paymentOpt.networkErr"));
    });
  });
});
