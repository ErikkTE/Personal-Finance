#!/usr/bin/env node

import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.join(homedir(), ".config", "personal-finance");
const CLIENT_FILE = process.env.APPS_SCRIPT_OAUTH_CLIENT_FILE || path.join(CONFIG_DIR, "apps-script-oauth-client.json");
const TOKEN_FILE = process.env.APPS_SCRIPT_OAUTH_TOKEN_FILE || path.join(CONFIG_DIR, "apps-script-oauth-token.json");
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.deployments",
];

async function readClient() {
  let payload;
  try {
    payload = JSON.parse(await readFile(CLIENT_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`OAuth client JSON is missing. Save the downloaded Desktop OAuth client file to ${CLIENT_FILE}.`);
    }
    throw new Error(`Could not read OAuth client JSON at ${CLIENT_FILE}.`);
  }
  const client = payload.installed;
  if (!client?.client_id || !client?.token_uri || !client?.auth_uri) {
    throw new Error("OAuth client JSON must be a Google Desktop app client with an installed section.");
  }
  return client;
}

async function readTokenFile() {
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Could not read the saved OAuth token at ${TOKEN_FILE}.`);
  }
}

async function saveToken(token) {
  await mkdir(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(TOKEN_FILE), 0o700);
  await writeFile(TOKEN_FILE, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  await chmod(TOKEN_FILE, 0o600);
}

function tokenExpiry(payload) {
  return Date.now() + Math.max(0, Number(payload.expires_in || 3600)) * 1000;
}

async function exchangeForm(tokenUri, params) {
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Google OAuth returned unreadable content (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Google OAuth failed (${response.status}).`);
  }
  return payload;
}

function callbackPage(message) {
  return `<!doctype html><meta charset="utf-8"><title>Personal Finance</title><p>${message}</p>`;
}

async function login() {
  const client = await readClient();
  const server = createServer();
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the local OAuth callback server.");
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;

  let timer;
  const codePromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("OAuth sign-in timed out after 10 minutes.")), 10 * 60 * 1000);
    server.on("request", (request, response) => {
      const callback = new URL(request.url || "/", redirectUri);
      if (callback.pathname !== "/oauth2callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      if (callback.searchParams.get("state") !== state) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(callbackPage("Sign-in did not match this session. Close this tab and try again."));
        reject(new Error("OAuth state validation failed."));
        return;
      }
      const oauthError = callback.searchParams.get("error");
      if (oauthError) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(callbackPage("Sign-in was not completed. You can close this tab."));
        reject(new Error(`Google OAuth was not completed (${oauthError}).`));
        return;
      }
      const code = callback.searchParams.get("code");
      if (!code) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(callbackPage("Google did not return an authorization code. You can close this tab."));
        reject(new Error("Google OAuth did not return an authorization code."));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(callbackPage("Sign-in complete. You can close this tab and return to the terminal."));
      resolve(code);
    });
  });

  const authorizationUrl = new URL(client.auth_uri);
  authorizationUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: REQUIRED_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  process.stdout.write("Review the app name and Apps Script permissions on Google's authorization page before approving.\n");
  process.stdout.write(`Open this URL in Chrome to continue:\n${authorizationUrl}\n`);

  try {
    const code = await codePromise;
    const tokenPayload = await exchangeForm(client.token_uri, {
      client_id: client.client_id,
      ...(client.client_secret ? { client_secret: client.client_secret } : {}),
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (!tokenPayload.access_token) throw new Error("Google OAuth returned no access token.");

    const previous = await readTokenFile();
    const scope = (tokenPayload.scope || REQUIRED_SCOPES.join(" ")).split(/\s+/).filter(Boolean);
    const missingScopes = REQUIRED_SCOPES.filter(required => !scope.includes(required));
    if (missingScopes.length) throw new Error(`Google did not grant the required Apps Script scopes: ${missingScopes.join(", ")}`);
    await saveToken({
      access_token: tokenPayload.access_token,
      refresh_token: tokenPayload.refresh_token || previous?.refresh_token,
      expires_at: tokenExpiry(tokenPayload),
      token_type: tokenPayload.token_type || "Bearer",
      scope: scope.join(" "),
    });
    process.stdout.write(`OAuth session saved with file permissions 0600 at ${TOKEN_FILE}.\n`);
    if (!tokenPayload.refresh_token && !previous?.refresh_token) {
      process.stdout.write("Google did not return a refresh token. Run login again and approve the consent screen if the session expires.\n");
    }
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

export async function getAccessToken() {
  const envToken = process.env.APPS_SCRIPT_ACCESS_TOKEN;
  if (envToken) return envToken;

  let saved = await readTokenFile();
  if (saved?.access_token && saved.expires_at > Date.now() + 60_000) return saved.access_token;
  if (!saved?.refresh_token) {
    throw new Error(`No saved OAuth session. Run npm run apps-script:auth after saving the Desktop client JSON to ${CLIENT_FILE}.`);
  }

  const client = await readClient();
  const refreshed = await exchangeForm(client.token_uri, {
    client_id: client.client_id,
    ...(client.client_secret ? { client_secret: client.client_secret } : {}),
    refresh_token: saved.refresh_token,
    grant_type: "refresh_token",
  });
  if (!refreshed.access_token) throw new Error("Google OAuth returned no refreshed access token.");
  saved = {
    ...saved,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || saved.refresh_token,
    expires_at: tokenExpiry(refreshed),
    token_type: refreshed.token_type || saved.token_type || "Bearer",
    scope: refreshed.scope || saved.scope,
  };
  await saveToken(saved);
  return saved.access_token;
}

const [command = "login"] = process.argv.slice(2);
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (command === "login") {
    login().catch(error => {
      process.stderr.write(`Apps Script OAuth: ${error instanceof Error ? error.message : "sign-in failed"}\n`);
      process.exitCode = 1;
    });
  } else {
    process.stderr.write(`Unknown command: ${command}. Use login.\n`);
    process.exitCode = 1;
  }
}
