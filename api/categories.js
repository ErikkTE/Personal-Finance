import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const SCOPES = new Set(["transactions", "recurringExpenses", "subscriptions"]);

function normalizeCategory(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("กรุณาระบุหมวดหมู่");
  const scope = String(input.scope || "");
  const name = String(input.name || "").trim();
  if (!SCOPES.has(scope)) throw new Error("ประเภทหมวดหมู่ไม่ถูกต้อง");
  if (!name || name.length > 40 || /^[=+\-@]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("ชื่อหมวดหมู่ต้องมี 1–40 ตัวอักษร และไม่ขึ้นต้นด้วยอักขระพิเศษ");
  }
  return { scope, name };
}

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;

  const requestId = randomUUID();
  let action = "unknown";
  try {
    if (req.method === "GET") {
      action = "listCategories";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ categories: result.categories || [] });
    }

    if (req.method === "POST") {
      action = "saveCategory";
      const category = normalizeCategory(req.body?.category);
      const result = await callAppsScript({ action, requestId, category });
      return res.status(201).json({ category: result.category });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกหมวดหมู่ได้";
    const validationError = /ไม่ถูกต้อง|กรุณา|ต้องมี/.test(message);
    if (!validationError) console.error("Categories API request failed", { requestId, action, code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อหมวดหมู่ใน Google Sheets ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
