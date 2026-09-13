import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app";
import { Store } from "./store";
if (existsSync(".env")) process.loadEnvFile(".env");
const port = Number(process.env.PORT ?? 3030);
const portal = process.env.AMP_ORB === "1";
const origin = portal
  ? process.env.PUBLIC_URL
  : (process.env.APP_ORIGIN ??
    process.env.PUBLIC_URL ??
    `http://localhost:${port}`);
if (!origin || (portal && new URL(origin).protocol !== "https:"))
  throw new Error(
    "Orb startup requires the HTTPS PUBLIC_URL supplied by Amp's portal service.",
  );
// Pasted keys often carry a trailing space or newline, which OpenAI rejects with 401.
const key = process.env.OPENAI_API_KEY?.trim() || undefined;
const app = createApp(
  new Store(resolve(process.env.DATA_FILE ?? ".local/state.json")),
  {
    origin: origin.replace(/\/$/, ""),
    portal,
    live: process.env.LIVE_ENABLED === "true",
    key,
    preflight: true,
    onAccess: (access) =>
      console.log(
        access.available
          ? `Live key check passed (key ends in …${key?.slice(-4)}); approve each session in the app.`
          : `Live voice unavailable: ${access.reason}`,
      ),
  },
);
app.use(express.static(resolve("dist")));
app.listen(port, "127.0.0.1", () =>
  console.log(
    `Miette listening on port ${port}. ${portal ? "Private Amp collaborators only." : "Local access only; do not expose publicly."} Live ${process.env.LIVE_ENABLED === "true" && !!key ? "configured; checking the key with OpenAI…" : "disabled; requires LIVE_ENABLED=true and a server-side OPENAI_API_KEY"}.`,
  ),
);
