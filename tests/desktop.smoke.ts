// Explicit smoke test, not part of npm test. Requires a built UI and a display.
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { _electron as electron } from "playwright";
import { createApp } from "../server/app";
import { Store } from "../server/store";

const directory = mkdtempSync(join(tmpdir(), "miette-desktop-"));
const app = createApp(new Store(join(directory, "state.json")), {
  origin: "http://localhost:3030",
  live: false,
});
app.use(express.static(resolve("dist")));
const server = app.listen(3030, "127.0.0.1");
let desktop: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  desktop = await electron.launch({
    args: [
      ".",
      `--user-data-dir=${directory}/profile`,
      "--force-device-scale-factor=2",
      // Linux container smoke only. The shipped app retains Chromium sandboxing.
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ],
    env: { ...process.env, OPENAI_API_KEY: "", LIVE_ENABLED: "false" },
  });
  const page = await desktop.firstWindow();
  await page.waitForSelector("#words button", { state: "attached" });
  assert.equal(
    await page.evaluate(() => typeof window.desktop?.compact),
    "function",
  );
  const security = await desktop.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    // Electron exposes this diagnostic at runtime but omits it from public types.
    const prefs = (
      window.webContents as unknown as {
        getLastWebPreferences(): {
          sandbox: boolean;
          contextIsolation: boolean;
          nodeIntegration: boolean;
        };
      }
    ).getLastWebPreferences();
    return {
      sandbox: prefs.sandbox,
      isolated: prefs.contextIsolation,
      node: prefs.nodeIntegration,
      top: window.isAlwaysOnTop(),
    };
  });
  assert.deepEqual(security, {
    sandbox: true,
    isolated: true,
    node: false,
    top: true,
  });
  await page.click("#start");
  await page.fill("#answer", "bonjour");
  await page.click("#send");
  await page.waitForFunction(
    () =>
      document.querySelector("#avatar")?.getAttribute("data-state") ===
      "success",
  );
  await page.click("#end");
  const artifacts = process.env.ARTIFACT_DIR;
  if (artifacts) {
    mkdirSync(artifacts, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(artifacts, "miette-desktop.png") });
  }
  await page.click("#collapse");
  await page.waitForFunction(() =>
    document.body.classList.contains("avatar-only"),
  );
  const bounds = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getBounds(),
  );
  assert.equal(bounds.width, 230);
  assert.equal(bounds.height, 280);
  assert.equal(
    await page
      .locator("#avatar")
      .evaluate((node) =>
        getComputedStyle(node).getPropertyValue("-webkit-app-region"),
      ),
    "drag",
  );
  if (artifacts)
    await page.screenshot({ path: join(artifacts, "miette-compact.png") });
  await page.click("#expand-avatar");
  await page.waitForFunction(
    () => !document.body.classList.contains("avatar-only"),
  );
  await page.click("#hide");
  assert.equal(
    await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    ),
    false,
  );
  console.log(
    "PASS Electron: isolated renderer, demo answer, 230×280 draggable compact mode, expand, hide, clean quit",
  );
} finally {
  await desktop?.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
}
