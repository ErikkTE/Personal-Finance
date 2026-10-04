export const installmentBanks = [
  { value: "กสิกรไทย", label: "กสิกรไทย", short: "KBank", tone: "kasikorn" },
  { value: "SCB", label: "ไทยพาณิชย์", short: "SCB", tone: "scb" },
  { value: "UOB", label: "ยูโอบี", short: "UOB", tone: "uob" },
  { value: "สินเชื่อ", label: "สินเชื่อ", short: "สินเชื่อ", tone: "loan" },
];

export function currentInstallmentMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function addMonths(month, offset) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextInstallmentMonth() {
  return addMonths(currentInstallmentMonth(), 1);
}

export function installmentMonthLabel(month, { short = false } = {}) {
  const [year, monthNumber] = String(month || "").split("-").map(Number);
  if (!year || !monthNumber) return "เดือนที่ไม่ระบุ";
  return new Intl.DateTimeFormat("th-TH", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function calculateInstallmentAmounts(plan) {
  const price = Math.round(Number(plan.price || 0) * 100) / 100;
  const downPayment = Math.round(Number(plan.downPayment || 0) * 100) / 100;
  const financedAmount = Math.max(0, Math.round((price - downPayment) * 100) / 100);
  const interestRate = Number(plan.interestRate || 0);
  const interestAmount = Math.round(financedAmount * interestRate) / 100;
  const installmentTotal = Math.round((financedAmount + interestAmount) * 100) / 100;
  return {
    downPayment,
    financedAmount,
    interestAmount,
    installmentTotal,
    totalAmount: Math.round((downPayment + installmentTotal) * 100) / 100,
  };
}

export function buildInstallmentSchedule(plan) {
  const months = Number(plan.months);
  const { installmentTotal } = calculateInstallmentAmounts(plan);
  const evenPayment = Math.floor((installmentTotal / months) * 100) / 100;
  let remaining = Math.round(installmentTotal * 100);

  return Array.from({ length: months }, (_, index) => {
    const amount = index === months - 1 ? remaining / 100 : evenPayment;
    remaining -= Math.round(amount * 100);
    return {
      installmentNumber: index + 1,
      month: addMonths(plan.startMonth, index),
      amount,
      paid: false,
      paidAt: "",
    };
  });
}

export function prepareInstallmentPlan(input) {
  const plan = {
    id: input.id || globalThis.crypto?.randomUUID?.() || `INS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(input.name || "").trim(),
    price: Math.round(Number(input.price) * 100) / 100,
    downPayment: Math.round(Number(input.downPayment || 0) * 100) / 100,
    interestRate: Math.round(Number(input.interestRate || 0) * 100) / 100,
    months: Number(input.months),
    bank: String(input.bank || ""),
    startMonth: String(input.startMonth || currentInstallmentMonth()),
    createdAt: input.createdAt || new Date().toISOString(),
    schedule: [],
  };
  Object.assign(plan, calculateInstallmentAmounts(plan));
  plan.schedule = Array.isArray(input.schedule) && input.schedule.length
    ? input.schedule.map((item, index) => ({
        installmentNumber: Number(item.installmentNumber || index + 1),
        month: String(item.month || addMonths(plan.startMonth, index)),
        amount: Number(item.amount || 0),
        paid: Boolean(item.paid),
        paidAt: String(item.paidAt || ""),
      }))
    : buildInstallmentSchedule(plan);
  return plan;
}

export function summarizeInstallments(plans, month) {
  const schedule = plans.flatMap((plan) => (plan.schedule || []).map((payment) => ({ ...payment, plan })));
  const dueThisMonth = schedule.filter((payment) => payment.month === month);
  const outstanding = schedule.filter((payment) => !payment.paid);
  return {
    dueThisMonth,
    dueAmount: dueThisMonth.reduce((sum, payment) => sum + payment.amount, 0),
    paidThisMonth: dueThisMonth.filter((payment) => payment.paid).length,
    dueCount: dueThisMonth.length,
    outstandingAmount: outstanding.reduce((sum, payment) => sum + payment.amount, 0),
    paidCount: schedule.filter((payment) => payment.paid).length,
    paymentCount: schedule.length,
  };
}
