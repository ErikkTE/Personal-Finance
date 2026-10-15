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
  const paymentEvents = debt.payments || [];
  const paymentsByNumber = new Map();
  paymentEvents.filter((payment) => payment.eventType !== "earlyClose").forEach((payment) => {
    const number = Number(payment.installmentNumber);
    if (!paymentsByNumber.has(number)) paymentsByNumber.set(number, []);
    paymentsByNumber.get(number).push(payment);
  });
  const earlyClose = paymentEvents.find((payment) => payment.eventType === "earlyClose") || null;

  return Array.from({ length: months }, (_, index) => {
    const amountCents = index === months - 1 ? remainingCents : regularCents;
    remainingCents -= amountCents;
    const due = monthParts(debt.loanDate, index + 1);
    const events = paymentsByNumber.get(index + 1) || [];
    const paidAmount = roundDebtMoney(events.reduce((sum, payment) => sum + (Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0 ? Number(payment.amount) : amountCents / 100), 0));
    const remainingAmount = earlyClose ? 0 : roundDebtMoney(Math.max(0, amountCents / 100 - paidAmount));
    const paid = Boolean(earlyClose) || remainingAmount <= 0.005;
    const lastPayment = events[events.length - 1] || null;
    return {
      installmentNumber: index + 1,
      month: due.month,
      dueDate: due.dueDate,
      amount: amountCents / 100,
      paidAmount: paid ? amountCents / 100 : Math.min(amountCents / 100, paidAmount),
      remainingAmount,
      paid,
      settledByEarlyClose: Boolean(earlyClose),
      paidAt: earlyClose ? String(earlyClose.paidAt || "") : String(paid ? lastPayment?.paidAt || "" : ""),
      evidence: Array.isArray(lastPayment?.evidence) ? lastPayment.evidence : [],
      signature: lastPayment?.signature || null,
      note: String(lastPayment?.note || ""),
      paymentEvents: events,
    };
  });
}

export function daysBetweenDebtDates(startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  return Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86_400_000);
}

function addDebtDays(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function summarizeDebt(debt, today = todayInBangkok()) {
  const schedule = buildDebtSchedule(debt);
  const totalAmount = roundDebtMoney(debt.principal + (debt.hasInterest ? debt.principal * Number(debt.interestRate || 0) / 100 : 0));
  const payments = debt.payments || [];
  const earlyClose = payments.find((payment) => payment.eventType === "earlyClose") || null;
  const cancelled = (debt.events || []).some((event) => event.type === "cancellation");
  const receivedAmount = roundDebtMoney(payments.reduce((sum, payment) => {
    const number = Number(payment.installmentNumber);
    const scheduled = schedule[number - 1];
    const amount = Number(payment.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : scheduled?.amount || 0);
  }, 0));
  const paidAmount = receivedAmount;
  const remainingAmount = cancelled || earlyClose ? 0 : roundDebtMoney(Math.max(0, totalAmount - receivedAmount));
  const paidPayments = schedule.filter((payment) => payment.paid);
  const unpaidPayments = cancelled || earlyClose ? [] : schedule.filter((payment) => payment.remainingAmount > 0.005);
  const overduePayments = unpaidPayments.filter((payment) => payment.dueDate < today);
  const dueTodayPayments = unpaidPayments.filter((payment) => payment.dueDate === today);
  const dueThisMonthPayments = unpaidPayments.filter((payment) => payment.month === today.slice(0, 7) && payment.dueDate >= today);
  const dueSoonPayments = unpaidPayments.filter((payment) => payment.dueDate >= today && payment.dueDate <= addDebtDays(today, 7));
  const nextPayment = unpaidPayments[0] || null;
  const complete = !cancelled && schedule.length > 0 && (Boolean(earlyClose) || unpaidPayments.length === 0);
  const status = cancelled
    ? "cancelled"
    : complete
    ? "complete"
    : overduePayments.length
      ? "overdue"
      : nextPayment?.dueDate === today
        ? "dueToday"
        : nextPayment?.month === today.slice(0, 7)
          ? "dueThisMonth"
          : "scheduled";
  return {
    totalAmount,
    paidAmount,
    remainingAmount,
    receivedAmount,
    earlyCloseAmount: earlyClose ? Number(earlyClose.amount || 0) : 0,
    earlyClose,
    cancelled,
    paymentEventCount: payments.length,
    paidCount: paidPayments.length,
    installmentCount: schedule.length,
    schedule,
    complete,
    nextPayment,
    status,
    overdueCount: overduePayments.length,
    overdueAmount: roundDebtMoney(overduePayments.reduce((sum, payment) => sum + payment.remainingAmount, 0)),
    overdueDays: overduePayments.length ? daysBetweenDebtDates(nextPayment.dueDate, today) : 0,
    dueTodayCount: dueTodayPayments.length,
    dueTodayAmount: roundDebtMoney(dueTodayPayments.reduce((sum, payment) => sum + payment.remainingAmount, 0)),
    dueThisMonthCount: dueThisMonthPayments.length,
    dueThisMonthAmount: roundDebtMoney(dueThisMonthPayments.reduce((sum, payment) => sum + payment.remainingAmount, 0)),
    dueSoonPayments,
    dueSoonCount: dueSoonPayments.length,
    dueSoonAmount: roundDebtMoney(dueSoonPayments.reduce((sum, payment) => sum + payment.remainingAmount, 0)),
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

export function validateDebtPaymentInput(input, debt, today = todayInBangkok()) {
  if (!input || typeof input !== "object" || !debt) throw new Error("ไม่พบรายการทวงหนี้");
  const eventId = String(input.eventId || "").trim();
  const eventType = input.eventType === "earlyClose" ? "earlyClose" : "installment";
  const installmentNumber = Number(input.installmentNumber);
  const paidAt = String(input.paidAt || "");
  const amount = roundDebtMoney(input.amount);
  const note = String(input.note || "").trim();
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(eventId)) throw new Error("รหัสหลักฐานไม่ถูกต้อง กรุณาลองอีกครั้ง");
  if (!validDebtDate(paidAt) || paidAt > today) throw new Error("วันที่ชำระไม่ถูกต้อง");
  if (!Number.isFinite(amount) || amount <= 0 || amount > MONEY_LIMIT) throw new Error("จำนวนเงินที่รับต้องมากกว่า 0 บาท");
  if (note.length > 300) throw new Error("หมายเหตุการชำระต้องไม่เกิน 300 ตัวอักษร");
  if (evidence.length < 1 || evidence.length > 3) throw new Error("แนบรูปหลักฐานการรับชำระ 1–3 รูป");
  if (!input.signature || typeof input.signature !== "object") throw new Error("กรุณาเซ็นชื่อก่อนบันทึก");

  const summary = summarizeDebt(debt, today);
  if (summary.complete || summary.cancelled) throw new Error("รายการนี้ปิดหรือยกเลิกแล้ว");
  if (eventType === "earlyClose") {
    if (installmentNumber !== 0 || amount > summary.remainingAmount + 0.005) throw new Error("ยอดปิดหนี้ก่อนกำหนดเกินยอดคงเหลือ");
  } else {
    const installment = summary.schedule.find((item) => item.installmentNumber === installmentNumber);
    if (!installment || installment.paid || amount > installment.remainingAmount + 0.005) throw new Error("ยอดรับเกินยอดคงเหลือของงวดนี้");
  }
  return { eventId, eventType, debtId: debt.id, installmentNumber, paidAt, amount, evidence, signature: input.signature, note };
}

export function validateDebtEventInput(input, debt, today = todayInBangkok()) {
  if (!input || typeof input !== "object" || !debt) throw new Error("ไม่พบรายการทวงหนี้");
  const eventId = String(input.eventId || "").trim();
  const type = String(input.type || "");
  const note = String(input.note || "").trim();
  const referenceId = String(input.referenceId || debt.id).trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(eventId)) throw new Error("รหัสบันทึกไม่ถูกต้อง กรุณาลองอีกครั้ง");
  if (!new Set(["clarification", "cancellation", "correction"]).has(type)) throw new Error("ประเภทบันทึกไม่ถูกต้อง");
  if (note.length < 3 || note.length > 500) throw new Error("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร และไม่เกิน 500 ตัวอักษร");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(referenceId)) throw new Error("รายการอ้างอิงไม่ถูกต้อง");
  if (referenceId !== debt.id) throw new Error("บันทึกนี้ต้องอ้างอิงรายการทวงหนี้เดิม");
  if (type === "correction") {
    if (summarizeDebt(debt, today).cancelled) throw new Error("รายการที่ยกเลิกแล้วแก้ไขไม่ได้");
    const allowed = new Set(["lender", "borrower", "loanDate", "principal", "hasInterest", "interestRate", "installments", "priority", "note"]);
    const changes = input.changes && typeof input.changes === "object" && !Array.isArray(input.changes) ? input.changes : null;
    if (!changes || !Object.keys(changes).length || Object.keys(changes).some((key) => !allowed.has(key))) {
      throw new Error("เลือกข้อมูลที่ต้องการแก้ไขให้ถูกต้อง");
    }
    const expected = input.expected && typeof input.expected === "object" && !Array.isArray(input.expected) ? input.expected : null;
    const current = debtEditSnapshot(debt);
    if (!expected || JSON.stringify(debtEditSnapshot(expected)) !== JSON.stringify(current)) {
      throw new Error("รายการนี้ถูกแก้ไขระหว่างที่คุณเปิดอยู่ กรุณาปิดแล้วเปิดใหม่ก่อนแก้ไข");
    }
    const financial = new Set(["loanDate", "principal", "hasInterest", "interestRate", "installments"]);
    const financialChanged = Object.keys(changes).some((key) => financial.has(key));
    if (financialChanged && summarizeDebt(debt, today).paymentEventCount > 0) {
      throw new Error("เริ่มรับชำระแล้ว จึงแก้เงื่อนไขยอดเงินและงวดไม่ได้ แต่แก้ชื่อ ความสำคัญ และหมายเหตุได้");
    }
    const updated = validateDebtInput({ ...debt, ...changes });
    const normalizedChanges = {};
    Object.keys(changes).forEach((key) => {
      if (updated[key] !== current[key]) normalizedChanges[key] = updated[key];
    });
    if (!Object.keys(normalizedChanges).length) throw new Error("ยังไม่มีข้อมูลที่เปลี่ยนแปลง");
    const after = debtEditSnapshot(updated);
    return { eventId, debtId: debt.id, type, referenceId, note, expected: current, before: current, after, changes: normalizedChanges, createdAt: today };
  }
  if (type === "cancellation" && (summarizeDebt(debt, today).paymentEventCount > 0 || summarizeDebt(debt, today).complete)) {
    throw new Error("ยกเลิกไม่ได้เมื่อมีการรับชำระแล้ว ให้เพิ่มบันทึกชี้แจงแทน");
  }
  if (type === "cancellation" && summarizeDebt(debt, today).cancelled) throw new Error("รายการนี้ถูกยกเลิกไว้แล้ว");
  return { eventId, debtId: debt.id, type, referenceId, note, createdAt: today };
}

export function debtEditSnapshot(debt) {
  return {
    lender: String(debt?.lender || "").trim(),
    borrower: String(debt?.borrower || "").trim(),
    loanDate: String(debt?.loanDate || ""),
    principal: roundDebtMoney(debt?.principal),
    hasInterest: debt?.hasInterest === true,
    interestRate: debt?.hasInterest === true ? roundDebtMoney(debt?.interestRate || 0) : 0,
    installments: Number(debt?.installments || 0),
    priority: String(debt?.priority || "normal"),
    note: String(debt?.note || "").trim(),
  };
}

export function makeDebtId() {
  return globalThis.crypto?.randomUUID?.() || "DEBT-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

export function makeDebtEventId() {
  return "EVENT-" + (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2, 12));
}
