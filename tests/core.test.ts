import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import {
  defaults,
  evaluate,
  extractWords,
  lessonContext,
} from "../server/lesson";
import { commentary, replyIdentities, transcript } from "../src/protocol";
import { extractDocument } from "../server/upload";

test("asymmetric vocabulary checks, gentle correction and school pair parsing", () => {
  assert.equal(evaluate(" BONJOUR! ", 0).correct, true);
  assert.equal(evaluate("bonjour", 1).correct, false);
  assert.match(evaluate("bonjour", 1).text, /merci/);
  assert.equal(evaluate("au revoir", 2).correct, true);
  const words = extractWords(
    "Objectives: food\nune pomme = an apple\nun livre = a book\nnot a pair",
  );
  assert.deepEqual(
    words.map((w) => [w.fr, w.en]),
    [
      ["une pomme", "an apple"],
      ["un livre", "a book"],
    ],
  );
  assert.equal(evaluate("une pomme", 0, words).correct, true);
  assert.equal(evaluate("un livre", 0, words).correct, false);
  assert.match(lessonContext(defaults, 0, "encore"), /Repeat this slowly/);
});

test("Live transcript contract preserves spacing, overlaps and delegation IDs", () => {
  const first = transcript({
    type: "session.input_transcript.delta",
    delta: "bon",
    start_ms: 100,
    end_ms: 300,
  });
  const second = transcript({
    type: "session.input_transcript.delta",
    delta: "jour !",
    start_ms: 300,
    end_ms: 450,
  });
  const other = transcript({
    type: "session.output_transcript.delta",
    delta: "Oui",
    start_ms: 200,
    end_ms: 400,
  });
  assert.equal(first!.text + second!.text, "bonjour !");
  assert.equal(other!.start_ms, 200);
  assert.equal(other!.role, "assistant");
  assert.deepEqual(
    replyIdentities({
      type: "session.output_transcript.delta",
      item_id: "item_new",
      response_id: "resp_new",
    }),
    ["item_new", "resp_new"],
  );
  assert.equal(transcript({ type: "session.delegation.created" }), null);
  assert.equal(
    commentary("Ready", "item_opaque_123").delegation_id,
    "item_opaque_123",
  );
  assert.equal(commentary("Ready").delegation_id, null);
});

test("minimal persistence, private file permissions, retention bound and full reset", () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-store-"));
  try {
    const file = join(dir, "state.json");
    const store = new Store(file);
    store.record([{ role: "user", text: "not retained" }]);
    store.save();
    assert.equal(readFileSync(file, "utf8").includes("not retained"), false);
    store.state.settings.retainTranscripts = true;
    store.record(
      Array.from({ length: 110 }, (_, i) => ({
        role: "user",
        text: `fragment ${i}`,
      })),
    );
    assert.equal(store.state.transcripts.length, 100);
    assert.equal(store.state.transcripts[0].text, "fragment 10");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(new Store(file).state.transcripts.length, 100);
    store.reset();
    assert.deepEqual(new Store(file).state, store.fresh());
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("password-free broker preserves settings, origin checks, consent and rate limits without paid network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-api-"));
  const store = new Store(join(dir, "state.json"));
  const calls: { url: string; body: Record<string, unknown>; auth: string }[] =
    [];
  const app = createApp(store, {
    origin: "http://localhost:3030",
    key: "FAKE-test-only-key",
    live: true,
    request: (async (url, options) => {
      calls.push({
        url: String(url),
        body: JSON.parse(options!.body as string),
        auth: (options!.headers as Record<string, string>).Authorization,
      });
      return Response.json(
        {
          session: { id: "live_fake" },
          transport: { sdp: "fake-answer" },
          secret: "must-not-return",
        },
        { status: 201 },
      );
    }) as typeof fetch,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/`;
  const post = (
    path: string,
    body: unknown,
    origin = "http://localhost:3030",
  ) =>
    fetch(base + path, {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post("session", { sdp: "fake-sdp-offer", approved: false }))
        .status,
      400,
    );
    assert.equal(
      (await post("settings", defaults, "https://evil.test")).status,
      403,
    );
    assert.equal(
      (
        await post(
          "session",
          { sdp: "fake-sdp-offer", approved: true },
          "https://evil.test",
        )
      ).status,
      403,
    );
    assert.equal(calls.length, 0);
    assert.equal((await fetch(base + "plan")).status, 200);
    assert.equal((await fetch(base + "transcripts")).status, 200);
    assert.equal((await post("parent/unlock", {})).status, 404);
    assert.equal(
      (
        await post("settings", {
          ...defaults,
          retainTranscripts: true,
          unexpected: "x",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("plan", {
          title: "School café",
          text: "une pomme = an apple\nun livre = a book",
          words: [],
        })
      ).status,
      200,
    );
    assert.equal(store.state.plan!.words[0].fr, "une pomme");
    assert.equal(
      (await post("lesson", { action: "answer", index: 0, text: "une pomme" }))
        .status,
      200,
    );
    assert.deepEqual(store.state.progress.practiced, ["une pomme"]);
    await post("lesson", { action: "answer", index: 0, text: "une pomme" });
    assert.deepEqual(store.state.progress.practiced, ["une pomme"]);
    assert.equal(
      (await post("lesson", { action: "delegate", index: 99 })).status,
      400,
    );
    assert.equal(
      (
        await post("session", {
          sdp: "fake-sdp-offer",
          approved: true,
          model: "override",
        })
      ).status,
      400,
    );
    const liveResponse = await post("session", {
      sdp: "fake-sdp-offer",
      approved: true,
    });
    assert.equal(liveResponse.status, 201);
    assert.deepEqual(await liveResponse.json(), {
      session: { id: "live_fake" },
      transport: { sdp: "fake-answer" },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.openai.com/v1/live/sessions");
    assert.equal(calls[0].auth, "Bearer FAKE-test-only-key");
    const config = calls[0].body.session as {
      model: string;
      store: boolean;
      delegation: object;
      input: unknown[];
    };
    assert.equal(config.model, "gpt-live-1");
    assert.equal(config.store, false);
    assert.deepEqual(config.delegation, { type: "client" });
    assert.equal(config.input.length, 1);
    assert.equal(
      (await post("session", { sdp: "fake-sdp-offer", approved: true })).status,
      429,
    );
    const settings = {
      age: "11–13",
      support: "Mostly French",
      difficulty: "Conversation",
      retainTranscripts: true,
    };
    assert.equal((await post("settings", settings)).status, 200);
    assert.deepEqual(
      new Store(join(dir, "state.json")).state.settings,
      settings,
    );
    await post("transcripts", [{ role: "user", text: "retain this" }]);
    assert.equal(store.state.transcripts.length, 1);
    await post("settings", defaults);
    assert.equal(store.state.transcripts.length, 0);
    await post("plan", { remove: true });
    assert.equal(store.state.plan, null);
    await post("reset", {});
    assert.deepEqual(store.state, store.fresh());
    assert.equal((await post("settings", defaults)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true });
  }
});

test("document extraction: UTF-8 text, invalid PDF and size limits", async () => {
  assert.equal(
    await extractDocument(Buffer.from("une pomme = an apple\n"), "txt"),
    "une pomme = an apple",
  );
  await assert.rejects(extractDocument(Buffer.from("not a pdf"), "pdf"));
  await assert.rejects(
    extractDocument(Buffer.alloc(5 * 1024 * 1024 + 1), "txt"),
  );
});
