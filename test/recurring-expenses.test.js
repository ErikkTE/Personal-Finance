import assert from "node:assert/strict";
import test from "node:test";
import {
  recurringExpenseDueDate,
  recurringExpenseDurationMonths,
  recurringExpenseMonthValues,
  summarizeFixedCommitments,
} from "../src/recurring-expenses.js";

test("recurring monthly dates include the selected end month and clamp to month length", () => {
  const expense = { startMonth: "2026-10", endMonth: "2027-09", dueDay: 31 };
  assert.equal(recurringExpenseDueDate(expense, "2026-10"), "2026-10-31");
  assert.equal(recurringExpenseDueDate(expense, "2027-02"), "2027-02-28");
  assert.equal(recurringExpenseDueDate(expense, "2027-09"), "2027-09-30");
  assert.equal(recurringExpenseDueDate(expense, "2027-10"), "");
  assert.equal(recurringExpenseDueDate(expense, "2026-09"), "");
});

test("an open-ended expense remains active and duration is inclusive", () => {
  assert.equal(recurringExpenseDueDate({ startMonth: "2026-01", endMonth: "", dueDay: 5 }, "2030-06"), "2030-06-05");
  assert.equal(recurringExpenseDurationMonths("2026-10", "2027-09"), 12);
  assert.equal(recurringExpenseDurationMonths("2026-10", "2026-10"), 1);
  assert.equal(recurringExpenseDurationMonths("2026-10", ""), 0);
  assert.equal(recurringExpenseDurationMonths("2027-01", "2026-12"), 0);
});

test("month choices include every month in a recurring term and retain its end month", () => {
  const values = recurringExpenseMonthValues([
    { startMonth: "2026-10", endMonth: "2027-02" },
    { startMonth: "2027-03", endMonth: "" },
  ], "2026-10", 24);
  assert.deepEqual(values.slice(0, 6), ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  assert.equal(values.includes("2028-10"), true);
  assert.equal(recurringExpenseMonthValues([], "invalid").length, 0);
});

test("monthly commitment summary combines fixed expenses, installments, and subscription billing", () => {
  const summary = summarizeFixedCommitments({
    month: "2026-10",
    fixedExpenses: [
      { id: "rent_2026", name: "ค่าเช่าบ้าน", category: "บ้านและที่พัก", amount: 12000, dueDay: 1, startMonth: "2026-10", endMonth: "" },
      { id: "phone_2026", name: "ค่าโทรศัพท์", category: "สาธารณูปโภค", amount: 799.5, dueDay: 20, startMonth: "2026-10", endMonth: "" },
    ],
    installments: [{ id: "device_2026", name: "แท็บเล็ต", months: 10, schedule: [
      { installmentNumber: 1, month: "2026-10", amount: 2500, paid: false },
      { installmentNumber: 2, month: "2026-10", amount: 2500.5, paid: true },
    ] }],
    subscriptions: [{ id: "music_2026", name: "เพลง", amount: 129, cycle: "monthly" }],
    subscriptionBillingDate: (subscription, month) => month === "2026-10" ? `${month}-24` : "",
  });

  assert.equal(summary.count, 5);
  assert.equal(summary.total, 17929);
  assert.equal(summary.remaining, 15428.5);
  assert.equal(summary.totals.fixed, 12799.5);
  assert.equal(summary.totals.installment, 5000.5);
  assert.equal(summary.totals.subscription, 129);
  assert.equal(summary.remainingTotals.installment, 2500);
  assert.deepEqual(summary.entries.map((entry) => entry.type), ["fixed", "fixed", "subscription", "installment", "installment"]);
  assert.equal(summary.entries[0].dueDate, "2026-10-01");
  assert.equal(summary.entries[4].paid, true);
});
