import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import {
  checkKey,
  configuredAccess,
  describeRefusal,
  LIVE_SESSIONS_URL,
} from "../server/live-access";
import { reuseNotice } from "../desktop/reuse-notice.mjs";

const unauthorized = () =>
  Response.json(
    {
      error: {
        message: "Incorrect API key provided: sk-abc***xyz.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    },
    { status: 401 },
  );

test("configuration and refusal reasons tell a parent exactly what to fix", () => {
  assert.equal(configuredAccess(true, "sk-x").available, true);
  assert.match(configuredAccess(false, "sk-x").reason ?? "", /LIVE_ENABLED=true/);
  assert.match(configuredAccess(true, undefined).reason ?? "", /OPENAI_API_KEY is missing/);
  assert.match(describeRefusal(401, "bad key"), /OPENAI_API_KEY \(401\).*bad key.*start it again/s);
  assert.match(describeRefusal(401, "Missing scopes: model.request"), /missing scope.*Model capabilities/s);
  assert.match(describeRefusal(403), /GPT-Live \(403\)/);
  assert.match(describeRefusal(429), /quota/);
  assert.match(describeRefusal(500), /refused session creation \(500\)/);
});

const missingScope = () =>
  Response.json(
    {
      error: {
        message:
          "You have insufficient permissions for this operation. Missing scopes: model.request.",
        type: "invalid_request_error",
        code: "missing_scope",
      },
    },
    { status: 401 },
  );

test("checkKey probes the Live endpoint itself: bad key, under-scoped key, good key, offline", async () => {
  const seen: { url: string; method?: string; body?: unknown; auth: string }[] =
    [];
  const stub = (reply: () => Response) =>
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: String(url),
        method: init?.method,
        body: init?.body,
        auth: (init!.headers as Record<string, string>).Authorization,
      });
      return reply();
    }) as typeof fetch;
  const bad = await checkKey("sk-bad ", stub(unauthorized));
  assert.equal(bad.available, false);
  assert.match(bad.reason ?? "", /OPENAI_API_KEY/);
  assert.match(bad.reason ?? "", /Incorrect API key/);
  // An empty body can never create a billable session: model and SDP are required.
  assert.deepEqual(seen[0], {
    url: LIVE_SESSIONS_URL,
    method: "POST",
    body: "{}",
    auth: "Bearer sk-bad ",
  });
  const scoped = await checkKey("sk-restricted", stub(missingScope));
  assert.equal(scoped.available, false);
  assert.match(scoped.reason ?? "", /restricted key/);
  assert.match(scoped.reason ?? "", /Model capabilities/);
  // A valid key fails body validation (400) without creating anything.
  assert.deepEqual(
    await checkKey(
      "sk-good",
      stub(() =>
        Response.json(
          { error: { message: "Missing required parameter: 'session'." } },
          { status: 400 },
        ),
      ),
    ),
    { available: true, reason: null },
  );
  assert.deepEqual(
    await checkKey("sk-offline", (async () => {
      throw new Error("ENOTFOUND");
    }) as typeof fetch),
    { available: true, reason: null },
  );
});

test("a 401 from OpenAI is reported as a key problem and Live stops advertising itself", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-access-"));
  const origin = "http://localhost:3030";
  const post = (base: string, body: unknown) =>
    fetch(base + "/api/session", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const listen = async (app: ReturnType<typeof createApp>) => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    return {
      server,
      base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    };
  };
  try {
    // Preflight: the key is rejected before any learner asks for a microphone.
    const reasons: (string | null)[] = [];
    const rejected = await listen(
      createApp(new Store(join(dir, "a.json")), {
        origin,
        live: true,
        key: "sk-revoked",
        preflight: true,
        request: (async () => unauthorized()) as typeof fetch,
        onAccess: (access) => reasons.push(access.reason),
      }),
    );
    const state = await (await fetch(rejected.base + "/api/state")).json();
    assert.equal(state.liveAvailable, false);
    assert.match(state.liveReason, /OPENAI_API_KEY \(401\)/);
    assert.deepEqual(reasons, [state.liveReason]);
    const refused = await post(rejected.base, { sdp: "fake-sdp-offer", approved: true });
    assert.equal(refused.status, 403);
    assert.match((await refused.json()).error, /OPENAI_API_KEY/);
    rejected.server.close();

    // Preflight passes but the key is revoked before session creation.
    let calls = 0;
    const revoked = await listen(
      createApp(new Store(join(dir, "b.json")), {
        origin,
        live: true,
        key: "sk-was-fine",
        preflight: true,
        request: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          calls++;
          // The probe carries an empty body; the real offer is rejected as revoked.
          return init?.body === "{}"
            ? Response.json({ error: { message: "Missing session" } }, { status: 400 })
            : unauthorized();
        }) as typeof fetch,
      }),
    );
    assert.equal(
      (await (await fetch(revoked.base + "/api/state")).json()).liveAvailable,
      true,
    );
    const failed = await post(revoked.base, { sdp: "fake-sdp-offer", approved: true });
    assert.equal(failed.status, 502);
    const message = (await failed.json()).error;
    assert.match(message, /OPENAI_API_KEY \(401\)/);
    assert.match(message, /Incorrect API key/);
    assert.match(message, /start it again/);
    const after = await (await fetch(revoked.base + "/api/state")).json();
    assert.equal(after.liveAvailable, false);
    assert.equal(after.liveReason, message);
    assert.equal(calls, 2);
    revoked.server.close();

    // Without preflight nothing leaves the machine and the reason still explains the gates.
    const offline = await listen(
      createApp(new Store(join(dir, "c.json")), { origin, live: false }),
    );
    const disabled = await (await fetch(offline.base + "/api/state")).json();
    assert.equal(disabled.liveAvailable, false);
    assert.match(disabled.liveReason, /LIVE_ENABLED=true/);
    offline.server.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("the desktop launcher warns when it reuses a server whose key is stale", () => {
  const reason = "OpenAI rejected the server’s OPENAI_API_KEY (401).";
  assert.deepEqual(reuseNotice({ liveAvailable: true }, {}), [
    "Using the running Miette server; its live configuration is unchanged.",
  ]);
  const lines = reuseNotice(
    { liveAvailable: false, liveReason: reason },
    { LIVE_ENABLED: "true" },
  );
  assert.equal(lines.length, 3);
  assert.match(lines[1], /rejected the server’s OPENAI_API_KEY/);
  assert.match(lines[2], /NOT applied.*Stop the old server/);
  assert.equal(
    reuseNotice({ liveAvailable: false, liveReason: reason }, {}).length,
    2,
  );
});
