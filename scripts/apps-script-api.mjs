#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { getAccessToken } from "./apps-script-oauth.mjs";

const SCRIPT_ID = "1iZ7HCjcdTNk3V4ebtF3_56NM54q5-f1L3Lab_hfHG3uvwt_D4O2xZiJ0";
const API_ROOT = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}`;
const [command = "help", ...args] = process.argv.slice(2);
const apply = args.includes("--apply");

function help() {
  process.stdout.write([
    "Apps Script API helper",
    "",
    "  npm run apps-script:inspect",
    "  npm run apps-script:sync [-- --apply]",
    "  npm run apps-script:deploy -- <existing-deployment-id> [--apply]",
    "",
    "Writes require --apply and a local OAuth session with script.projects and script.deployments scopes.",
  ].join("\n") + "\n");
}

function apiErrorMessage(payload, status) {
  return payload?.error?.message || payload?.message || `Apps Script API request failed (${status})`;
}

async function request(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();

  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Apps Script API returned unreadable content (${response.status})`);
  }
  if (!response.ok) throw new Error(apiErrorMessage(payload, response.status));
  return payload;
}

async function getLocalCode() {
  return readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
}

async function getRemoteCode() {
  const content = await request("/content");
  const matches = (content.files || []).filter(file => file.type === "SERVER_JS");
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one remote server-side JavaScript file; found ${matches.length}. No changes were made.`);
  }
  return { content, codeFile: matches[0] };
}

async function syncCode() {
  const localSource = await getLocalCode();
  const { content, codeFile } = await getRemoteCode();
  const changed = codeFile.source !== localSource;
  process.stdout.write(`Remote project files: ${(content.files || []).map(file => `${file.name}.${file.type === "SERVER_JS" ? "gs" : file.type === "HTML" ? "html" : file.type.toLowerCase()}`).join(", ")}\n`);
  process.stdout.write(`${codeFile.name}.gs: ${changed ? "different from local source" : "already matches local source"}\n`);

  if (!changed) return { changed: false };
  if (!apply) {
    process.stdout.write("Dry run only. Add --apply to update Apps Script HEAD; its HEAD deployment always follows the saved source, while existing versioned deployments stay unchanged. Other remote files and the live manifest will be preserved.\n");
    return { changed: true };
  }

  const files = (content.files || []).map(file => ({
    name: file.name,
    type: file.type,
    source: file === codeFile ? localSource : file.source,
  }));
  await request("/content", { method: "PUT", body: { files } });

  const verified = await getRemoteCode();
  if (verified.codeFile.source !== localSource) throw new Error("Apps Script source update could not be verified.");
  process.stdout.write("Code.gs updated and verified in Apps Script HEAD. The HEAD deployment now uses this source; existing versioned deployments remain unchanged.\n");
  return { changed: true };
}

function webAppEntry(deployment) {
  return (deployment.entryPoints || []).find(entry => entry.entryPointType === "WEB_APP" && entry.webApp?.url);
}

function stableWebAppAddress(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

async function inspect() {
  const content = await request("/content");
  const deployments = await request("/deployments?pageSize=50");
  process.stdout.write(`Apps Script project: ${SCRIPT_ID}\n`);
  process.stdout.write(`Project files: ${(content.files || []).map(file => `${file.name} (${file.type})`).join(", ")}\n`);
  for (const deployment of deployments.deployments || []) {
    const webApp = webAppEntry(deployment);
    const version = Number.isInteger(deployment.deploymentConfig?.versionNumber)
      ? deployment.deploymentConfig.versionNumber
      : "HEAD (auto-updating; read-only)";
    process.stdout.write([
      `deploymentId=${deployment.deploymentId}`,
      `version=${version}`,
      `description=${JSON.stringify(deployment.deploymentConfig?.description || "")}`,
      `type=${webApp ? "WEB_APP" : "other"}`,
      ...(webApp ? [`url=${webApp.webApp.url}`] : []),
    ].join(" ") + "\n");
  }
}

async function deploy() {
  const deploymentId = args.find(value => !value.startsWith("--"));
  if (!deploymentId) throw new Error("Pass the ID of an existing web-app deployment from apps-script:inspect.");

  const target = await request(`/deployments/${encodeURIComponent(deploymentId)}`);
  const currentWebApp = webAppEntry(target);
  if (!currentWebApp) throw new Error("The selected deployment is not a web app. No changes were made.");
  if (!Number.isInteger(target.deploymentConfig?.versionNumber)) {
    throw new Error("The selected deployment is the Apps Script HEAD deployment and is read-only. Choose a versioned deployment. No changes were made.");
  }
  process.stdout.write(`Target deployment ${deploymentId}, current version ${target.deploymentConfig?.versionNumber ?? "unknown"}\n`);
  process.stdout.write(`Existing URL: ${currentWebApp.webApp.url}\n`);
  process.stdout.write(`Code.gs ${apply ? "will be synced" : "will be checked"}; this deployment ID will be updated in place.\n`);

  if (!apply) {
    const { changed } = await syncCode();
    process.stdout.write(`Dry run only. No version or deployment was created. Source change: ${changed ? "yes" : "no"}.\n`);
    return;
  }

  await syncCode();
  const version = await request("/versions", {
    method: "POST",
    body: { description: "Debt collection improvements" },
  });
  if (!Number.isInteger(version.versionNumber)) throw new Error("Apps Script did not return a version number; deployment was not updated.");

  await request(`/deployments/${encodeURIComponent(deploymentId)}`, {
    method: "PUT",
    body: {
      deploymentConfig: {
        ...target.deploymentConfig,
        versionNumber: version.versionNumber,
      },
    },
  });
  const verified = await request(`/deployments/${encodeURIComponent(deploymentId)}`);
  const verifiedWebApp = webAppEntry(verified);
  if (
    verified.deploymentConfig?.versionNumber !== version.versionNumber ||
    stableWebAppAddress(verifiedWebApp?.webApp.url) !== stableWebAppAddress(currentWebApp.webApp.url)
  ) {
    throw new Error("Deployment verification failed. Check the Apps Script deployment before using the app.");
  }
  process.stdout.write(`Deployment updated and verified at version ${version.versionNumber}. Existing /exec URL preserved.\n`);
}

try {
  if (command === "help" || command === "--help" || command === "-h") help();
  else if (command === "inspect") await inspect();
  else if (command === "sync") await syncCode();
  else if (command === "deploy") await deploy();
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`Apps Script API: ${error instanceof Error ? error.message : "operation failed"}\n`);
  process.exitCode = 1;
}
