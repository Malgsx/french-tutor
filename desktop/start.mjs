import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import electron from "electron";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const origin = "http://localhost:3030";
let server;
let desktop;
let stopping = false;

async function serverReady() {
  let response;
  try {
    response = await fetch(`${origin}/api/state`, {
      signal: AbortSignal.timeout(1000),
      redirect: "error",
    });
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") return false;
    throw new Error(
      "Port 3030 is not responding. Check the existing server before relaunching.",
    );
  }
  const state = await response.json().catch(() => null);
  if (
    !response.ok ||
    typeof state?.liveAvailable !== "boolean" ||
    !Array.isArray(state.words) ||
    typeof state.settings?.retainTranscripts !== "boolean"
  )
    throw new Error(
      "Port 3030 is occupied by a different service. Miette will not replace it.",
    );
  return true;
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  // Only terminate children this launcher owns; never stop a reused server.
  for (const child of [desktop, server]) {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
      continue;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      timer.unref();
      child.once("exit", () => clearTimeout(timer));
    });
  }
  process.exitCode = code;
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

try {
  if (await serverReady()) {
    console.log(
      "Using the running Miette server; its live configuration is unchanged.",
    );
  } else if (!stopping) {
    console.log("Starting the local Miette server…");
    server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      cwd,
      env: { ...process.env, PORT: "3030", APP_ORIGIN: origin },
      stdio: ["ignore", "inherit", "inherit"],
    });
    server.on("error", () => {
      console.error("Could not start the Miette server.");
      void stop(1);
    });
    server.on("exit", () => {
      if (!stopping) {
        console.error("The Miette server stopped; closing the desktop app.");
        void stop(1);
      }
    });
    const deadline = Date.now() + 20000;
    while (!stopping && !(await serverReady())) {
      if (Date.now() > deadline)
        throw new Error("Miette server startup timed out.");
      await delay(200);
    }
  }
  if (!stopping) {
    console.log(
      "Server ready. Opening Miette. Keep this Terminal open; Quit Miette or Ctrl+C to stop.",
    );
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = spawn(electron, [".", ...process.argv.slice(2)], {
      cwd,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    desktop.on("error", () => {
      console.error(
        "Could not open Electron. Run npm ci, then npm run desktop.",
      );
      void stop(1);
    });
    desktop.on("exit", (code) => void stop(code ?? 0));
  }
} catch (error) {
  console.error(error.message);
  await stop(1);
}
