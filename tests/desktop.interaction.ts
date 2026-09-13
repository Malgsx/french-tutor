import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { createApp } from "../server/app";
import { Store } from "../server/store";

// Requires the built app running on localhost:3030. All API calls use an isolated
// temporary broker so the user's settings and learning data remain untouched.
const temp = mkdtempSync(join(tmpdir(), "miette-layout-"));
const server = createApp(new Store(join(temp, "state.json")), {
  origin: "http://localhost:3030",
  live: false,
}).listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const port = (server.address() as { port: number }).port;
const desktop = await electron.launch({
  args: [".", `--user-data-dir=${temp}/profile`],
  env: {
    PATH: process.env.PATH!,
    HOME: process.env.HOME!,
    TMPDIR: process.env.TMPDIR!,
  },
});
try {
  const page = await desktop.firstWindow();
  await page.route("http://localhost:3030/api/**", async (route) => {
    const response = await route.fetch({
      url: route.request().url().replace("localhost:3030", `127.0.0.1:${port}`),
    });
    await route.fulfill({ response });
  });
  await page.waitForSelector("#words button", { state: "attached" });
  await page.reload();
  await page.waitForSelector("#words button", { state: "attached" });
  const viewport = async (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const r = element.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.left >= 0 &&
        r.bottom <= innerHeight &&
        r.right <= innerWidth
      );
    });
  assert.equal(await page.locator("#answer").isDisabled(), true);
  assert.match(
    (await page.locator("#answer").getAttribute("placeholder")) ?? "",
    /Start demo/,
  );
  assert.equal(
    await viewport("#start"),
    true,
    "Start is visible without Playwright auto-scroll",
  );
  assert.equal(
    await viewport("#answer"),
    true,
    "Input is visible on initial open",
  );
  await page.screenshot({
    path: ".local/verification/miette-start-visible.png",
  });
  await page.click("#start");
  assert.equal(await page.locator("#answer").isEnabled(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "answer");
  await page.locator("#answer").pressSequentially("bonjour");
  await page.locator("#answer").press("Enter");
  await page.waitForFunction(
    () =>
      document.querySelector("#avatar")?.getAttribute("data-state") ===
      "success",
  );
  assert.match(await page.locator("#messages").innerText(), /Bravo/);
  assert.equal(await viewport("#end"), true);
  assert.equal(await viewport("#answer"), true);
  await page.screenshot({
    path: ".local/verification/miette-typing-fixed.png",
  });
  await page.click("#end");
  assert.equal(await page.locator("#answer").isDisabled(), true);
  await page.click("#collapse");
  await page.waitForFunction(() => innerWidth === 230 && innerHeight === 280);
  assert.equal(await viewport("#expand-avatar"), true);
  await page.screenshot({
    path: ".local/verification/miette-compact-after.png",
  });
  await page.click("#expand-avatar");
  await page.waitForFunction(() => innerWidth === 450);
  assert.equal(await viewport("#start"), true);
  await page.click("#parents");
  await page.waitForSelector("#parent-content", { state: "visible" });
  assert.equal(await page.locator("input[type=password]").count(), 0);
  await page.selectOption("#age", "11–13");
  await page.selectOption("#support", "Mostly French");
  await page.selectOption("#difficulty", "Conversation");
  await page.check("#retain");
  assert.match(
    await page.locator("#settings-status").innerText(),
    /Unsaved changes/,
  );
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings"));
  await page.click("#settings-form button");
  assert.equal((await saved).status(), 200);
  await page.waitForFunction(() =>
    document
      .querySelector("#settings-status")
      ?.textContent?.startsWith("Settings saved"),
  );
  assert.equal(
    await viewport("#settings-status"),
    true,
    "Save confirmation visible without scrolling",
  );
  assert.deepEqual(new Store(join(temp, "state.json")).state.settings, {
    age: "11–13",
    support: "Mostly French",
    difficulty: "Conversation",
    retainTranscripts: true,
  });
  await page.screenshot({
    path: ".local/verification/miette-settings-saved.png",
  });
  await page.click("#close-parent");
  await page.reload();
  await page.waitForSelector("#words button", { state: "attached" });
  await page.click("#parents");
  await page.waitForSelector("#parent-content", { state: "visible" });
  assert.equal(await page.locator("#age").inputValue(), "11–13");
  assert.equal(await page.locator("#support").inputValue(), "Mostly French");
  assert.equal(await page.locator("#difficulty").inputValue(), "Conversation");
  assert.equal(await page.locator("#retain").isChecked(), true);
  await page.route("**/api/settings", (route) =>
    route.fulfill({ status: 500, json: { error: "Simulated save failure" } }),
  );
  await page.selectOption("#support", "English help");
  await page.click("#settings-form button");
  await page.waitForFunction(
    () =>
      document.querySelector("#settings-status")?.textContent ===
      "Simulated save failure",
  );
  assert.equal(await viewport("#settings-status"), true);
  assert.equal(await page.locator("#settings-form button").isEnabled(), true);
  assert.equal(
    new Store(join(temp, "state.json")).state.settings.support,
    "Mostly French",
  );
  await page.screenshot({
    path: ".local/verification/miette-settings-error.png",
  });
  await page.click("#close-parent");
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch({
      url: `http://127.0.0.1:${port}/api/state`,
    });
    await route.fulfill({
      json: { ...(await response.json()), liveAvailable: true },
    });
  });
  await page.reload();
  await page.waitForSelector("#words button", { state: "attached" });
  await page.evaluate(() => {
    Reflect.set(window, "testMicRequests", 0);
    navigator.mediaDevices.getUserMedia = async () => {
      Reflect.set(
        window,
        "testMicRequests",
        Reflect.get(window, "testMicRequests") + 1,
      );
      throw new DOMException("Synthetic microphone denial", "NotAllowedError");
    };
  });
  await page.click("#live");
  await page.click("#live-form button[type=submit]");
  assert.equal(
    await page.evaluate(() => Reflect.get(window, "testMicRequests")),
    0,
  );
  assert.equal(
    await page
      .locator("#live-dialog")
      .evaluate((dialog: HTMLDialogElement) => dialog.open),
    true,
  );
  await page.screenshot({
    path: ".local/verification/miette-live-consent.png",
  });
  await page.check("#approve-live");
  await page.click("#live-form button[type=submit]");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("Synthetic microphone denial"),
  );
  assert.equal(
    await page.evaluate(() => Reflect.get(window, "testMicRequests")),
    1,
  );
  console.log(
    "PASS Live UI: no password, consent still required before microphone; synthetic denial handled without capturing audio or making an OpenAI call.",
  );
  console.log(
    "PASS settings: no password; visible success/error; all four preferences survive disk re-read and page reload; failed saves do not claim success or replace stored preferences.",
  );
  console.log(
    "PASS actual Electron: Start and input in initial viewport; click enables and focuses typing; Enter gets Bravo; End visible; compact and expand remain usable. Isolated test data only.",
  );
} finally {
  await desktop.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(temp, { recursive: true, force: true });
}
