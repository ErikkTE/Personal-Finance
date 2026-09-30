import { callAppsScript } from "../../lib/server/apps-script.js";
import { requireSession, setNoStore } from "../../lib/server/session.js";

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!requireSession(req, res)) return;

  try {
    const connection = await callAppsScript({ action: "health" });
    return res.status(200).json({ connected: true, ...connection });
  } catch {
    return res.status(502).json({ connected: false, error: "ติดต่อ Google Apps Script ไม่สำเร็จ" });
  }
}
