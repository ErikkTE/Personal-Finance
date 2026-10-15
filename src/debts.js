const PRIORITIES = new Set(["high", "normal", "low"]);
const MONEY_LIMIT = 100_000_000;

export function roundDebtMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function validDebtDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthParts(dateValue, monthOffset) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const dueYear = monthDate.getUTCFullYear();
  const dueMonthIndex = monthDate.getUTCMonth();
  const dueDay = Math.min(day, new Date(Date.UTC(dueYear, dueMonthIndex + 1, 0)).getUTCDate());
  const monthString = String(dueMonthIndex + 1).padStart(2, "0");
  return {
    month: String(dueYear) + "-" + monthString,
    dueDate: String(dueYear) + "-" + monthString + "-" + String(dueDay).padStart(2, "0"),
  };
}

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export function buildDebtSchedule(debt) {
  const months = Number(debt.installments);
  const principal = roundDebtMoney(debt.principal);
  const interestRate = debt.hasInterest ? Number(debt.interestRate || 0) : 0;
  const total = roundDebtMoney(principal + (debt.hasInterest ? principal * interestRate / 100 : 0));
  const regularCents = Math.floor((total * 100) / months);
  let remainingCents = Math.round(total * 100);
  const paymentsByNumber = new Map((debt.payments || []).map((payment) => [Number(payment.installmentNumber), payment]));

  return Array.from({ length: months }, (_, index) => {
    const payment = paymentsByNumber.get(index + 1);
    const amountCents = index === months - 1 ? remainingCents : regularCents;
    remainingCents -= amountCents;
    const due = monthParts(debt.loanDate, index + 1);
    return {
      installmentNumber: index + 1,
      month: due.month,
      dueDate: due.dueDate,
      amount: amountCents / 100,
      paid: Boolean(payment),
      paidAt: String(payment?.paidAt || ""),
      evidence: Array.isArray(payment?.evidence) ? payment.evidence : [],
      signature: payment?.signature || null,
      note: String(payment?.note || ""),
    };
  });
}

export function summarizeDebt(debt) {
  const schedule = buildDebtSchedule(debt);
  const totalAmount = roundDebtMoney(debt.principal + (debt.hasInterest ? debt.principal * Number(debt.interestRate || 0) / 100 : 0));
  const paidAmount = roundDebtMoney(schedule.filter((payment) => payment.paid).reduce((sum, payment) => sum + payment.amount, 0));
  const remainingAmount = roundDebtMoney(totalAmount - paidAmount);
  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    paidCount: schedule.filter((payment) => payment.paid).length,
    installmentCount: schedule.length,
    schedule,
    complete: schedule.length > 0 && schedule.every((payment) => payment.paid),
    nextPayment: schedule.find((payment) => !payment.paid) || null,
  };
}

export function validateDebtInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("กรุณากรอกข้อมูลให้ครบ");
  const lender = String(input.lender || "").trim();
  const borrower = String(input.borrower || "").trim();
  const loanDate = String(input.loanDate || "");
  const principal = roundDebtMoney(input.principal);
  const hasInterest = input.hasInterest === true;
  const interestRate = hasInterest ? roundDebtMoney(input.interestRate) : 0;
  const installments = Number(input.installments);
  const priority = String(input.priority || "");
  const note = String(input.note || "").trim();

  if (!lender || lender.length > 100 || !borrower || borrower.length > 100) throw new Error("กรุณาระบุผู้ให้ยืมและผู้ยืม (ไม่เกิน 100 ตัวอักษร)");
  if (!validDebtDate(loanDate) || loanDate > todayInBangkok()) throw new Error("วันที่ยืมไม่ถูกต้อง");
  if (!Number.isFinite(principal) || principal <= 0 || principal > MONEY_LIMIT) throw new Error("จำนวนเงินที่ยืมไม่ถูกต้อง");
  if (hasInterest && (!Number.isFinite(interestRate) || interestRate <= 0 || interestRate > 100)) throw new Error("ดอกเบี้ยรวมต้องอยู่ระหว่าง 0.01–100%");
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) throw new Error("จำนวนงวดต้องอยู่ระหว่าง 1–120 งวด");
  if (!PRIORITIES.has(priority)) throw new Error("กรุณาเลือกระดับความสำคัญ");
  if (note.length > 500) throw new Error("หมายเหตุต้องไม่เกิน 500 ตัวอักษร");

  return {
    id: String(input.id || ""),
    lender,
    borrower,
    loanDate,
    principal,
    hasInterest,
    interestRate,
    installments,
    priority,
    note,
    loanEvidence: Array.isArray(input.loanEvidence) ? input.loanEvidence : [],
    lenderSignature: input.lenderSignature || null,
  };
}

export function makeDebtId() {
  return globalThis.crypto?.randomUUID?.() || "DEBT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}
