import assert from "node:assert/strict";
import test from "node:test";
import { buildDebtSchedule, summarizeDebt, validateDebtInput } from "../src/debts.js";

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
