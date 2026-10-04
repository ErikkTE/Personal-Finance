import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeSubscription(input) {
  if (!input || typeof input !== "object") throw new Error("กรุณากรอกข้อมูลบริการให้ครบ");
  const name = String(input.name || "").trim().slice(0, 120);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const cycle = String(input.cycle || "monthly");
  const nextBillingDate = String(input.nextBillingDate || "");
  const paymentMethod = String(input.paymentMethod || "").trim().slice(0, 80);
  if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new Error("กรุณาระบุชื่อบริการและยอดเรียกเก็บที่ถูกต้อง");
  }
  if (!["monthly", "yearly"].includes(cycle) || !validDate(nextBillingDate) || !paymentMethod) {
    throw new Error("รอบเรียกเก็บ วันที่ และช่องทางชำระไม่ถูกต้อง");
  }
  return {
    id: typeof input.id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(input.id) ? input.id : randomUUID(),
    name,
    amount,
    cycle,
    nextBillingDate,
    category: String(input.category || "อื่นๆ").trim().slice(0, 60),
    paymentMethod,
    note: String(input.note || "").trim().slice(0, 500),
    createdAt: new Date().toISOString(),
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
      action = "listSubscriptions";
      const result = await callAppsScript({ action, requestId });
      return res.status(200).json({ subscriptions: result.subscriptions || [] });
    }

    if (req.method === "POST") {
      action = "saveSubscription";
      const subscription = normalizeSubscription(req.body?.subscription);
      const result = await callAppsScript({ action, requestId, subscription });
      return res.status(201).json({ subscription: result.subscription });
    }

    if (req.method === "DELETE") {
      action = "softDeleteSubscription";
      const id = String(req.body?.id || "").trim();
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error("ไม่พบรหัสบริการ");
      const result = await callAppsScript({ action, requestId, id });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ไม่สามารถบันทึกรายการสมัครบริการได้";
    const validationError = /ไม่ถูกต้อง|กรุณา|ไม่พบรหัส/.test(message);
    if (!validationError) console.error("Subscriptions API request failed", { requestId, action, code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(validationError ? 400 : 502).json({
      error: validationError ? message : "เชื่อมต่อข้อมูลสมัครบริการใน Google Sheets ไม่สำเร็จ",
      ...(validationError ? {} : { requestId }),
    });
  }
}
