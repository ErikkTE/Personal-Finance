import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const CATEGORIES = new Set(["บ้านและที่พัก", "สาธารณูปโภค", "ประกัน", "สุขภาพ", "การศึกษา", "อื่นๆ"]);

function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function normalizeRecurringExpense(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("กรุณากรอกข้อมูลรายจ่ายให้ครบ");
  const name = String(input.name || "").trim().slice(0, 120);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const category = String(input.category || "อื่นๆ").trim();
  const dueDay = Number(input.dueDay);
  const startMonth = String(input.startMonth || "");
  const endMonth = String(input.endMonth || "");
  const note = String(input.note || "").trim().slice(0, 500);

  if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new Error("กรุณาระบุชื่อรายการและจำนวนเงินต่อเดือนให้ถูกต้อง");
  }
  if (!CATEGORIES.has(category) || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error("กรุณาเลือกหมวดหมู่และวันที่ชำระให้ถูกต้อง");
  }
  if (!validMonth(startMonth) || (endMonth && (!validMonth(endMonth) || endMonth < startMonth))) {
    throw new Error("เดือนเริ่มต้นหรือเดือนสิ้นสุดไม่ถูกต้อง");
  }

  return {
    id: typeof input.id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(input.id) ? input.id : randomUUID(),
    name,
    amount,
    category,
    dueDay,
    startMonth,
    endMonth,
    note,
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
      action = "listRecurringExpenses";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ recurringExpenses: result.recurringExpenses || [] });
    }

    if (req.method === "POST") {
      action = "saveRecurringExpense";
      const expense = normalizeRecurringExpense(req.body?.expense);
      const result = await callAppsScript({ action, requestId, recurringExpense: expense });
      return res.status(201).json({ recurringExpense: result.recurringExpense });
    }

    if (req.method === "PATCH") {
      action = "restoreRecurringExpense";
      const id = String(req.body?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("ไม่พบรหัสรายจ่ายประจำ");
      const result = await callAppsScript({ action, requestId, id });
      return res.status(200).json({ restored: Boolean(result?.restored), id });
    }

    if (req.method === "DELETE") {
      action = "softDeleteRecurringExpense";
      const id = String(req.body?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("ไม่พบรหัสรายจ่ายประจำ");
      const result = await callAppsScript({ action, requestId, id });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกรายจ่ายประจำได้";
    const validationError = /ไม่ถูกต้อง|กรุณา|ไม่พบรหัส|ไม่เกิน/.test(message);
    if (!validationError) console.error("Recurring expenses API request failed", { requestId, action, code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อข้อมูลรายจ่ายประจำใน Google Sheets ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
