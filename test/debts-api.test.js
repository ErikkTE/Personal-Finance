import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/debts.js";
import { createSessionCookie } from "../lib/server/session.js";

const SESSION_SECRET = "test-session-secret-for-debt-api";
const APPS_SCRIPT_SECRET = "test-apps-script-secret-for-debt-api";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/debt-test/exec";
const envKeys = ["APP_PASSWORD", "SESSION_SECRET", "GOOGLE_APPS_SCRIPT_URL", "GOOGLE_APPS_SCRIPT_SECRET"];

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
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

const smallPng = { fileName: "proof.png", mimeType: "image/png", base64: Buffer.from("test-image").toString("base64") };

test("GET /api/debts reads through Apps Script without exposing its shared secret", async () => {
  await withApiConfig(async () => {
    let forwarded;
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), APPS_SCRIPT_URL);
      forwarded = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { debts: [] } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await handler(createRequest("GET"), response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { debts: [] });
    assert.equal(forwarded.action, "listDebts");
    assert.equal(forwarded.secret, APPS_SCRIPT_SECRET);
  });
});

test("POST /api/debts validates and forwards an immutable loan record", async () => {
  await withApiConfig(async () => {
    let forwarded;
    globalThis.fetch = async (_url, options) => {
      forwarded = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { debt: { id: "DEBT-12345678", lender: "ฉัน" } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await handler(createRequest("POST", {
      debt: {
        id: "DEBT-12345678", lender: " ฉัน ", borrower: "ผู้ยืม", loanDate: "2025-10-15",
        principal: 1000, hasInterest: false, interestRate: 0, installments: 3, priority: "normal",
        note: "ข้อตกลง", loanEvidence: [smallPng], lenderSignature: smallPng,
      },
    }), response);

    assert.equal(response.statusCode, 201);
    assert.equal(forwarded.action, "saveDebt");
    assert.equal(forwarded.debt.lender, "ฉัน");
    assert.equal(forwarded.debt.loanEvidence.length, 1);
    assert.equal(forwarded.debt.lenderSignature.mimeType, "image/png");
  });
});

test("PATCH /api/debts requires a repayment photo and signature before forwarding", async () => {
  await withApiConfig(async () => {
    let wasForwarded = false;
    globalThis.fetch = async () => { wasForwarded = true; };
    const response = createResponse();
    await handler(createRequest("PATCH", { id: "DEBT-12345678", installmentNumber: 1, paidAt: "2025-10-15" }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(wasForwarded, false);
  });
});

test("POST /api/debts appends a linked clarification event", async () => {
  await withApiConfig(async () => {
    let forwarded;
    globalThis.fetch = async (_url, options) => {
      forwarded = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { debt: { id: "DEBT-12345678", events: [] } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await handler(createRequest("POST", {
      event: { eventId: "EVENT-12345678", debtId: "DEBT-12345678", type: "clarification", referenceId: "DEBT-12345678", note: "ชี้แจงรายการเดิม" },
    }), response);

    assert.equal(response.statusCode, 201);
    assert.equal(forwarded.action, "recordDebtEvent");
    assert.equal(forwarded.event.referenceId, forwarded.event.debtId);
  });
});

test("POST /api/debts accepts and forwards a cancellation event", async () => {
  await withApiConfig(async () => {
    let forwarded;
    globalThis.fetch = async (_url, options) => {
      forwarded = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { debt: { id: "DEBT-12345678", events: [{ type: "cancellation" }] } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await handler(createRequest("POST", {
      event: { eventId: "EVENT-62345678", debtId: "DEBT-12345678", type: "cancellation", referenceId: "DEBT-12345678", note: "สร้างรายการซ้ำ" },
    }), response);

    assert.equal(response.statusCode, 201);
    assert.equal(forwarded.action, "recordDebtEvent");
    assert.equal(forwarded.event.type, "cancellation");
    assert.equal(forwarded.event.referenceId, forwarded.event.debtId);
  });
});

test("POST /api/debts validates and forwards an auditable correction event", async () => {
  await withApiConfig(async () => {
    let forwarded;
    globalThis.fetch = async (_url, options) => {
      forwarded = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true, data: { debt: { id: "DEBT-12345678", borrower: "ผู้ยืมใหม่" } } }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await handler(createRequest("POST", {
      event: {
        eventId: "EVENT-12345678",
        debtId: "DEBT-12345678",
        type: "correction",
        referenceId: "DEBT-12345678",
        note: "แก้ชื่อผู้ยืม",
        expected: {
          id: "DEBT-87654321",
          lender: "ฉัน", borrower: "ผู้ยืมเดิม", loanDate: "2025-10-01", principal: 1000,
          hasInterest: false, interestRate: 0, installments: 3, priority: "normal", note: "",
        },
        changes: { borrower: "ผู้ยืมใหม่" },
      },
    }), response);

    assert.equal(response.statusCode, 201);
    assert.equal(forwarded.action, "recordDebtEvent");
    assert.equal(forwarded.event.type, "correction");
    assert.equal(forwarded.event.expected.borrower, "ผู้ยืมเดิม");
    assert.equal(forwarded.event.changes.borrower, "ผู้ยืมใหม่");
    assert.equal(Object.hasOwn(forwarded.event.expected, "id"), false);
  });
});

test("POST /api/debts rejects correction attempts to change unapproved fields", async () => {
  await withApiConfig(async () => {
    let wasForwarded = false;
    globalThis.fetch = async () => { wasForwarded = true; };
    const response = createResponse();
    await handler(createRequest("POST", {
      event: {
        eventId: "EVENT-12345678", debtId: "DEBT-12345678", type: "correction", referenceId: "DEBT-12345678", note: "แก้รายการ",
        expected: { lender: "ฉัน", borrower: "ผู้ยืมเดิม", loanDate: "2025-10-01", principal: 1000, hasInterest: false, interestRate: 0, installments: 3, priority: "normal", note: "" },
        changes: { loanEvidence: [] },
      },
    }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(wasForwarded, false);
  });
});

test("POST /api/debts rejects an event linked to a different record", async () => {
  await withApiConfig(async () => {
    let wasForwarded = false;
    globalThis.fetch = async () => { wasForwarded = true; };
    const response = createResponse();
    await handler(createRequest("POST", {
      event: { eventId: "EVENT-12345678", debtId: "DEBT-12345678", type: "clarification", referenceId: "DEBT-87654321", note: "ชี้แจงรายการเดิม" },
    }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(wasForwarded, false);
  });
});

test("PUT and DELETE are not supported for immutable debt records", async () => {
  await withApiConfig(async () => {
    const put = createResponse();
    await handler(createRequest("PUT"), put);
    assert.equal(put.statusCode, 405);
    assert.match(put.headers.Allow, /GET/);
    assert.match(put.headers.Allow, /POST/);
    assert.match(put.headers.Allow, /PATCH/);

    const remove = createResponse();
    await handler(createRequest("DELETE"), remove);
    assert.equal(remove.statusCode, 405);
  });
});
