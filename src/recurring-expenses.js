const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const recurringExpenseCategories = [
  "บ้านและที่พัก",
  "สาธารณูปโภค",
  "ประกัน",
  "สุขภาพ",
  "การศึกษา",
  "อื่นๆ",
];

export function isValidMonth(value) {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

export function recurringExpenseDueDate(expense, month) {
  const startMonth = String(expense?.startMonth || "");
  const endMonth = String(expense?.endMonth || "");
  if (!isValidMonth(month) || !isValidMonth(startMonth) || (endMonth && !isValidMonth(endMonth))) return "";
  if (month < startMonth || (endMonth && month > endMonth)) return "";

  const [year, monthNumber] = month.split("-").map(Number);
  const requestedDay = Number(expense?.dueDay);
  if (!Number.isInteger(requestedDay) || requestedDay < 1 || requestedDay > 31) return "";
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(requestedDay, lastDay)).padStart(2, "0")}`;
}

export function recurringExpenseDurationMonths(startMonth, endMonth) {
  if (!isValidMonth(startMonth) || !isValidMonth(endMonth) || endMonth < startMonth) return 0;
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  return (endYear - startYear) * 12 + endMonthNumber - startMonthNumber + 1;
}

export function recurringExpenseMonthValues(expenses, anchorMonth, futureHorizon = 120) {
  if (!isValidMonth(anchorMonth)) return [];
  const [anchorYear, anchorMonthNumber] = anchorMonth.split("-").map(Number);
  const anchorOrdinal = anchorYear * 12 + anchorMonthNumber - 1;
  const minOrdinal = anchorOrdinal - 12;
  const maxOrdinal = anchorOrdinal + Math.max(24, Math.min(Number(futureHorizon) || 120, 240));
  const values = new Set();
  const monthFromOrdinal = (ordinal) => {
    const year = Math.floor(ordinal / 12);
    const month = ordinal - year * 12 + 1;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  };

  for (const expense of Array.isArray(expenses) ? expenses : []) {
    const startMonth = String(expense?.startMonth || "");
    const endMonth = String(expense?.endMonth || "");
    if (!isValidMonth(startMonth) || (endMonth && !isValidMonth(endMonth))) continue;
    const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
    const startOrdinal = startYear * 12 + startMonthNumber - 1;
    const [endYear, endMonthNumber] = endMonth ? endMonth.split("-").map(Number) : [0, 0];
    const endOrdinal = endMonth ? endYear * 12 + endMonthNumber - 1 : maxOrdinal;
    const firstVisible = Math.max(startOrdinal, minOrdinal);
    const lastVisible = Math.min(endOrdinal, maxOrdinal);
    for (let ordinal = firstVisible; ordinal <= lastVisible; ordinal += 1) values.add(monthFromOrdinal(ordinal));
    if (startOrdinal >= minOrdinal && startOrdinal <= maxOrdinal) values.add(startMonth);
    if (endMonth) values.add(endMonth);
  }

  return [...values].sort();
}

function amountInCents(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function summarizeFixedCommitments({
  fixedExpenses = [],
  installments = [],
  subscriptions = [],
  month,
  subscriptionBillingDate,
}) {
  const entries = [];

  for (const expense of fixedExpenses) {
    const dueDate = recurringExpenseDueDate(expense, month);
    if (!dueDate) continue;
    entries.push({
      id: `fixed:${expense.id}`,
      sourceId: expense.id,
      type: "fixed",
      name: expense.name,
      category: expense.category || "อื่นๆ",
      amount: Number(expense.amount || 0),
      dueDate,
      dueDay: Number(dueDate.slice(-2)),
      detail: `วันที่ ${Number(dueDate.slice(-2))} · ทุกเดือน`,
      source: expense,
    });
  }

  for (const plan of installments) {
    for (const payment of plan.schedule || []) {
      if (payment.month !== month) continue;
      entries.push({
        id: `installment:${plan.id}:${payment.installmentNumber}`,
        sourceId: plan.id,
        type: "installment",
        name: plan.name,
        category: "ผ่อนสินค้า",
        amount: Number(payment.amount || 0),
        dueDate: "",
        dueDay: 32,
        detail: `งวด ${payment.installmentNumber}/${plan.months}${payment.paid ? " · ชำระแล้ว" : ""}`,
        paid: Boolean(payment.paid),
        source: plan,
        payment,
      });
    }
  }

  for (const subscription of subscriptions) {
    const dueDate = subscriptionBillingDate?.(subscription, month) || "";
    if (!dueDate) continue;
    const day = Number(dueDate.slice(-2));
    entries.push({
      id: `subscription:${subscription.id}`,
      sourceId: subscription.id,
      type: "subscription",
      name: subscription.name,
      category: subscription.category || "บริการ",
      amount: Number(subscription.amount || 0),
      dueDate,
      dueDay: Number.isInteger(day) ? day : 32,
      detail: `วันที่ ${Number.isInteger(day) ? day : "—"} · ${subscription.cycle === "yearly" ? "รายปี" : "รายเดือน"}`,
      source: subscription,
    });
  }

  entries.sort((left, right) => left.dueDay - right.dueDay || left.name.localeCompare(right.name, "th"));
  const totalsInCents = entries.reduce((totals, entry) => {
    totals[entry.type] += amountInCents(entry.amount);
    if (!entry.paid) totals.remaining[entry.type] += amountInCents(entry.amount);
    return totals;
  }, { fixed: 0, installment: 0, subscription: 0, remaining: { fixed: 0, installment: 0, subscription: 0 } });
  const plannedTotal = totalsInCents.fixed + totalsInCents.installment + totalsInCents.subscription;
  const remainingTotal = totalsInCents.remaining.fixed + totalsInCents.remaining.installment + totalsInCents.remaining.subscription;

  return {
    entries,
    count: entries.length,
    total: plannedTotal / 100,
    remaining: remainingTotal / 100,
    totals: {
      fixed: totalsInCents.fixed / 100,
      installment: totalsInCents.installment / 100,
      subscription: totalsInCents.subscription / 100,
    },
    remainingTotals: {
      fixed: totalsInCents.remaining.fixed / 100,
      installment: totalsInCents.remaining.installment / 100,
      subscription: totalsInCents.remaining.subscription / 100,
    },
    counts: {
      fixed: entries.filter((entry) => entry.type === "fixed").length,
      installment: entries.filter((entry) => entry.type === "installment").length,
      subscription: entries.filter((entry) => entry.type === "subscription").length,
    },
  };
}
