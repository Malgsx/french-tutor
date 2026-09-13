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
const app = createApp(
  new Store(resolve(process.env.DATA_FILE ?? ".local/state.json")),
  {
    origin: origin.replace(/\/$/, ""),
    portal,
    live: process.env.LIVE_ENABLED === "true",
    key: process.env.OPENAI_API_KEY,
  },
);
app.use(express.static(resolve("dist")));
app.listen(port, "127.0.0.1", () =>
  console.log(
    `Miette listening on port ${port}. ${portal ? "Private Amp collaborators only." : "Local access only; do not expose publicly."} Live ${process.env.LIVE_ENABLED === "true" && !!process.env.OPENAI_API_KEY ? "available; approve each session in the app" : "disabled; requires LIVE_ENABLED=true and a server-side key"}.`,
  ),
);
