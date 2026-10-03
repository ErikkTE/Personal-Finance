import { getServerConfig } from "./config.js";

export async function callAppsScript(payload) {
  const config = getServerConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(config.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: config.appsScriptSecret }),
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) throw new Error("Apps Script returned an error.");

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Apps Script did not return JSON.");
    }

    if (!result?.ok) {
      const error = new Error(result?.error || "Apps Script rejected the request.");
      error.code = String(result?.code || "APPS_SCRIPT_ERROR");
      error.requestId = String(result?.requestId || payload.requestId || "");
      throw error;
    }
    return result.data;
  } finally {
    clearTimeout(timeout);
  }
}
