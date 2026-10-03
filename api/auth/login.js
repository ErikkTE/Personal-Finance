import { APP_PASSWORD_MIN_LENGTH, getIntegrationState } from "../../lib/server/config.js";
import { checkAppPassword, createSessionCookie, isSameOriginRequest, setNoStore } from "../../lib/server/session.js";

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });

  const state = getIntegrationState();
  const password = process.env.APP_PASSWORD || "";
  const secret = process.env.SESSION_SECRET || "";
  if (!state.configured || password.length < APP_PASSWORD_MIN_LENGTH || secret.length < 32) {
    return res.status(503).json({ error: "การเชื่อมต่อยังตั้งค่าไม่ครบ" });
  }

  const candidate = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkAppPassword(candidate, password)) {
    return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  }

  res.setHeader("Set-Cookie", createSessionCookie(secret));
  return res.status(200).json({ ok: true });
}
