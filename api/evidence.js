import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const ALLOWED_EVIDENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const transactionId = String(req.query?.id || "").trim();
  if (!transactionId || transactionId.length > 80) {
    return res.status(400).json({ error: "ไม่พบรหัสรายการ" });
  }

  const requestId = randomUUID();
  try {
    const evidence = await callAppsScript({
      action: "getTransactionEvidence",
      requestId,
      transactionId,
    });
    const mimeType = String(evidence?.mimeType || "").toLowerCase();
    const base64 = String(evidence?.base64 || "");
    if (!ALLOWED_EVIDENCE_TYPES.has(mimeType) || !base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error("Evidence response was invalid");
    }

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 3 * 1024 * 1024) throw new Error("Evidence is too large");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(bytes);
  } catch (error) {
    console.error("Evidence preview request failed", {
      requestId,
      code: String(error?.code || "UPSTREAM_ERROR"),
    });
    return res.status(502).json({ error: "โหลดหลักฐานจาก Google Drive ไม่สำเร็จ" });
  }
}
