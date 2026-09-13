import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app";
import { Store } from "./store";
if (existsSync(".env")) process.loadEnvFile(".env");
const port = Number(process.env.PORT ?? 3030);
const app = createApp(
  new Store(resolve(process.env.DATA_FILE ?? ".local/state.json")),
  {
    origin: (process.env.APP_ORIGIN ?? process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, ""),
    live: process.env.LIVE_ENABLED === "true",
    key: process.env.OPENAI_API_KEY,
  },
);
app.use(express.static(resolve("dist")));
app.listen(port, "127.0.0.1", () =>
  console.log(
    `Miette listening on port ${port}. Live is opt-in; never expose this single-family prototype publicly.`,
  ),
);
