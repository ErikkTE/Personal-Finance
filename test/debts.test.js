import assert from "node:assert/strict";
import test from "node:test";
import { buildDebtSchedule, debtEditSnapshot, summarizeDebt, validateDebtEventInput, validateDebtInput, validateDebtPaymentInput } from "../src/debts.js";

test("debt schedule starts the next month and clips month-end dates", () => {
  const schedule = buildDebtSchedule({
    loanDate: "2025-01-31",
    principal: 1000.01,
    installments: 3,
    hasInterest: false,
    payments: [],
  });

  assert.deepEqual(schedule.map(({ dueDate }) => dueDate), ["2025-02-28", "2025-03-31", "2025-04-30"]);
  assert.deepEqual(schedule.map(({ amount }) => amount), [333.33, 333.33, 333.35]);
});

test("debt summary includes flat interest and subtracts only paid installments", () => {
  const debt = {
    loanDate: "2025-05-15",
    principal: 1000,
    hasInterest: true,
    interestRate: 3.5,
    installments: 3,
    payments: [{ installmentNumber: 1, paidAt: "2025-06-15", evidence: [{ fileName: "receipt.jpg" }] }],
  };
  const summary = summarizeDebt(debt);

  assert.equal(summary.totalAmount, 1035);
  assert.equal(summary.paidAmount, 345);
  assert.equal(summary.remainingAmount, 690);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.nextPayment.installmentNumber, 2);
});

test("debt summary separates overdue, due-today, and upcoming amounts", () => {
  const debt = {
    loanDate: "2026-07-15",
    principal: 1200,
    hasInterest: false,
    installments: 4,
    payments: [],
  };
  const overdueSummary = summarizeDebt(debt, "2026-10-15");

  assert.equal(overdueSummary.status, "overdue");
  assert.equal(overdueSummary.overdueCount, 2);
  assert.equal(overdueSummary.overdueAmount, 600);
  assert.equal(overdueSummary.overdueDays, 61);
  assert.equal(overdueSummary.dueTodayCount, 1);
  assert.equal(overdueSummary.dueTodayAmount, 300);
  assert.equal(overdueSummary.dueThisMonthCount, 1);
  assert.equal(overdueSummary.dueThisMonthAmount, 300);

  const paidPastDueSummary = summarizeDebt({
    ...debt,
    payments: [{ installmentNumber: 1 }, { installmentNumber: 2 }],
  }, "2026-10-15");
  assert.equal(paidPastDueSummary.status, "dueToday");
  assert.equal(paidPastDueSummary.overdueCount, 0);
  assert.equal(paidPastDueSummary.overdueAmount, 0);
  assert.equal(paidPastDueSummary.nextPayment.installmentNumber, 3);

  const dueLaterSummary = summarizeDebt({
    ...debt,
    payments: [{ installmentNumber: 1 }, { installmentNumber: 2 }, { installmentNumber: 3 }],
  }, "2026-10-15");
  assert.equal(dueLaterSummary.status, "scheduled");
  assert.equal(dueLaterSummary.dueThisMonthCount, 0);
  assert.equal(dueLaterSummary.nextPayment.dueDate, "2026-11-15");
});

test("partial payments reduce the installment balance and allow another payment", () => {
  const debt = {
    id: "DEBT-12345678",
    loanDate: "2026-09-15",
    principal: 900,
    hasInterest: false,
    installments: 3,
    payments: [{ eventId: "EVENT-12345678", installmentNumber: 1, amount: 125, paidAt: "2026-10-01" }],
  };
  const summary = summarizeDebt(debt, "2026-10-15");

  assert.equal(summary.receivedAmount, 125);
  assert.equal(summary.remainingAmount, 775);
  assert.equal(summary.schedule[0].paid, false);
  assert.equal(summary.schedule[0].paidAmount, 125);
  assert.equal(summary.schedule[0].remainingAmount, 175);
  assert.equal(validateDebtPaymentInput({
    eventId: "EVENT-22345678", installmentNumber: 1, amount: 175, paidAt: "2026-10-15",
    evidence: [{ fileName: "receipt.jpg" }], signature: { fileName: "signature.png" },
  }, debt, "2026-10-15").amount, 175);
  assert.throws(() => validateDebtPaymentInput({
    eventId: "EVENT-32345678", installmentNumber: 1, amount: 176, paidAt: "2026-10-15",
    evidence: [{ fileName: "receipt.jpg" }], signature: { fileName: "signature.png" },
  }, debt, "2026-10-15"), /ยอดรับเกิน/);
});

test("early close settles remaining installments and reports actual received amount", () => {
  const debt = {
    id: "DEBT-12345678",
    loanDate: "2026-09-15",
    principal: 900,
    hasInterest: false,
    installments: 3,
    payments: [
      { eventId: "EVENT-12345678", installmentNumber: 1, amount: 200, paidAt: "2026-10-01" },
      { eventId: "EVENT-22345678", eventType: "earlyClose", installmentNumber: 0, amount: 700, paidAt: "2026-10-10" },
    ],
  };
  const summary = summarizeDebt(debt, "2026-10-15");

  assert.equal(summary.receivedAmount, 900);
  assert.equal(summary.remainingAmount, 0);
  assert.equal(summary.complete, true);
  assert.equal(summary.schedule.every((payment) => payment.paid && payment.settledByEarlyClose), true);
});

test("in-app reminder includes only payments due within the next seven days", () => {
  const summary = summarizeDebt({
    loanDate: "2026-09-15",
    principal: 600,
    hasInterest: false,
    installments: 3,
    payments: [],
  }, "2026-10-15");

  assert.equal(summary.dueSoonCount, 1);
  assert.equal(summary.dueSoonAmount, 200);
  assert.equal(summary.dueThisMonthCount, 1);
});

test("cancellation stays separate from repayment and must refer to its source debt", () => {
  const debt = {
    id: "DEBT-12345678",
    loanDate: "2026-09-15",
    principal: 600,
    hasInterest: false,
    installments: 3,
    payments: [],
    events: [{ id: "EVENT-22345678", type: "cancellation", referenceId: "DEBT-12345678", note: "สร้างรายการซ้ำ" }],
  };
  const summary = summarizeDebt(debt, "2026-10-15");

  assert.equal(summary.cancelled, true);
  assert.equal(summary.complete, false);
  assert.equal(summary.remainingAmount, 0);
  assert.equal(summary.status, "cancelled");
  assert.equal(summary.dueThisMonthCount, 0);
  assert.equal(validateDebtEventInput({
    eventId: "EVENT-32345678", type: "clarification", referenceId: debt.id, note: "ชี้แจงยอดเดิม",
  }, { ...debt, events: [] }, "2026-10-15").type, "clarification");
  assert.throws(() => validateDebtEventInput({
    eventId: "EVENT-42345678", type: "clarification", referenceId: "DEBT-87654321", note: "อ้างอิงผิดรายการ",
  }, { ...debt, events: [] }, "2026-10-15"), /รายการทวงหนี้เดิม/);
  assert.throws(() => validateDebtEventInput({
    eventId: "EVENT-52345678", type: "cancellation", referenceId: debt.id, note: "ยกเลิกก่อน",
  }, { ...debt, events: [], payments: [{ installmentNumber: 1, amount: 50 }] }, "2026-10-15"), /ยกเลิกไม่ได้/);
});

test("debt corrections preserve history, reject stale data, and lock financial terms after repayment", () => {
  const debt = {
    id: "DEBT-12345678",
    lender: "ฉัน",
    borrower: "ผู้ยืมเดิม",
    loanDate: "2025-06-01",
    principal: 500,
    hasInterest: false,
    interestRate: 0,
    installments: 2,
    priority: "normal",
    note: "",
    payments: [],
    events: [],
  };
  const correction = validateDebtEventInput({
    eventId: "EVENT-12345678",
    type: "correction",
    debtId: debt.id,
    referenceId: debt.id,
    expected: debtEditSnapshot(debt),
    changes: { borrower: "ผู้ยืมที่ถูกต้อง", principal: 750 },
    note: "แก้ชื่อและยอดที่กรอกผิด",
  }, debt, "2026-10-15");

  assert.deepEqual(correction.changes, { borrower: "ผู้ยืมที่ถูกต้อง", principal: 750 });
  assert.equal(correction.before.borrower, "ผู้ยืมเดิม");
  assert.equal(correction.after.borrower, "ผู้ยืมที่ถูกต้อง");
  assert.throws(() => validateDebtEventInput({
    ...correction,
    eventId: "EVENT-22345678",
    expected: { ...debtEditSnapshot(debt), note: "มีคนแก้ระหว่างนี้" },
  }, debt, "2026-10-15"), /ถูกแก้ไขระหว่าง/);
  assert.throws(() => validateDebtEventInput({
    ...correction,
    eventId: "EVENT-32345678",
    changes: { principal: 500 },
  }, debt, "2026-10-15"), /ไม่มีข้อมูลที่เปลี่ยนแปลง/);

  const debtWithPayment = {
    ...debt,
    payments: [{ eventId: "EVENT-42345678", installmentNumber: 1, amount: 250, paidAt: "2025-07-01" }],
  };
  const nameCorrection = validateDebtEventInput({
    eventId: "EVENT-52345678",
    type: "correction",
    debtId: debt.id,
    referenceId: debt.id,
    expected: debtEditSnapshot(debtWithPayment),
    changes: { note: "เพิ่มหมายเหตุหลังเริ่มรับชำระ" },
    note: "เพิ่มรายละเอียดประกอบ",
  }, debtWithPayment, "2026-10-15");
  assert.equal(nameCorrection.changes.note, "เพิ่มหมายเหตุหลังเริ่มรับชำระ");
  assert.throws(() => validateDebtEventInput({
    ...nameCorrection,
    eventId: "EVENT-62345678",
    changes: { principal: 750 },
  }, debtWithPayment, "2026-10-15"), /เริ่มรับชำระแล้ว/);
});

test("debt input rejects invalid dates, interest, and installment ranges", () => {
  const valid = {
    id: "DEBT-12345678",
    lender: "ฉัน",
    borrower: "ผู้ยืม",
    loanDate: "2025-06-01",
    principal: 500,
    hasInterest: false,
    interestRate: 0,
    installments: 1,
    priority: "normal",
    note: "",
  };

  assert.equal(validateDebtInput(valid).principal, 500);
  assert.throws(() => validateDebtInput({ ...valid, loanDate: "2025-02-29" }), /วันที่ยืม/);
  assert.throws(() => validateDebtInput({ ...valid, hasInterest: true, interestRate: 0 }), /ดอกเบี้ย/);
  assert.throws(() => validateDebtInput({ ...valid, installments: 121 }), /จำนวนงวด/);
});
