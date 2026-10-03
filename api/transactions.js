import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

function validMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeTransaction(input) {
  if (!input || typeof input !== "object") throw new Error("กรุณาตรวจสอบข้อมูลรายการ");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("จำนวนเงินไม่ถูกต้อง");
  if (!validDate(input.date) || !validMonth(input.budgetMonth)) throw new Error("วันที่หรือเดือนงบประมาณไม่ถูกต้อง");

  const name = String(input.name || "").trim().slice(0, 160);
  const category = String(input.category || "").trim().slice(0, 80);
  if (!name || !category) throw new Error("กรุณาระบุชื่อรายการและหมวดหมู่");

  return {
    id: typeof input.id === "string" && input.id.length <= 80 ? input.id : randomUUID(),
    date: input.date,
    budgetMonth: input.budgetMonth,
    type: input.type === "income" ? "income" : "expense",
    category,
    name,
    amount,
    channel: String(input.channel || "อื่นๆ").trim().slice(0, 80),
    nature: String(input.nature || "ครั้งเดียว").trim().slice(0, 80),
    status: "ยืนยันแล้ว",
    note: String(input.note || "").trim().slice(0, 1000),
    incomeMonth: String(input.incomeMonth || "").trim().slice(0, 40),
  };
}

function normalizeEvidence(input) {
  if (input == null) return null;
  if (typeof input !== "object") throw new Error("ไฟล์หลักฐานไม่ถูกต้อง");

  const mimeType = String(input.mimeType || "");
  const fileName = String(input.fileName || "หลักฐาน").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 160);
  const base64 = String(input.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"].includes(mimeType)) {
    throw new Error("รองรับเฉพาะ JPG, PNG, WebP, HEIC, HEIF และ PDF");
  }
  if (!base64 || base64.length > 4_250_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("ไฟล์ต้องมีขนาดไม่เกิน 3 MB");
  }
  return { fileName, mimeType, base64 };
}

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;

  const requestId = randomUUID();
  let action = "unknown";
  try {
    if (req.method === "GET") {
      action = "listTransactions";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ transactions: result.transactions || [] });
    }

    if (req.method === "POST") {
      action = "saveTransaction";
      const transaction = normalizeTransaction(req.body?.transaction);
      const evidence = normalizeEvidence(req.body?.evidence);
      const result = await callAppsScript({ action, requestId, transaction, evidence });
      return res.status(201).json({ transaction: result.transaction });
    }

    if (req.method === "PATCH") {
      action = "restoreMonthTransactions";
      const budgetMonth = String(req.body?.budgetMonth || "").trim();
      if (!validMonth(budgetMonth)) return res.status(400).json({ error: "เดือนงบประมาณไม่ถูกต้อง" });
      const result = await callAppsScript({ action, requestId, budgetMonth });
      return res.status(200).json(result);
    }

    if (req.method === "DELETE") {
      action = "softDeleteTransaction";
      const id = String(req.body?.id || "").trim();
      if (!id || id.length > 80) return res.status(400).json({ error: "ไม่พบรหัสรายการ" });
      const result = await callAppsScript({ action, requestId, id });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกรายการได้";
    const code = String(error?.code || "UPSTREAM_ERROR");
    const validationError = /ไม่ถูกต้อง|กรุณา|รองรับ|ขนาดไม่เกิน|ไม่พบรหัส/.test(message);
    if (!validationError) console.error("Transactions API request failed", { requestId, action, code });
    if (code === "TRANSACTION_SAVE_FAILED") {
      return res.status(502).json({
        error: "บันทึกไม่ครบ รายการอาจอยู่ในสถานะรอตรวจสอบ กดบันทึกซ้ำเพื่อดำเนินการต่อได้โดยไม่เพิ่มรายการซ้ำ",
        requestId,
      });
    }
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อ Google Sheets/Drive ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
