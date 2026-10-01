import { getIntegrationState } from "../../lib/server/config.js";
import { hasValidSession, setNoStore } from "../../lib/server/session.js";

export default function handler(req, res) {
  setNoStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const state = getIntegrationState();
  const secret = process.env.SESSION_SECRET || "";
  const passwordReady = (process.env.APP_PASSWORD || "").length >= 12;
  const secretReady = secret.length >= 32;
  const configured = state.configured && passwordReady && secretReady;

  return res.status(200).json({
    configured,
    partiallyConfigured: state.partiallyConfigured || (state.configured && !configured),
    missing: state.missing,
    invalid: state.invalid,
    authenticated: configured && hasValidSession(req, secret),
  });
}
