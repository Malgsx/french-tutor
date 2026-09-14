import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { createApp } from "../server/app";
import {
  defaultLook,
  looksEqual,
  matchingPreset,
  normalizeLook,
  parseLook,
  presets,
} from "../src/avatar-look";

test("normalizeLook keeps a valid look and fills missing or invalid fields", () => {
  const sunrise = presets.find((preset) => preset.id === "sunrise")!.look;
  assert.deepEqual(normalizeLook(sunrise), {
    ...sunrise,
    hair: sunrise.hair.toLowerCase(),
    skin: sunrise.skin.toLowerCase(),
    eyes: sunrise.eyes.toLowerCase(),
    jacket: sunrise.jacket.toLowerCase(),
    coat: sunrise.coat.toLowerCase(),
    accent: sunrise.accent.toLowerCase(),
  });
  assert.deepEqual(normalizeLook(undefined), defaultLook);
  assert.deepEqual(
    normalizeLook({
      hairStyle: "mullet",
      outfit: "armor",
      hair: "purple",
      skin: "#fff",
      eyes: "#4A90C8",
    }),
    {
      ...defaultLook,
      eyes: "#4a90c8",
    },
  );
  assert.equal(looksEqual(defaultLook, { ...defaultLook }), true);
  assert.equal(looksEqual(defaultLook, sunrise), false);
  assert.equal(matchingPreset(defaultLook), "classic");
  assert.equal(matchingPreset(sunrise), "sunrise");
  assert.deepEqual(parseLook(sunrise), normalizeLook(sunrise));
  assert.equal(parseLook({ ...sunrise, extra: true }), null);
  assert.equal(parseLook({ ...sunrise, hair: "#fff" }), null);
});

test("store upgrades older state files with the classic look and reset restores it", () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-avatar-store-"));
  try {
    const file = join(dir, "state.json");
    writeFileSync(
      file,
      JSON.stringify({
        settings: {
          age: "14–17",
          support: "Balanced",
          difficulty: "Short phrases",
          retainTranscripts: false,
        },
        progress: { practiced: [], attempts: 0 },
        plan: null,
        transcripts: [],
        sessions: [],
      }),
    );
    const store = new Store(file);
    assert.deepEqual(store.state.avatar, defaultLook);
    store.state.avatar = normalizeLook(presets[1].look);
    store.save();
    assert.deepEqual(
      new Store(file).state.avatar,
      normalizeLook(presets[1].look),
    );
    store.reset();
    assert.deepEqual(store.state.avatar, defaultLook);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("avatar look is returned on state and saved through a dedicated write", async () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-avatar-api-"));
  const store = new Store(join(dir, "state.json"));
  const app = createApp(store, {
    origin: "http://localhost:3030",
    key: "FAKE-test-only-key",
    live: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
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
    const state = await (await fetch(base + "state")).json();
    assert.deepEqual(state.avatar, defaultLook);
    const look = normalizeLook(
      presets.find((preset) => preset.id === "midnight")!.look,
    );
    assert.equal((await post("avatar", look)).status, 200);
    assert.deepEqual(store.state.avatar, look);
    assert.deepEqual(
      ((await (await fetch(base + "state")).json()) as { avatar: unknown })
        .avatar,
      look,
    );
    assert.equal((await post("avatar", look, "https://evil.test")).status, 403);
    assert.equal(
      (await post("avatar", { ...look, hairStyle: "mullet" })).status,
      400,
    );
    assert.equal((await post("avatar", { ...look, hair: "#fff" })).status, 400);
    assert.deepEqual(store.state.avatar, look);
    assert.equal((await post("reset", {})).status, 200);
    assert.deepEqual(store.state.avatar, defaultLook);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true });
  }
});
