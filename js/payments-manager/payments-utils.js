(function () {
  function wt(k, p) {
    return window.walajna_language && window.walajna_language.t
      ? window.walajna_language.t(k, p)
      : k;
  }

  function numLocale() {
    if (window.walajna_language && typeof window.walajna_language.localeForNumbers === "function") {
      return window.walajna_language.localeForNumbers();
    }
    return window.walajna_language && window.walajna_language.get() === "en"
      ? "en-SA-u-nu-latn"
      : "ar-SA-u-nu-latn";
  }

  function generatePaymentId() {
    return "PAY_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  function generateContractId(apartment) {
    const contract = apartment?.contract || {};
    if (contract.id != null && contract.id !== "") {
      return String(contract.id);
    }
    const linkedId =
      apartment?.currentContractId ??
      apartment?.contractId ??
      null;
    if (linkedId != null && linkedId !== "") {
      return String(linkedId);
    }

    const start = contract.startDate || "nostart";
    const end = contract.endDate || "noend";
    return `CONTRACT_${String(apartment?.id ?? "")}_${start}_${end}`;
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
    return `${amount.toLocaleString(numLocale())} ${wt("common.sar")}`;
  }

  function formatDate(dateString) {
    if (!dateString) return "—";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const loc =
      window.walajna_language && typeof window.walajna_language.localeForDates === "function"
        ? window.walajna_language.localeForDates()
        : window.walajna_language && window.walajna_language.get() === "en"
          ? "en-GB-u-nu-latn"
          : "ar-SA-u-nu-latn";
    return date.toLocaleDateString(loc);
  }

  function getPaymentStatusLabel(status) {
    switch (status) {
      case "paid":
        return wt("payments.paid");
      case "pending":
        return wt("payments.due");
      case "overdue":
        return wt("payments.overdue");
      case "cancelled":
        return wt("payments.cancelled");
      default:
        return wt("payments.unknown");
    }
  }

  function getPaymentStatusClass(status) {
    switch (status) {
      case "paid":
        return "payment-badge paid";
      case "pending":
        return "payment-badge pending";
      case "overdue":
        return "payment-badge overdue";
      case "cancelled":
        return "payment-badge cancelled";
      default:
        return "payment-badge";
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

  function normalizePaymentCycleRaw(paymentCycle) {
    if (typeof paymentCycle === "number" && Number.isFinite(paymentCycle)) {
      if (paymentCycle === 1) return "monthly";
      if (paymentCycle === 4) return "quarterly";
      if (paymentCycle === 2) return "semi_annual";
      if (paymentCycle === 12) return "annual";
    }
    const c = String(paymentCycle || "monthly").toLowerCase().trim().replace(/-/g, "_");
    if (c === "1" || c === "month") return "monthly";
    if (c === "4" || c === "quarter" || c === "qtr") return "quarterly";
    if (c === "2" || c === "semi") return "semi_annual";
    if (c === "12" || c === "yearly") return "annual";
    if (["monthly", "quarterly", "semi_annual", "annual"].includes(c)) return c;
    return "monthly";
  }

  function getCycleMonths(paymentCycle) {
    const c = normalizePaymentCycleRaw(paymentCycle);
    switch (c) {
      case "quarterly":
        return 3;
      case "semi_annual":
        return 6;
      case "annual":
        return 12;
      case "monthly":
      default:
        return 1;
    }
  }

  function getPaymentCycleLabel(paymentCycle) {
    const c = normalizePaymentCycleRaw(paymentCycle);
    switch (c) {
      case "quarterly":
        return wt("payments.cycle.quarterly");
      case "semi_annual":
        return wt("payments.cycle.semi");
      case "annual":
        return wt("payments.cycle.annual");
      case "monthly":
      default:
        return wt("payments.cycle.monthly");
    }
  }

  function getMonthlyRentAmount(apartment) {
    const contract = apartment?.contract || {};
    const yr = Number(contract.yearlyRent);
    if (Number.isFinite(yr) && yr > 0) return yr / 12;
    return Number(contract.rentAmount || 0);
  }

  function getApartmentPaymentDefaults(apartment) {
    const defaults = apartment?.paymentDefaults || {};

    return {
      paymentCycle: defaults.paymentCycle || "monthly",
    };
  }

  function getEffectivePaymentSettings(apartment) {
    const contract = apartment?.contract || {};
    const defaults = getApartmentPaymentDefaults(apartment);

    return {
      paymentCycle: normalizePaymentCycleRaw(
        contract.paymentCycle || defaults.paymentCycle || "monthly"
      ),
    };
  }

  /**
   * When contract.paymentCycle is missing or wrong, infer from installment due spacing or amount vs monthly rent.
   */
  function inferPaymentCycleFromInstallments(payments, monthlyRent) {
    const rows = (payments || [])
      .filter((p) => p && p.dueDate)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    if (rows.length >= 2) {
      const d0 = new Date(rows[0].dueDate);
      const d1 = new Date(rows[1].dueDate);
      if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null;
      const months =
        (d1.getFullYear() - d0.getFullYear()) * 12 + (d1.getMonth() - d0.getMonth());
      if (months <= 0) return null;
      if (months === 1) return "monthly";
      if (months === 3) return "quarterly";
      if (months === 6) return "semi_annual";
      if (months === 12) return "annual";
      if (months <= 2) return "monthly";
      if (months <= 4) return "quarterly";
      if (months <= 9) return "semi_annual";
      return "annual";
    }
    if (rows.length === 1 && monthlyRent > 0) {
      const amt = Number(rows[0].originalAmount ?? rows[0].amount ?? 0);
      const m = monthlyRent;
      const tol = Math.max(1, m * 0.02);
      if (Math.abs(amt - m) <= tol) return "monthly";
      if (Math.abs(amt - m * 3) <= tol * 3) return "quarterly";
      if (Math.abs(amt - m * 6) <= tol * 6) return "semi_annual";
      if (Math.abs(amt - m * 12) <= tol * 12) return "annual";
    }
    return null;
  }

  /** Whole months from start through the day before endDate (endDate = move-out / expiry, exclusive). */
  function getContractMonths(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    if (end <= start) return 0;

    return (
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth())
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

  function getDaysRemainingInMonthInclusive(dateInput) {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return 0;

    const year = date.getFullYear();
    const month = date.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

    return lastDayOfMonth - date.getDate() + 1;
  }

  function getFirstDayOfNextMonth(dateInput) {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return null;

    return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  }

  function generateCycleBasedSchedule(apartment) {
    const contract = apartment?.contract || {};
    const startDate = contract.startDate;
    const endDate = contract.endDate;

    const { paymentCycle } = getEffectivePaymentSettings(apartment);
    const monthlyRent = getMonthlyRentAmount(apartment);

    if (!startDate || !endDate || !monthlyRent) return [];

    const contractId = generateContractId(apartment);
    const cycleMonths = getCycleMonths(paymentCycle);

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

    const payments = [];

    // Partial first installment when contract does not start on the 1st
    const startsMidMonth = start.getDate() !== 1;

    if (startsMidMonth) {
      const partialDays = getDaysRemainingInMonthInclusive(start);
      const partialAmount = Math.round((monthlyRent / 30) * partialDays);

      payments.push({
        id: generatePaymentId(),
        apartmentId: apartment.id,
        tenantUserId: apartment.tenantUserId || null,
        contractId,

        dueDate: toDateOnlyString(start),
        amount: partialAmount,

        status: "pending",
        paymentMethod: null,
        paidAt: null,

        createdAt: new Date().toISOString(),

        notes: wt("payments.firstPartialNote"),
        receiptDocumentId: null,

        paymentCycle,
        cycleLabel: getPaymentCycleLabel(paymentCycle),
        monthlyRentAmount: monthlyRent,
        isPartialFirstPayment: true,
        originalAmount: partialAmount,
      });

      let current = getFirstDayOfNextMonth(start);

      while (current && current < end) {
        const cycleAmount = monthlyRent * cycleMonths;

        payments.push({
          id: generatePaymentId(),
          apartmentId: apartment.id,
          tenantUserId: apartment.tenantUserId || null,
          contractId,

          dueDate: toDateOnlyString(current),
          amount: cycleAmount,

          status: "pending",
          paymentMethod: null,
          paidAt: null,

          createdAt: new Date().toISOString(),

          notes: "",
          receiptDocumentId: null,

          paymentCycle,
          cycleLabel: getPaymentCycleLabel(paymentCycle),
          monthlyRentAmount: monthlyRent,
          isPartialFirstPayment: false,
          originalAmount: cycleAmount,
        });

        current = addMonthsSafe(current, cycleMonths);
      }

      return payments;
    }

    // Standard schedule when start is on the 1st
    let current = new Date(start);

    while (current < end) {
      const cycleAmount = monthlyRent * cycleMonths;

      payments.push({
        id: generatePaymentId(),
        apartmentId: apartment.id,
        tenantUserId: apartment.tenantUserId || null,
        contractId,

        dueDate: toDateOnlyString(current),
        amount: cycleAmount,

        status: "pending",
        paymentMethod: null,
        paidAt: null,

        createdAt: new Date().toISOString(),

        notes: "",
        receiptDocumentId: null,

        paymentCycle,
        cycleLabel: getPaymentCycleLabel(paymentCycle),
        monthlyRentAmount: monthlyRent,
        isPartialFirstPayment: false,
        originalAmount: cycleAmount,
      });

      current = addMonthsSafe(current, cycleMonths);
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

  let annualOriginalTotal = 0;
  let adjustedTotal = 0;
  let paid = 0;
  let overdue = 0;
  let pending = 0;
  let unpaidTotal = 0;
  let discountsTotal = 0;
  let upcomingCount = 0;

  const today = getTodayDateString();

  normalized.forEach((payment) => {
    const currentAmount = Number(payment.amount || 0);
    const originalAmount = Number(
      payment.originalAmount || payment.amount || 0
    );

    annualOriginalTotal += originalAmount;
    adjustedTotal += currentAmount;

    if (originalAmount > currentAmount) {
      discountsTotal += originalAmount - currentAmount;
    }

    if (payment.status === "paid") paid += currentAmount;
    if (payment.status === "overdue") overdue += currentAmount;
    if (payment.status === "pending") pending += currentAmount;
    if (payment.status === "pending" || payment.status === "overdue") {
      unpaidTotal += currentAmount;
    }

    if (payment.status === "pending" && payment.dueDate >= today) {
      upcomingCount += 1;
    }
  });

  return {
    annualOriginalTotal,
    adjustedTotal,
    paid,
    overdue,
    pending,
    unpaidTotal,
    discountsTotal,
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
        message: wt("payments.remindOverdue", {
          d: formatDate(nextPayment.dueDate),
          a: formatCurrency(nextPayment.amount),
        }),
      };
    }

    const remainingDays = daysUntil(nextPayment.dueDate);

    if (remainingDays === null) return null;

    if (remainingDays <= daysBefore && remainingDays >= 0) {
      return {
        type: "upcoming",
        payment: nextPayment,
        message: wt("payments.remindUpcoming", {
          d: formatDate(nextPayment.dueDate),
          a: formatCurrency(nextPayment.amount),
        }),
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
    inferPaymentCycleFromInstallments,
    getContractMonths,
    getContractTotalRent,
    getInstallmentAmount,
    generateScheduleFromContract,
    calculatePaymentsSummary,
    daysUntil,
    getNextPendingPayment,
    buildPaymentReminder,
  };
})();