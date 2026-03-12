(function () {
  const PAYMENTS_KEY = "walajna_payments";

  function getPayments() {
    try {
      return JSON.parse(localStorage.getItem(PAYMENTS_KEY) || "[]");
    } catch (error) {
      console.error("خطأ في قراءة المدفوعات:", error);
      return [];
    }
  }

  function savePayments(payments) {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments || []));
  }

  function getPaymentsByApartmentId(apartmentId) {
    return getPayments().filter((payment) => payment.apartmentId === apartmentId);
  }

  function getPaymentsByContractId(contractId) {
    return getPayments().filter((payment) => payment.contractId === contractId);
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
    return getPayments().some((payment) => payment.contractId === contractId);
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
