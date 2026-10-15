import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/categories.js";
import { createSessionCookie } from "../lib/server/session.js";

const SESSION_SECRET = "test-session-secret-1234567890123456";
const APPS_SCRIPT_SECRET = "test-apps-script-secret-123456789012345";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/test-deployment/exec";
const envKeys = ["APP_PASSWORD", "SESSION_SECRET", "GOOGLE_APPS_SCRIPT_URL", "GOOGLE_APPS_SCRIPT_SECRET"];

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest(method, body) {
  return {
    method,
    body,
    headers: {
      origin: "https://finance.example",
      host: "finance.example",
      cookie: createSessionCookie(SESSION_SECRET).split(";")[0],
    },
  };
}

async function withApiConfig(run) {
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    APP_PASSWORD: "123",
    SESSION_SECRET,
    GOOGLE_APPS_SCRIPT_URL: APPS_SCRIPT_URL,
    GOOGLE_APPS_SCRIPT_SECRET: APPS_SCRIPT_SECRET,
  });

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = previousFetch;
  }
}

test("GET /api/categories returns custom categories from Apps Script", async () => {
  await withApiConfig(async () => {
    const categories = [{ scope: "recurringExpenses", name: "ดูแลสัตว์เลี้ยง", createdAt: "2026-10-15T00:00:00.000Z" }];
    let requestBody;
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), APPS_SCRIPT_URL);
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { categories } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = createResponse();
    await handler(createRequest("GET"), response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { categories });
    assert.equal(requestBody.action, "listCategories");
    assert.equal(requestBody.secret, APPS_SCRIPT_SECRET);
  });
});

test("POST /api/categories saves a validated category with its scope", async () => {
  await withApiConfig(async () => {
    const category = { scope: "subscriptions", name: "แอปอ่านหนังสือ", createdAt: "2026-10-15T00:00:00.000Z" };
    let requestBody;
    globalThis.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { category } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = createResponse();
    await handler(createRequest("POST", { category: { scope: category.scope, name: category.name } }), response);

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.body, { category });
    assert.equal(requestBody.action, "saveCategory");
    assert.deepEqual(requestBody.category, { scope: category.scope, name: category.name });
  });
});

test("POST /api/categories rejects unsafe names before reaching Apps Script", async () => {
  await withApiConfig(async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("Apps Script should not be called for invalid input");
    };

    const response = createResponse();
    await handler(createRequest("POST", { category: { scope: "transactions", name: "=IMPORTXML()" } }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(fetchCalled, false);
  });
});
