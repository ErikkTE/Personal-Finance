import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { APP_PASSWORD_MIN_LENGTH, getIntegrationState } from "./config.js";

const COOKIE_NAME = "pf_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return ["", ""];
      return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }).filter(([key]) => key)
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function checkAppPassword(candidate, expected) {
  const candidateHash = createHash("sha256").update(String(candidate)).digest("hex");
  const expectedHash = createHash("sha256").update(String(expected)).digest("hex");
  return safeEqual(candidateHash, expectedHash);
}

export function createSessionCookie(secret) {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: randomBytes(16).toString("hex"),
  })).toString("base64url");
  const value = `${payload}.${signature(payload, secret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function hasValidSession(req, secret) {
  const value = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!value) return false;

  const separator = value.lastIndexOf(".");
  if (separator < 0) return false;
  const payload = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  if (!safeEqual(signature(payload, secret), suppliedSignature)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return false;

  try {
    const url = new URL(origin);
    const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : null;
    return url.host.toLowerCase() === String(host).toLowerCase() && (!expectedProtocol || url.protocol === expectedProtocol);
  } catch {
    return false;
  }
}

export function requireSession(req, res) {
  const state = getIntegrationState();
  if (!state.configured) {
    res.status(503).json({ error: "การเชื่อมต่อยังตั้งค่าไม่ครบ" });
    return false;
  }

  const secret = process.env.SESSION_SECRET;
  if (secret.length < 32 || process.env.APP_PASSWORD.length < APP_PASSWORD_MIN_LENGTH || !hasValidSession(req, secret)) {
    res.status(401).json({ error: "กรุณาเข้าสู่ระบบใหม่" });
    return false;
  }

  return true;
}

export function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}
