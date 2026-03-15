(function () {

  function generatePaymentId() {
    return "PAY_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function generateContractId(apartment) {
    const contract = apartment?.contract || {};
    if (contract.id) return contract.id;

    const start = contract.startDate || "nostart";
    const end = contract.endDate || "noend";
    return `CONTRACT_${apartment.id}_${start}_${end}`;
  }

  function getTodayDateString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function toDateOnlyString(date) {
    if (!date) return "";
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return "";

    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${d.getFullYear()}-${month}-${day}`;
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString("en-US")} ريال`;
  }

  function formatDate(dateString) {
    if (!dateString) return "—";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    return date.toLocaleDateString("en-GB");
  }

  function getPaymentStatusLabel(status) {
    switch (status) {
      case "paid": return "مدفوع";
      case "pending": return "مستحق";
      case "overdue": return "متأخر";
      case "cancelled": return "ملغي";
      default: return "غير معروف";
    }
  }

  function getPaymentStatusClass(status) {
    switch (status) {
      case "paid": return "payment-badge paid";
      case "pending": return "payment-badge pending";
      case "overdue": return "payment-badge overdue";
      case "cancelled": return "payment-badge cancelled";
      default: return "payment-badge";
    }
  }

  function normalizePaymentStatuses(payments) {
    const today = getTodayDateString();

    return payments.map((payment) => {
      if (payment.status === "pending" && payment.dueDate < today) {
        return { ...payment, status: "overdue" };
      }

      return payment;
    });
  }

  function addMonthsSafe(date, monthsToAdd) {
    const d = new Date(date);
    const originalDay = d.getDate();

    d.setDate(1);
    d.setMonth(d.getMonth() + monthsToAdd);

    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    d.setDate(Math.min(originalDay, lastDay));

    return d;
  }

  function getCycleMonths(paymentCycle) {
    switch (paymentCycle) {
      case "quarterly": return 3;
      case "semi_annual": return 6;
      case "annual": return 12;
      case "monthly":
      default: return 1;
    }
  }

  function getPaymentCycleLabel(paymentCycle) {
    switch (paymentCycle) {
      case "quarterly": return "ربع سنوي";
      case "semi_annual": return "نصف سنوي";
      case "annual": return "سنوي";
      case "monthly":
      default: return "شهري";
    }
  }

  function getMonthlyRentAmount(apartment) {
    const contract = apartment?.contract || {};
    return Number(contract.rentAmount || apartment.rent || 0);
  }

  function getApartmentPaymentDefaults(apartment) {
    const defaults = apartment?.paymentDefaults || {};

    return {
      paymentCycle: defaults.paymentCycle || "monthly"
    };
  }

  function getEffectivePaymentSettings(apartment) {
    const contract = apartment?.contract || {};
    const defaults = getApartmentPaymentDefaults(apartment);

    return {
      paymentCycle: contract.paymentCycle || defaults.paymentCycle || "monthly"
    };
  }

  function getContractMonths(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end < start) return 0;

    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1
    );
  }

  function getContractTotalRent(apartment) {
    const contract = apartment?.contract || {};
    const monthlyRent = getMonthlyRentAmount(apartment);
    const contractMonths = getContractMonths(contract.startDate, contract.endDate);

    return monthlyRent * contractMonths;
  }

  function getInstallmentAmount(apartment) {
    const { paymentCycle } = getEffectivePaymentSettings(apartment);

    const monthlyRent = getMonthlyRentAmount(apartment);
    const cycleMonths = getCycleMonths(paymentCycle);

    return monthlyRent * cycleMonths;
  }

  function generateCycleBasedSchedule(apartment) {

    const contract = apartment?.contract || {};
    const startDate = contract.startDate;
    const endDate = contract.endDate;

    const { paymentCycle } = getEffectivePaymentSettings(apartment);
    const monthlyRent = getMonthlyRentAmount(apartment);

    if (!startDate || !endDate || !monthlyRent) return [];

    const contractId = generateContractId(apartment);

    const monthsStep = getCycleMonths(paymentCycle);
    const installmentAmount = monthlyRent * monthsStep;

    let current = new Date(startDate);
    const end = new Date(endDate);

    const payments = [];

    while (current <= end) {

      payments.push({
        id: generatePaymentId(),
        apartmentId: apartment.id,
        tenantUserId: apartment.tenantUserId || null,
        contractId,

        dueDate: toDateOnlyString(current),
        amount: installmentAmount,

        status: "pending",
        paymentMethod: null,
        paidAt: null,

        createdAt: new Date().toISOString(),

        notes: "",
        receiptDocumentId: null,

        paymentCycle,
        cycleLabel: getPaymentCycleLabel(paymentCycle),
        monthlyRentAmount: monthlyRent
      });

      current = addMonthsSafe(current, monthsStep);
    }

    return payments;
  }

  function generateScheduleFromContract(apartment) {

    const contract = apartment?.contract || {};

    if (!contract.startDate || !contract.endDate || !getMonthlyRentAmount(apartment)) {
      return [];
    }

    return generateCycleBasedSchedule(apartment);
  }

  function calculatePaymentsSummary(payments) {

    const normalized = normalizePaymentStatuses(payments);

    let total = 0;
    let paid = 0;
    let overdue = 0;
    let pending = 0;
    let upcomingCount = 0;

    const today = getTodayDateString();

    normalized.forEach((payment) => {

      const amount = Number(payment.amount || 0);

      total += amount;

      if (payment.status === "paid") paid += amount;
      if (payment.status === "overdue") overdue += amount;
      if (payment.status === "pending") pending += amount;

      if (payment.status === "pending" && payment.dueDate >= today) {
        upcomingCount += 1;
      }

    });

    return {
      total,
      paid,
      overdue,
      pending,
      upcomingCount
    };
  }

  function daysUntil(dueDate) {

    if (!dueDate) return null;

    const today = new Date(getTodayDateString());
    const due = new Date(dueDate);

    const diff = due.getTime() - today.getTime();

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getNextPendingPayment(payments) {

    const normalized = normalizePaymentStatuses(payments);

    const pendingPayments = normalized
      .filter((payment) => payment.status === "pending" || payment.status === "overdue")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return pendingPayments[0] || null;
  }

  function buildPaymentReminder(payments, daysBefore = 3) {

    const normalized = normalizePaymentStatuses(payments);
    const nextPayment = getNextPendingPayment(normalized);

    if (!nextPayment) return null;

    if (nextPayment.status === "overdue") {
      return {
        type: "overdue",
        payment: nextPayment,
        message: `يوجد دفعة متأخرة منذ ${formatDate(nextPayment.dueDate)} بمبلغ ${formatCurrency(nextPayment.amount)}`
      };
    }

    const remainingDays = daysUntil(nextPayment.dueDate);

    if (remainingDays === null) return null;

    if (remainingDays <= daysBefore && remainingDays >= 0) {
      return {
        type: "upcoming",
        payment: nextPayment,
        message: `تذكير: توجد دفعة قادمة بتاريخ ${formatDate(nextPayment.dueDate)} بمبلغ ${formatCurrency(nextPayment.amount)}`
      };
    }

    return null;
  }

  window.WalajnaPaymentsUtils = {
    generatePaymentId,
    generateContractId,
    getTodayDateString,
    toDateOnlyString,
    formatCurrency,
    formatDate,
    getPaymentStatusLabel,
    getPaymentStatusClass,
    normalizePaymentStatuses,
    getCycleMonths,
    getPaymentCycleLabel,
    getMonthlyRentAmount,
    getApartmentPaymentDefaults,
    getEffectivePaymentSettings,
    getContractMonths,
    getContractTotalRent,
    getInstallmentAmount,
    generateScheduleFromContract,
    calculatePaymentsSummary,
    daysUntil,
    getNextPendingPayment,
    buildPaymentReminder
  };

})();