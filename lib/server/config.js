const requiredVariables = [
  "APP_PASSWORD",
  "SESSION_SECRET",
  "GOOGLE_APPS_SCRIPT_URL",
  "GOOGLE_APPS_SCRIPT_SECRET",
];

export function getIntegrationState() {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  const configuredCount = requiredVariables.length - missing.length;
  const invalid = [];

  if (!missing.length) {
    try {
      const endpoint = new URL(process.env.GOOGLE_APPS_SCRIPT_URL);
      if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
        invalid.push("GOOGLE_APPS_SCRIPT_URL");
      }
    } catch {
      invalid.push("GOOGLE_APPS_SCRIPT_URL");
    }
    if (process.env.SESSION_SECRET.length < 32) invalid.push("SESSION_SECRET");
    if (process.env.APP_PASSWORD.length < 12) invalid.push("APP_PASSWORD");
    if (process.env.GOOGLE_APPS_SCRIPT_SECRET.length < 32) invalid.push("GOOGLE_APPS_SCRIPT_SECRET");
  }

  const configured = missing.length === 0 && invalid.length === 0;

  return {
    configured,
    partiallyConfigured: configuredCount > 0 && (missing.length > 0 || invalid.length > 0),
    missing,
    invalid,
  };
}

export function getServerConfig() {
  const state = getIntegrationState();
  if (!state.configured) {
    throw new Error("Google sync is not configured on the server.");
  }

  const endpoint = new URL(process.env.GOOGLE_APPS_SCRIPT_URL);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL must be a deployed Google Apps Script URL.");
  }

  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }

  if (process.env.APP_PASSWORD.length < 12) {
    throw new Error("APP_PASSWORD must be at least 12 characters.");
  }

  if (process.env.GOOGLE_APPS_SCRIPT_SECRET.length < 32) {
    throw new Error("GOOGLE_APPS_SCRIPT_SECRET must be at least 32 characters.");
  }

  return {
    appPassword: process.env.APP_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET,
    appsScriptUrl: endpoint.toString(),
    appsScriptSecret: process.env.GOOGLE_APPS_SCRIPT_SECRET,
  };
}
