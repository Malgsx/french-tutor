import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app";
import { Store } from "../server/store";
import { defaults } from "../server/lesson";
import { defaultLook } from "../src/avatar-look";

test("private portal protects pages, learning data and paid calls; exact collaborator and origin required", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-portal-"));
  const store = new Store(join(dir, "state.json"));
  const origin = "https://private-portal.example";
  let calls = 0;
  const app = createApp(store, {
    origin,
    portal: true,
    live: true,
    key: "FAKE-test-only-key",
    request: (async () => {
      calls++;
      return Response.json({
        session: { id: "live_fake" },
        transport: { sdp: "fake-answer" },
      });
    }) as typeof fetch,
  });
  app.get("/", (_req, res) => res.send("private page"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const owner = "amp-user=yes, workspace-member=no, collaborator=yes";
  const headers = (claim: string) => ({ "X-Amp-Authenticated": claim });
  const post = (path: string, body: unknown, claim = owner, from = origin) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        ...headers(claim),
        Origin: from,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    assert.deepEqual(await (await fetch(base + "/healthz")).json(), {
      ok: true,
    });
    for (const claim of [
      "",
      "amp-user=no,workspace-member=no,collaborator=no",
      "amp-user=yes,workspace-member=yes,collaborator=no",
      "not-collaborator=yes",
      "collaborator=yes-please",
      "collaborator=yes,collaborator=no",
    ]) {
      for (const path of ["/", "/api/state", "/api/plan", "/api/transcripts"])
        assert.equal(
          (await fetch(base + path, { headers: headers(claim) })).status,
          403,
        );
      assert.equal(
        (await post("/api/settings", { ...defaults, age: "11–13" }, claim))
          .status,
        403,
      );
      assert.equal((await post("/api/avatar", defaultLook, claim)).status, 403);
      assert.equal(
        (
          await post(
            "/api/session",
            { approved: true, sdp: "fake-sdp-offer" },
            claim,
          )
        ).status,
        403,
      );
    }
    assert.equal(calls, 0);
    assert.deepEqual(store.state.settings, defaults);
    const state = await fetch(base + "/api/state", { headers: headers(owner) });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).liveAvailable, true);
    assert.equal(
      await (await fetch(base + "/", { headers: headers(owner) })).text(),
      "private page",
    );
    assert.equal(
      (await post("/api/settings", defaults, owner, "https://evil.example"))
        .status,
      403,
    );
    assert.equal(
      (await post("/api/session", { approved: false, sdp: "fake-sdp-offer" }))
        .status,
      400,
    );
    assert.equal(calls, 0);
    const saved = { ...defaults, support: "Mostly French" };
    assert.equal((await post("/api/settings", saved)).status, 200);
    assert.deepEqual(new Store(join(dir, "state.json")).state.settings, saved);
    const live = await post("/api/session", {
      approved: true,
      sdp: "fake-sdp-offer",
    });
    assert.equal(live.status, 201);
    assert.deepEqual(await live.json(), {
      session: { id: "live_fake" },
      transport: { sdp: "fake-answer" },
    });
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("orb entry point fails closed without Amp's HTTPS public origin", () => {
  for (const url of ["", "http://localhost:3030"]) {
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          AMP_ORB: "1",
          PUBLIC_URL: url,
          OPENAI_API_KEY: "",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Orb startup requires the HTTPS PUBLIC_URL/);
  }
});
