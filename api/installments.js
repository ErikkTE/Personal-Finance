import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const BANKS = new Set(["กสิกรไทย", "SCB", "UOB", "สินเชื่อ"]);

function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function nextInstallmentMonthInBangkok() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const date = new Date(Date.UTC(values.year, values.month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function createSchedule(financedAmount, interestRate, months, startMonth) {
  const totalAmount = money(financedAmount * (1 + interestRate / 100));
  const evenAmount = Math.floor((totalAmount / months) * 100) / 100;
  let remainingCents = Math.round(totalAmount * 100);
  const [year, month] = startMonth.split("-").map(Number);
  return Array.from({ length: months }, (_, index) => {
    const due = new Date(Date.UTC(year, month - 1 + index, 1));
    const amount = index === months - 1 ? remainingCents / 100 : evenAmount;
    remainingCents -= Math.round(amount * 100);
    return {
      installmentNumber: index + 1,
      month: `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, "0")}`,
      amount,
      paid: false,
      paidAt: "",
    };
  });
}

function normalizePlan(input) {
  if (!input || typeof input !== "object") throw new Error("กรุณากรอกข้อมูลแผนผ่อนให้ครบ");
  const name = String(input.name || "").trim().slice(0, 120);
  const price = money(input.price);
  const downPayment = money(input.downPayment ?? 0);
  const interestRate = money(input.interestRate ?? 0);
  const months = Number(input.months);
  const bank = String(input.bank || "");
  const startMonth = nextInstallmentMonthInBangkok();
  if (!name) throw new Error("กรุณาระบุชื่อสินค้า");
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) throw new Error("ราคาสินค้าไม่ถูกต้อง");
  if (!Number.isFinite(downPayment) || downPayment < 0 || downPayment >= price) throw new Error("เงินดาวน์ต้องไม่ติดลบและต้องน้อยกว่าราคาสินค้า");
  if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) throw new Error("ดอกเบี้ยรวมต้องอยู่ระหว่าง 0–100%");
  if (!Number.isInteger(months) || months < 1 || months > 60) throw new Error("จำนวนเดือนต้องอยู่ระหว่าง 1–60 เดือน");
  if (!BANKS.has(bank)) throw new Error("กรุณาเลือกธนาคารที่รองรับ");
  if (!validMonth(startMonth)) throw new Error("เดือนเริ่มชำระไม่ถูกต้อง");

  const financedAmount = money(price - downPayment);
  const installmentTotal = money(financedAmount * (1 + interestRate / 100));
  return {
    id: typeof input.id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(input.id) ? input.id : randomUUID(),
    name,
    price,
    downPayment,
    financedAmount,
    interestRate,
    months,
    bank,
    startMonth,
    interestAmount: money(installmentTotal - financedAmount),
    installmentTotal,
    totalAmount: money(downPayment + installmentTotal),
    createdAt: new Date().toISOString(),
    schedule: createSchedule(financedAmount, interestRate, months, startMonth),
  };
}

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;

  const requestId = randomUUID();
  let action = "unknown";
  try {
    if (req.method === "GET") {
      action = "listInstallments";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ installments: result.installments || [] });
    }

    if (req.method === "POST") {
      action = "saveInstallment";
      const plan = normalizePlan(req.body?.plan);
      const result = await callAppsScript({ action, requestId, installment: plan });
      return res.status(201).json({ installment: result.installment });
    }

    if (req.method === "PATCH") {
      action = "setInstallmentPayment";
      const id = String(req.body?.id || "").trim();
      const installmentNumber = Number(req.body?.installmentNumber);
      const paid = req.body?.paid;
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("ไม่พบรหัสแผนผ่อน");
      if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 60 || typeof paid !== "boolean") {
        throw new Error("สถานะงวดที่เลือกไม่ถูกต้อง");
      }
      const result = await callAppsScript({ action, requestId, id, installmentNumber, paid });
      return res.status(200).json({ installment: result.installment });
    }

    if (req.method === "DELETE") {
      action = "softDeleteInstallment";
      const id = String(req.body?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("ไม่พบรหัสแผนผ่อน");
      const result = await callAppsScript({ action, requestId, id });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกแผนผ่อนได้";
    const validationError = /ไม่ถูกต้อง|กรุณา|ต้องอยู่|ต้องไม่ติดลบ|ไม่พบรหัส/.test(message);
    if (!validationError) console.error("Installments API request failed", { requestId, action, code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อข้อมูลผ่อนชำระใน Google Sheets ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
