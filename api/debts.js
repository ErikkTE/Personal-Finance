import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BASE64 = 650_000;

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeImage(image, index) {
  if (!image || typeof image !== "object") throw new Error("รูปภาพหลักฐานไม่ถูกต้อง");
  const mimeType = String(image.mimeType || "").toLowerCase();
  const base64 = String(image.base64 || "").replace(/^data:[^;]+;base64,/, "");
  const fileName = String(image.fileName || ("image-" + (index + 1) + ".jpg")).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 100);
  if (!IMAGE_TYPES.has(mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > MAX_IMAGE_BASE64) {
    throw new Error("รองรับภาพ JPG, PNG หรือ WebP ขนาดเล็กเท่านั้น");
  }
  const decodedSize = Buffer.from(base64, "base64").byteLength;
  if (!decodedSize || decodedSize > 480_000) throw new Error("รูปแต่ละภาพต้องไม่เกิน 480 KB หลังย่อ");
  return { fileName, mimeType, base64 };
}

function normalizeImages(value, required) {
  const images = Array.isArray(value) ? value : [];
  if (images.length > 3) throw new Error("แนบรูปได้ไม่เกิน 3 รูป");
  if (required && images.length === 0) throw new Error("กรุณาแนบรูปหลักฐานการชำระอย่างน้อย 1 รูป");
  const normalized = images.map(normalizeImage);
  if (normalized.reduce((sum, item) => sum + item.base64.length, 0) > 1_850_000) {
    throw new Error("ขนาดรูปทั้งหมดใหญ่เกินไป กรุณาลดจำนวนหรือเลือกรูปที่เล็กลง");
  }
  return normalized;
}

function normalizeSignature(value) {
  const signature = value && typeof value === "object" ? value : null;
  const mimeType = String(signature?.mimeType || "").toLowerCase();
  const base64 = String(signature?.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (mimeType !== "image/png" || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 360_000) {
    throw new Error("กรุณาเซ็นชื่อในช่องลายเซ็นก่อนบันทึก");
  }
  return { fileName: "signature.png", mimeType, base64 };
}

function normalizeDebt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("กรุณากรอกข้อมูลหนี้ให้ครบ");
  const id = String(input.id || "").trim();
  const lender = String(input.lender || "").trim();
  const borrower = String(input.borrower || "").trim();
  const loanDate = String(input.loanDate || "");
  const principal = Math.round(Number(input.principal) * 100) / 100;
  const hasInterest = input.hasInterest === true;
  const interestRate = hasInterest ? Math.round(Number(input.interestRate) * 100) / 100 : 0;
  const installments = Number(input.installments);
  const priority = String(input.priority || "");
  const note = String(input.note || "").trim();
  const loanEvidence = normalizeImages(input.loanEvidence, false);
  const lenderSignature = input.lenderSignature ? normalizeSignature(input.lenderSignature) : null;

  if (!ID_PATTERN.test(id)) throw new Error("รหัสรายการไม่ถูกต้อง กรุณาลองบันทึกใหม่");
  if (!lender || lender.length > 100 || !borrower || borrower.length > 100) throw new Error("กรุณาระบุผู้ให้ยืมและผู้ยืม");
  if (!validDate(loanDate) || loanDate > todayInBangkok()) throw new Error("วันที่ยืมไม่ถูกต้อง");
  if (!Number.isFinite(principal) || principal <= 0 || principal > 100_000_000) throw new Error("จำนวนเงินที่ยืมไม่ถูกต้อง");
  if (hasInterest && (!Number.isFinite(interestRate) || interestRate <= 0 || interestRate > 100)) throw new Error("ดอกเบี้ยรวมต้องอยู่ระหว่าง 0.01–100%");
  if (!Number.isInteger(installments) || installments < 1 || installments > 120) throw new Error("จำนวนงวดต้องอยู่ระหว่าง 1–120 งวด");
  if (!["high", "normal", "low"].includes(priority)) throw new Error("ระดับความสำคัญไม่ถูกต้อง");
  if (note.length > 500) throw new Error("หมายเหตุต้องไม่เกิน 500 ตัวอักษร");
  return { id, lender, borrower, loanDate, principal, hasInterest, interestRate, installments, priority, note, loanEvidence, lenderSignature };
}

function normalizePayment(body) {
  const debtId = String(body?.id || "").trim();
  const installmentNumber = Number(body?.installmentNumber);
  const paidAt = String(body?.paidAt || "");
  const note = String(body?.note || "").trim();
  const evidence = normalizeImages(body?.evidence, true);
  const signature = normalizeSignature(body?.signature);
  if (!ID_PATTERN.test(debtId)) throw new Error("ไม่พบรายการทวงหนี้");
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 120) throw new Error("งวดที่เลือกไม่ถูกต้อง");
  if (!validDate(paidAt) || paidAt > todayInBangkok()) throw new Error("วันที่ชำระไม่ถูกต้อง");
  if (note.length > 300) throw new Error("หมายเหตุการชำระต้องไม่เกิน 300 ตัวอักษร");
  return { debtId, installmentNumber, paidAt, evidence, signature, note };
}

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;

  const requestId = randomUUID();
  let action = "unknown";
  try {
    if (req.method === "GET") {
      action = "listDebts";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ debts: result.debts || [] });
    }
    if (req.method === "POST") {
      action = "saveDebt";
      const debt = normalizeDebt(req.body?.debt);
      const result = await callAppsScript({ action, requestId, debt });
      return res.status(201).json({ debt: result.debt });
    }
    if (req.method === "PATCH") {
      action = "recordDebtPayment";
      const payment = normalizePayment(req.body);
      const result = await callAppsScript({ action, requestId, payment });
      return res.status(200).json({ debt: result.debt });
    }
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "บันทึกข้อมูลทวงหนี้ไม่สำเร็จ";
    const validationError = /กรุณา|ไม่ถูกต้อง|ไม่พบรายการ|ไม่ก่อน|ต้องอยู่|ต้องไม่|รองรับ|แนบรูป|ใหญ่เกินไป|ไม่เกิน/.test(message);
    if (!validationError) console.error("Debts API request failed", { requestId, action, code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อรายการทวงหนี้กับ Google Sheets/Drive ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
