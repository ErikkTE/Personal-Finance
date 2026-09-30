import { clearSessionCookie, isSameOriginRequest, setNoStore } from "../../lib/server/session.js";

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: "คำขอไม่ถูกต้อง" });

  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ ok: true });
}
