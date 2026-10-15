import { randomUUID } from "node:crypto";
import { callAppsScript } from "../lib/server/apps-script.js";
import { isSameOriginRequest, requireSession, setNoStore } from "../lib/server/session.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const KINDS = new Set(["loan-photo", "loan-signature", "payment-photo", "payment-signature"]);

export default async function handler(req, res) {
  setNoStore(res);
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });
  if (!requireSession(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debtId = String(req.query?.id || "").trim();
  const kind = String(req.query?.kind || "");
  const index = Number(req.query?.index ?? 0);
  const installmentNumber = Number(req.query?.installmentNumber || 0);
  if (!ID_PATTERN.test(debtId) || !KINDS.has(kind) || !Number.isInteger(index) || index < 0 || index > 2 ||
    ((kind.startsWith("payment-")) && (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 120))) {
    return res.status(400).json({ error: "ไม่พบหลักฐานที่เลือก" });
  }

  try {
    const result = await callAppsScript({
      action: "getDebtEvidence",
      requestId: randomUUID(),
      debtId,
      kind,
      index,
      installmentNumber,
    });
    const data = Buffer.from(String(result?.base64 || ""), "base64");
    const mimeType = String(result?.mimeType || "").toLowerCase();
    if (!data.length || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || data.length > 480_000) {
      throw new Error("Evidence response is not supported.");
    }
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", String(data.length));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(data);
  } catch (error) {
    console.error("Debt evidence request failed", { code: String(error?.code || "UPSTREAM_ERROR") });
    return res.status(502).json({ error: "เปิดภาพหลักฐานใน Google Drive ไม่สำเร็จ" });
  }
}
