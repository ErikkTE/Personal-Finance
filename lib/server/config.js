const requiredVariables = [
  "APP_PASSWORD",
  "SESSION_SECRET",
  "GOOGLE_APPS_SCRIPT_URL",
  "GOOGLE_APPS_SCRIPT_SECRET",
];

export function getIntegrationState() {
  const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
  const configuredCount = requiredVariables.length - missing.length;
  const validationErrors = [];

  if (!missing.length) {
    try {
      const endpoint = new URL(process.env.GOOGLE_APPS_SCRIPT_URL);
      if (endpoint.protocol !== "https:" || endpoint.hostname !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
        validationErrors.push("GOOGLE_APPS_SCRIPT_URL must be a deployed Apps Script /exec URL.");
      }
    } catch {
      validationErrors.push("GOOGLE_APPS_SCRIPT_URL is invalid.");
    }
    if (process.env.SESSION_SECRET.length < 32) validationErrors.push("SESSION_SECRET must be at least 32 characters.");
    if (process.env.APP_PASSWORD.length < 12) validationErrors.push("APP_PASSWORD must be at least 12 characters.");
    if (process.env.GOOGLE_APPS_SCRIPT_SECRET.length < 32) validationErrors.push("GOOGLE_APPS_SCRIPT_SECRET must be at least 32 characters.");
  }

  const configured = missing.length === 0 && validationErrors.length === 0;

  return {
    configured,
    partiallyConfigured: configuredCount > 0 && (missing.length > 0 || validationErrors.length > 0),
    missing,
    invalid: validationErrors.length > 0,
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
