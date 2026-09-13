// Explicit macOS startup test. Port 3030 must be free; never touches family data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import { chromium, type Browser } from "playwright";
import { createApp } from "../server/app";
import { Store } from "../server/store";

const dir = mkdtempSync(join(tmpdir(), "miette-startup-"));
const origin = "http://localhost:3030";

async function launch(name: string) {
  const child = spawn(
    process.execPath,
    [
      "desktop/start.mjs",
      `--user-data-dir=${join(dir, name)}`,
      "--remote-debugging-port=0",
    ],
    {
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        LIVE_ENABLED: "false",
        DATA_FILE: join(dir, "owned-state.json"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let browser: Browser | undefined;
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
  return {
    output: () => output,
    exited,
    async connect() {
      const deadline = Date.now() + 25000;
      let endpoint;
      while (
        !(endpoint = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1])
      ) {
        assert.equal(
          child.exitCode,
          null,
          "Launcher exited before opening Electron",
        );
        assert.ok(Date.now() < deadline, "Electron startup timed out");
        await delay(100);
      }
      browser = await chromium.connectOverCDP(endpoint);
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? (await context.waitForEvent("page"));
      await page.waitForSelector("#start");
      assert.equal(new URL(page.url()).origin, origin);
      return { browser, page };
    },
    async stop() {
      await browser?.close();
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
      await exited;
    },
  };
}

try {
  await assert.rejects(
    fetch(`${origin}/api/state`),
    "Stop the existing broker before this test",
  );
  const owned = await launch("owned");
  try {
    const { browser, page } = await owned.connect();
    const state = await (await fetch(`${origin}/api/state`)).json();
    assert.equal(state.liveAvailable, false);
    await page.click("#start");
    await page.fill("#answer", "bonjour");
    await page.click("#send");
    await page.waitForFunction(
      () =>
        document.querySelector("#avatar")?.getAttribute("data-state") ===
        "success",
    );
    await page.click("#end");
    assert.match(owned.output(), /Starting the local Miette server/);
    // Quit the actual Electron browser, not merely the automation connection.
    const session = await browser.newBrowserCDPSession();
    // Electron may exit before acknowledging this CDP command.
    void session.send("Browser.close").catch(() => {});
    const code = await Promise.race([
      owned.exited,
      delay(10000).then(() => "timeout"),
    ]);
    assert.equal(code, 0, "Quitting Electron must stop its owned broker");
    await assert.rejects(fetch(`${origin}/api/state`));
  } finally {
    await owned.stop();
  }

  const app = createApp(new Store(join(dir, "reused-state.json")), {
    origin,
    live: true,
    key: "FAKE-test-only-key",
  });
  app.use(express.static(resolve("dist")));
  const server = app.listen(3030, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const reused = await launch("reused");
    try {
      await reused.connect();
      assert.match(reused.output(), /Using the running Miette server/);
      assert.equal(
        (await (await fetch(`${origin}/api/state`)).json()).liveAvailable,
        true,
      );
    } finally {
      await reused.stop();
    }
    assert.equal((await fetch(`${origin}/api/state`)).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const other = express().get("/api/state", (_req, res) =>
    res.json({ unrelated: true }),
  );
  const unrelated = other.listen(3030, "127.0.0.1");
  await new Promise<void>((resolve) => unrelated.once("listening", resolve));
  try {
    const conflict = await launch("conflict");
    try {
      assert.equal(await conflict.exited, 1);
      assert.match(conflict.output(), /occupied by a different service/);
      assert.doesNotMatch(conflict.output(), /Opening Miette/);
      assert.deepEqual(await (await fetch(`${origin}/api/state`)).json(), {
        unrelated: true,
      });
    } finally {
      await conflict.stop();
    }
  } finally {
    await new Promise<void>((resolve) => unrelated.close(() => resolve()));
  }
  console.log(
    "PASS startup: cold start → real Electron demo → Quit cleans up; reused Live config/server preserved; unrelated port left untouched. No paid calls.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
