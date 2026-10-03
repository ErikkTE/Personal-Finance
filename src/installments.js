export const installmentBanks = [
  { value: "กสิกรไทย", label: "กสิกรไทย", short: "KBank", tone: "kasikorn" },
  { value: "SCB", label: "ไทยพาณิชย์", short: "SCB", tone: "scb" },
  { value: "UOB", label: "ยูโอบี", short: "UOB", tone: "uob" },
];

export function currentInstallmentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month, offset) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

export function buildInstallmentSchedule(plan) {
  const price = Number(plan.price);
  const interestRate = Number(plan.interestRate || 0);
  const months = Number(plan.months);
  const totalAmount = Math.round(price * (1 + interestRate / 100) * 100) / 100;
  const evenPayment = Math.floor((totalAmount / months) * 100) / 100;
  let remaining = Math.round(totalAmount * 100);

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
    interestRate: Math.round(Number(input.interestRate || 0) * 100) / 100,
    months: Number(input.months),
    bank: String(input.bank || ""),
    startMonth: String(input.startMonth || currentInstallmentMonth()),
    createdAt: input.createdAt || new Date().toISOString(),
    schedule: [],
  };
  plan.totalAmount = Math.round(plan.price * (1 + plan.interestRate / 100) * 100) / 100;
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
