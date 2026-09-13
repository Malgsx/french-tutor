// `npm run doctor`: explains, without revealing the key, why Live is or is not
// going to work on this machine. Safe to paste into a chat.
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { checkKey, LIVE_SESSIONS_URL } from "./live-access";

const root = process.cwd();
const ok = (text: string) => console.log(`  OK    ${text}`);
const bad = (text: string) => console.log(`  FIX   ${text}`);
const info = (text: string) => console.log(`  info  ${text}`);

function mask(key: string) {
  return key.length > 8 ? `${key.slice(0, 7)}…${key.slice(-4)} (${key.length} chars)` : "(too short)";
}

console.log(`Miette doctor · folder: ${root}`);
if (!existsSync(resolve(root, "package.json")) || !existsSync(resolve(root, "server/index.ts")))
  bad("Run this from the french-tutor folder (the one containing package.json).");
if (!existsSync(resolve(root, "dist/index.html")))
  bad("dist/ is missing: run npm run build (npm run desktop does this for you).");

console.log("\n1. Key file");
const envPath = resolve(root, ".env");
const fileValues: Record<string, string> = {};
if (!existsSync(envPath)) {
  info(".env not found next to package.json (fine if the key is exported in this Terminal).");
  for (const stray of ["tutor/.env", "../.env", "server/.env", "desktop/.env"])
    if (existsSync(resolve(root, stray)))
      bad(`Found ${stray}: the server does not read it. Move it to ${envPath}`);
} else {
  const mode = statSync(envPath).mode & 0o777;
  ok(`.env found at ${envPath}${mode === 0o600 ? "" : ` (mode ${mode.toString(8)}; chmod 600 .env recommended)`}`);
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.replace(/^\s*export\s+/, "");
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      if (line.trim() && !line.trim().startsWith("#"))
        bad(`Unreadable line in .env: “${line.slice(0, 20)}…” — expected NAME=value`);
      continue;
    }
    fileValues[match[1]] = match[2];
  }
  const raw = fileValues.OPENAI_API_KEY;
  if (raw === undefined) bad("No OPENAI_API_KEY= line in .env (name is case-sensitive, all caps).");
  else {
    if (/^["'].*["']$/.test(raw.trim())) info("The key in .env is quoted; that is accepted.");
    if (raw !== raw.trim()) info("The key has surrounding whitespace; the server trims it.");
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (!value) bad("OPENAI_API_KEY= is empty in .env.");
    else if (!value.startsWith("sk-")) bad(`OPENAI_API_KEY in .env does not start with sk- (${mask(value)}).`);
    else ok(`.env has OPENAI_API_KEY ${mask(value)}`);
  }
  const live = fileValues.LIVE_ENABLED?.trim().replace(/^["']|["']$/g, "");
  if (live === undefined) info("No LIVE_ENABLED in .env; npm run desktop:live sets it for you.");
  else if (live !== "true") bad(`LIVE_ENABLED in .env is “${live}”; only the exact word true works.`);
  else ok("LIVE_ENABLED=true in .env");
}

console.log("\n2. Terminal environment (wins over .env)");
const shellKey = process.env.OPENAI_API_KEY;
if (shellKey) ok(`OPENAI_API_KEY exported in this Terminal: ${mask(shellKey.trim())}`);
else info("OPENAI_API_KEY is not exported in this Terminal.");
if (process.env.LIVE_ENABLED === undefined) info("LIVE_ENABLED not exported; use npm run desktop:live or put LIVE_ENABLED=true in .env.");
else if (process.env.LIVE_ENABLED !== "true") bad(`LIVE_ENABLED is “${process.env.LIVE_ENABLED}”; only the exact word true works.`);
else ok("LIVE_ENABLED=true exported");

const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");
const fileKey = unquote(fileValues.OPENAI_API_KEY ?? "");
const key = unquote(shellKey ?? fileKey);
const liveOn = (process.env.LIVE_ENABLED ?? fileValues.LIVE_ENABLED?.trim()) === "true";
console.log("\n3. What the server will use");
if (!key) bad("No key anywhere: Live cannot start. Add OPENAI_API_KEY=sk-… to .env next to package.json.");
else ok(`Key ${mask(key)} from ${shellKey ? "the Terminal" : ".env"}`);
if (shellKey && fileKey && unquote(shellKey) !== fileKey)
  bad("The Terminal key is DIFFERENT from the one in .env and it wins. Run: unset OPENAI_API_KEY   (and remove the export from ~/.zshrc or ~/.bash_profile so it stays gone).");
// Other providers reuse the OPENAI_API_KEY name; only OpenAI keys work with api.openai.com.
if (key.startsWith("sk-or-")) bad("This is an OpenRouter key (sk-or-…), not an OpenAI key. OpenAI will reject it. Use a key from platform.openai.com.");
else if (key.startsWith("sk-ant-")) bad("This is an Anthropic key (sk-ant-…), not an OpenAI key. Use a key from platform.openai.com.");
if (!liveOn) bad("Live is switched off: start with npm run desktop:live (or LIVE_ENABLED=true in .env).");

console.log(`\n4. OpenAI (${LIVE_SESSIONS_URL})`);
if (key) {
  const access = await checkKey(key);
  if (access.available) ok("OpenAI accepts this key for GPT-Live.");
  else bad(access.reason ?? "OpenAI refused the key.");
}

console.log("\n5. Already-running Miette server on port 3030");
try {
  const response = await fetch("http://localhost:3030/api/state", { signal: AbortSignal.timeout(1500) });
  const state = (await response.json()) as { liveAvailable?: boolean; liveReason?: string | null };
  if (typeof state.liveAvailable !== "boolean") bad("Port 3030 is used by something that is not Miette. Stop it or it will block the app.");
  else if (state.liveAvailable) ok("A Miette server is running and reports Live available.");
  else {
    bad(`A Miette server is ALREADY running with an old configuration: ${state.liveReason ?? "Live unavailable"}`);
    bad("Quit every Miette window and press Ctrl+C in every Terminal running Miette, then start again. New keys do not reach a server that is already running.");
  }
} catch {
  ok("No server on port 3030 yet; npm run desktop:live will start a fresh one with the settings above.");
}
