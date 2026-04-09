(function () {
  const PAYMENTS_KEY = "walajna_payments";

  function getPayments() {
    try {
      return JSON.parse(localStorage.getItem(PAYMENTS_KEY) || "[]");
    } catch (error) {
      const pre =
        window.walajna_language && window.walajna_language.t
          ? window.walajna_language.t("console.paymentsReadError")
          : "Error reading payments:";
      console.error(pre, error);
      return [];
    }
  }

  function savePayments(payments) {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments || []));
  }

  function getPaymentsByApartmentId(apartmentId) {
    const want = String(apartmentId ?? "");
    return getPayments().filter(
      (payment) => String(payment.apartmentId ?? "") === want
    );
  }

  function getPaymentsByContractId(contractId) {
    const want = String(contractId ?? "");
    return getPayments().filter(
      (payment) => String(payment.contractId ?? "") === want
    );
  }

  function addPayment(payment) {
    const payments = getPayments();
    payments.push(payment);
    savePayments(payments);
    return payment;
  }

  function addManyPayments(newPayments) {
    const payments = getPayments();
    payments.push(...newPayments);
    savePayments(payments);
    return newPayments;
  }

  function updatePayment(paymentId, updates) {
    const payments = getPayments().map((payment) =>
      payment.id === paymentId ? { ...payment, ...updates } : payment
    );
    savePayments(payments);
    return payments.find((payment) => payment.id === paymentId) || null;
  }

  function removePayment(paymentId) {
    const payments = getPayments().filter((payment) => payment.id !== paymentId);
    savePayments(payments);
  }

  function hasPaymentsForContract(contractId) {
    const want = String(contractId ?? "");
    return getPayments().some(
      (payment) => String(payment.contractId ?? "") === want
    );
  }

  window.WalajnaPaymentsStorage = {
    getPayments,
    savePayments,
    getPaymentsByApartmentId,
    getPaymentsByContractId,
    addPayment,
    addManyPayments,
    updatePayment,
    removePayment,
    hasPaymentsForContract,
  };
})();
