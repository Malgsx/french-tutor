# Miette — French, your next chapter

A single-family French-practice prototype for a parent-supervised teenager who
likes comics and anime. It combines a browser tutor with an Electron menu-bar /
floating-avatar shell. Everything lives in `tutor/`; the Home `app/` is unchanged.

**Demo works without credentials and makes no AI calls.** Live voice is optional,
paid, and off by default. This is not a public service, a parental-control security
product, a certified language assessment, or an independently installed Mac app.

## This Mac

The recovered `tutor/` files are in **`/Users/malgsx/French Tutor`**, as requested.
The separate Home checkout is `/Users/malgsx/Home` and is unchanged. References
to `tutor/` below mean this French Tutor folder for this local installation.
This folder is its own local Git repository. Credentials (`.env` and `.env.*`),
learning data/screenshots (`.local/`), dependencies and build output are ignored.
The private GitHub repository is [Malgsx/french-tutor](https://github.com/Malgsx/french-tutor).
Other agents need authenticated access to that repository; credentials and local
learning data are not included in a clone.

The default Node on this Mac is 25.2.1. The desktop command automatically uses
an isolated Node 26.5 runtime; no system Node upgrade is needed.

```sh
cd "/Users/malgsx/French Tutor"
npm run desktop
```

For Live-enabled startup, with your API key already configured privately:

```sh
npm run desktop:live
```

This sets `LIVE_ENABLED=true` and runs the same combined server/desktop startup.
It never prompts for, saves, or supplies a key. Without a key, Live stays disabled.
You still approve each paid voice session in the app.

This builds the UI, starts the server if needed, waits until it is ready, and
opens Miette. **Keep this Terminal open.** No separate `npm start` is needed.
You can also open <http://localhost:3030> while Miette is running.

An already-running Miette server is reused without changing its live settings.
An unrelated service on port 3030 is left untouched and reported as a conflict.
Quit Miette from its menu-bar menu or press Ctrl+C to close the app and any server
started by this command. A reused server is never stopped by the launcher.
Without a privately configured key and `LIVE_ENABLED=true`, a new server runs
demo-only. The launcher strips the API key from Electron's environment.

To rerun checks under the required runtime:

```sh
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- sh -c 'npm run check && npm test && npm run build && npm audit'
# Requires port 3030 to be free:
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- npx tsx tests/desktop.smoke.ts
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- npx tsx tests/startup.smoke.ts
```

### Private live setup in Terminal (zsh)

Stop the demo broker first. Enter credentials only into these hidden **local
Terminal prompts**, never in chat or a command argument. This stores them only
in that shell's environment, not in `.env` or source. Use an OpenAI project key
with GPT-Live access. No parent password is required in this local version.

```sh
cd "/Users/malgsx/French Tutor"
read -rs 'OPENAI_API_KEY?OpenAI project key (hidden): '; printf '\n'
export OPENAI_API_KEY
npm run desktop:live
```

Choose **Live voice**, approve the paid session, and allow microphone access.
If macOS denies it, use System Settings → Privacy & Security → Microphone to
enable Electron, then relaunch it. End promptly with **End session**. An HTTP
401 requires correcting authentication privately; do not retry automatically.
After stopping the live broker, run `unset OPENAI_API_KEY` in
that Terminal. No key is written to disk by this workflow. If a demo server is
already running separately, stop it in its own Terminal first: reusing it cannot
change its environment or enable Live.

## Quick start (on your computer)

Install **Node.js 26.5 or newer** and npm. The document worker uses Node's network
permission controls; do not run it on older versions. Then:

```sh
gh repo clone Malgsx/french-tutor
cd french-tutor
npm ci
npm run check
npm test
npm run build
npm start
```

Open `http://localhost:3030` on that same computer. Choose **Start demo**. The demo
is a scripted text vocabulary exercise, not synthesized speech or microphone
practice. Try `merci` for the hello card to see a gentle correction, then `bonjour`
for success. **Say it again**, **A little hint**, **Next word**, and the word cards
guide repetition. Progress counts typed vocabulary practice, never accent scores.

Parent settings open directly without a password in this local version. The
default profile is ages 14–17, Balanced support, Short phrases, transcripts off.
Choose **Save settings** after edits; saving/success/error feedback appears next
to the button. Saved preferences persist across reloads and broker restarts.
Demo cards remain simple at every level; difficulty/language preferences steer
the live model rather than inventing an adaptive demo curriculum.

`npm run dev` also runs the broker; it does **not** run Vite HMR. Rebuild after
frontend edits. `npm start` must run from this folder so it finds `dist/` and `.env`.

## Private Amp orb

Use the personal Amp project [mal/french-tutor](https://ampcode.com/@mal/french-tutor),
linked to this GitHub repository. Start a **New Orb** for that project. The orb
runs the browser tutor, not the macOS menu-bar app. Do not use `desktop:live` there.

1. In that project's **Secrets & Env Vars**, privately configure `OPENAI_API_KEY`
   if it is not already supplied by your personal settings. A key scoped only to
   another project is not sufficient. Never paste the key into a thread, setup
   script, service command or Git file.
2. **Live is already enabled for the orb service** in `.amp/services.yaml`:
   `env: { LIVE_ENABLED: "true" }`. The name is case-sensitive and all uppercase.
   This is ordinary configuration, not a secret. A missing key still disables Live.
   To disable Live, change that service value to `"false"` and restart it.
3. `.agents/setup` installs dependencies with Node 26.5 and checks/builds the web
   app. It strips the OpenAI key from its process, skips the Electron binary, and
   does not start services or save credentials. No resume hook is needed: Amp
   supervises the service across wakes.
4. In the orb Terminal, run `amp orb services ensure`. In an existing orb that
   predates these files, first pull the changes without overwriting local work
   and run `.agents/setup` once. Amp supplies `PORT`, `PUBLIC_URL` and `AMP_ORB=1`;
   do not copy a localhost `APP_ORIGIN` or hardcode a generated portal hostname.
5. Open the exact generated portal URL **in a new browser tab**, signed in to Amp
   as the thread owner or an invited collaborator. Keep the portal private.
   Microphone access should happen in the top-level HTTPS page, not the embedded
   Portal pane. The app sends `frame-ancestors 'none'`, but external testing found
   that Amp rewrites it to allow same-origin and `https://ampcode.com` frames.
   Strict no-framing protection is therefore not preserved by the portal layer.
6. Try **Start demo** first, then **Live voice**, approve cost/data sharing and
   allow the browser microphone. End promptly with **End session**.

After saving or changing a secret, run inside the orb:

```sh
amp orb restart-processes
```

This reloads Amp's injected environment and restarts the executor and managed
services after the current command finishes. Restarting only the tutor service
does not refresh the orb's secret injection. See [Handling Secrets](https://ampcode.com/docs/orbs/handling-secrets).

For changes only to `.amp/services.yaml` or source code, use:

```sh
amp orb service restart tutor
amp orb service status tutor
```

The service prints only whether Live is available, never the key. A 403 means
the viewer is not an authorized thread collaborator, or a write used the wrong
origin. The app requires Amp's exact `collaborator=yes` proxy claim on pages and
API routes, even if someone accidentally makes the portal public. Read-only
workspace access is not enough. Only `/healthz` is exempt; it returns `{ok:true}`
and no settings, key status or learning data. The listener remains loopback-only.
This header-based protection is for Amp's trusted proxy, **not** generic hosting
where callers could forge the header.

Orb data stays in that orb's ignored `.local/state.json`. It survives ordinary
sleep/wake, but is not a cross-orb database or backup; fresh orbs and your Mac do
not automatically share progress. Do not put family data into setup snapshots.
Only invite trusted collaborators: they share access to the single-family app.
This private development portal is not an always-on production deployment.

### Environment

The server reads environment variables, then an optional ignored `.env` in this
folder (next to `package.json`). Existing environment values take precedence.
Run `npm run doctor` to check where the key is coming from and whether OpenAI
accepts it, without printing the key. Never commit `.env` or put a key in
`VITE_*`, renderer code, Electron preload, screenshots, logs, or a chat message.

| Variable         | Default / meaning                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`           | `3030`; server binds only to `127.0.0.1`                                                            |
| `APP_ORIGIN`     | Exact browser origin (scheme, host, port); defaults to `PUBLIC_URL`, then `http://localhost:<PORT>` |
| `AMP_ORB`        | Amp sets `1` in orbs, enabling collaborator-only access and requiring HTTPS `PUBLIC_URL`            |
| `PUBLIC_URL`     | Amp-generated portal URL; in an orb this takes precedence over `APP_ORIGIN`                         |
| `LIVE_ENABLED`   | Only the literal `true` permits live session creation                                               |
| `OPENAI_API_KEY` | Server-only OpenAI project key; required for live                                                   |
| `DATA_FILE`      | `.local/state.json`; local settings, approved plan, progress, optional transcripts                  |

Configure secrets through a password manager/environment injector or a private
`.env` with mode `600`. On macOS, the desktop shell trusts **only**
`http://localhost:3030/`: use port 3030 and that exact `APP_ORIGIN`. Do not substitute
`127.0.0.1` in the browser address because cross-origin writes are rejected.

### Local access only

The parent-password gate has been removed for local testing. Anyone using this
Mac can change settings and approve live usage. Keep the broker on loopback;
do not expose it through a public portal or deploy it without restoring access
controls. The Home app and its service configuration remain unchanged.

## Live voice

Set `OPENAI_API_KEY` privately and `LIVE_ENABLED=true`, restart the broker, select
**Live voice**, and approve the cost/data-sharing checkbox. Browser microphone
permission is requested only then. Use localhost on your Mac or the authenticated
private Amp portal described above.

The broker uses the current official **`POST /v1/live/sessions`** JSON flow:

- `session.model: "gpt-live-1"`, `store: false`, client delegation, masculine
  `meridian` voice. WebRTC negotiates audio format; no format override is sent.
- The browser adds microphone tracks and the `oai-events` data channel before
  generating its offer, gathers ICE, and sends the offer to the local
  broker. Only session ID and answer SDP return to the browser, never the key.
- HTTP creation starts the session. Wait for `session.started`; do not send
  `session.start`, Realtime commands, or old conversation/reasoning items.
- Transcript deltas remain in memory for context. `session.delegation.created`
  has metadata, not a task prompt. The application consults its current lesson
  and recent transcript and returns `session.commentary.append` with the exact
  opaque delegation ID. No Responses model, arbitrary tools, web search, shell,
  or external retrieval is enabled. This backend is deliberately deterministic.
- **End session** sends `session.close`, mutes input/output, waits up to 15 seconds
  for `session.closed`, then releases media and peer resources. No final event
  means final usage is unconfirmed. Closing the page, hiding/quitting the desktop,
  or OS suspension prioritizes releasing the microphone immediately and may
  prevent graceful finalization. There is no automatic reconnect/retry.

The UI reports microphone state separately from the avatar. **Mute mic** disables
the device track but does not end billing. **Interrupt** silences playback and
asks the model to stop; **Resume audio** enables playback again. The status pill
under the avatar (and the avatar itself) starts live when idle, going through the
same parent-approval dialog; if live is disabled it explains why inline. While
live, the pill is a pause/play button: pause disables the microphone track and
silences playback but keeps the session open, so live time is still billed and
play resumes instantly. The pill also shows the time left before the ten-minute
stop. Natural speech
interruptions remain available. The browser ends practice after ten minutes;
this is not a tamper-proof server-enforced spending cap. Starts are limited to
one per minute per broker. Set a project budget/alerts and supervise use.

OpenAI's documentation reviewed September 13, 2026 lists $0.05/minute, billed by
the second, and a 15-second WebRTC initialization charge credited against the
running duration. Backend models/tools are separately billed, but none are used
here. Check current pricing before use; unsuccessful initialization may still
incur a charge. A 401/403 or model-access failure needs key/project access review,
not a fallback to a remembered Realtime endpoint. A network timeout has uncertain
outcome and must not be retried blindly.

Official references:

- [Getting started](https://developers.openai.com/api/docs/guides/live)
- [WebRTC contract](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Client delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)
- [Session lifecycle, voices and close](https://developers.openai.com/api/docs/guides/live-conversations)
- [Model pricing/access](https://developers.openai.com/api/docs/models/gpt-live-1)
- [Provider data controls](https://developers.openai.com/api/docs/guides/your-data)

## School lessons and privacy

1. End live practice and open **Parent settings**.
2. Choose a PDF, DOCX, or UTF-8 TXT of at most 5 MiB, or paste text.
3. Review the extracted text. Remove names, school/contact details, sensitive
   information, and irrelevant instructions. Extraction alone does not save or
   send anything to OpenAI.
4. Add a title and choose **Approve & save lesson**. The approved text is used by
   the next live session. Up to twelve `French = English` lines become demo cards.

The worker runs as a short-lived permission-restricted Node process with a
stripped environment, no network/writes/addons/child-process access, reads limited
to its extractor and installed packages, an 8-second timeout and a 128 MiB V8
heap limit. Originals are held in memory and discarded; no upload directory is
created. Only plain text is returned, capped at 20,000 characters. PDFs are capped
at 50 pages; scanned/encrypted PDFs and old `.doc` files need conversion. No OCR,
macros, links, or embedded media are executed. Text is displayed through DOM text
nodes / textarea values, not document HTML. Node permissions are defense in depth,
**not an OS isolation boundary** against a compromised runtime; the heap limit is
not a total RSS limit. Use an OS sandbox/container before accepting hostile files
or deploying this beyond a trusted household.

Saved state uses a mode-700 directory and atomic mode-600 file replacement.
There is currently no parent authentication or session cookie. CSP, exact-origin
checks, bounded bodies, and server-owned Live config remain in place, but are not
authentication and do not prevent another local user from changing data or
approving a session. Do not expose this local prototype publicly.

- Audio is not recorded by this app. Live sends audio and approved lesson text to
  OpenAI. `store:false` disables optional Live recording/fork storage; it does
  **not** promise Zero Data Retention or override provider/account policies.
- Captions/history are memory-only by default and cleared on session end. Opt-in
  transcript retention saves only the latest 100 fragments/practice messages,
  each tagged with its recording session (id, mode, started/ended time).
  **Review saved transcripts** groups recordings by local day, newest first,
  and opens each one as a chat-style document (`Me:` / `Miette:`). Each day
  offers per-date export buttons: Markdown (agent-friendly), Word (`.doc`)
  and JSON. Records saved before session tracking appear under
  “Earlier recordings”. Turning retention off deletes saved transcripts immediately.
- **Remove school lesson** clears the approved plan and vocabulary progress.
  **Delete all learning data** resets settings, plan, progress and transcripts
  but does not erase independent OS backups or
  provider records. To remove the state file itself, stop the broker and remove
  your configured `DATA_FILE` locally.
- Prompts request brief age-appropriate French lessons, repetition, kind
  pronunciation modeling, no accent scoring, no secrets, no dependency-building,
  and trusted-adult support for distress. Generated speech is **not pre-screened**
  word by word and can make mistakes. Parent supervision is essential. Live voice
  quality and safeguarding require real French-speaker/parent evaluation.

## macOS menu-bar / floating-avatar app

From the French Tutor folder, start the server and desktop together:

```sh
npm run desktop
```

The transparent, always-on-top window has a draggable top bar. **Avatar only**
shrinks it to 230×280; drag the character to move it and select **Open chat** to
expand. End live voice before compacting so microphone controls are never hidden.
The tray/menu-bar entry can show, hide, or quit. Hide, close, lock-screen and
suspend release voice capture. Closing the window does not quit the menu-bar app.

The renderer has context isolation, no Node integration, sandboxing, blocked
popups/webviews/navigation, and an audio-only permission allowlist for the trusted
local broker. The tiny preload only exposes compact/hide/suspend IPC. The desktop
does not read `.env` or use the OpenAI key; start it without sensitive environment
variables where practical.

**Why Electron rather than Swift?** It shares the exact WebRTC, lesson UI and
Three.js implementation with the web app, avoiding two independently maintained
voice pipelines. Chromium, Node and GPU processes cost more RAM, startup time and
battery than a focused AppKit/SwiftUI `NSPanel` plus native renderer. No numerical
memory claims have been measured. For an always-on companion, measure Activity
Monitor idle/listening/speaking/hidden cases on target Macs first. A native Swift
shell with WKWebView can retain the web code while reducing shell complexity;
fully native audio and SceneKit/RealityKit require a larger rewrite and separate
WebRTC/lifecycle testing. Nothing here claims Puck's implementation or uses its
design or assets.

### Packaging and Apple signing

`npm run desktop:pack` on a Mac builds an unpacked local app. The current package
contains the desktop shell, **not** a bundled broker, Node runtime, updater, or
one-click installer. The broker must still be started separately. Do not treat an
unsigned build as ready to distribute.

For distribution, a Mac owner must:

1. Choose an owned reverse-DNS application ID (replace `local.miette.tutor`) and
   original app/tray icons; test Apple Silicon and Intel targets as needed.
2. Obtain the appropriate Apple Developer membership/Developer ID Application
   certificate through their own account. No membership purchase is automated.
3. Configure electron-builder code signing, hardened runtime, and appropriate
   parent/child entitlements (including audio input and Electron's required JIT
   permissions). Review Electron's current signing guidance rather than disabling
   sandboxing or Gatekeeper. `NSMicrophoneUsageDescription` is already present.
4. Sign nested frameworks/helpers, notarize with Apple using protected credentials
   (`notarytool`/electron-builder), and staple the ticket to the distributed app.
   Never commit certificates, passwords, API keys, or notarization credentials.
5. Verify `codesign --verify --deep --strict`, `spctl --assess --type execute`,
   clean-machine launch, microphone denial/approval, Retina/transparency, multiple
   monitors/Spaces, actual dragging, sleep/wake, lock and quit on real macOS.

Linux/Xvfb smoke coverage cannot establish macOS TCC permissions, native menu-bar
behavior, Gatekeeper acceptance, signing or notarization. Mac App Store
distribution is a separate entitlement/sandbox/review project, not supported by
this prototype configuration.

## Avatar and replacement path

`src/avatar.ts` constructs an original male comic adventurer from Three.js shapes:
purple spiked hair, a lavender coat with diagonal gold trim and a star pin. There
are no downloaded character models, branded swords, franchise marks, costumes,
names, or proprietary artwork. It borrows only a broad heroic anime energy.

The `createAvatar(host)` boundary returns `setState(state)` and `dispose()`.
`AvatarState` in `src/protocol.ts` has seven states: **idle, listening, thinking
(delegating), speaking, correction, success, error**. Live speaking is driven by
output-audio energy, not transcript timing. The mouth animation is illustrative,
not phoneme-accurate lip sync. Reduced-motion preferences are respected.

For a polished replacement, commission/license an original rigged GLB and keep
Three.js for real 3D. Or replace `createAvatar` with a Rive runtime mounted in the
same host: map the seven states to a Rive state-machine input, forward resize and
reduced-motion settings, preserve the accessible state label, and dispose the
runtime/listeners on teardown. Supply your own licensed `.riv` plus a locally
served compatible WASM runtime; update CSP narrowly if required (never blanket
`unsafe-eval`/remote assets). Rive is a 2D/vector alternative, not a drop-in 3D
model. Preserve transparent compact mode, microphone controls, and the original
character identity. No Rive dependency, asset, subscription, or account is needed
for the current implementation.

## Source map and verification

| Area                             | Files                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Broker/config                    | `server/app.ts`, `server/index.ts`                                                              |
| Lesson prompts/exercises/storage | `server/lesson.ts`, `server/store.ts`                                                           |
| Upload/extraction                | `server/upload.ts`, `server/extract.mjs`                                                        |
| WebRTC/events/lifecycle          | `src/live.ts`, `src/protocol.ts`                                                                |
| Web UI/avatar                    | `src/main.ts`, `src/avatar.ts`, `src/*.css`, `web/index.html`                                   |
| Desktop shell                    | `desktop/main.cjs`, `desktop/preload.cjs`                                                       |
| Tests                            | `tests/core.test.ts`, `tests/documents.test.ts`, `tests/live.test.ts`, `tests/desktop.smoke.ts` |

```sh
npm ci
npm run check && npm test && npm run build && npm audit

# Stop anything on port 3030 first; smoke owns an isolated mock broker.
npx tsx tests/desktop.smoke.ts                   # macOS with a desktop
xvfb-run -a npx tsx tests/desktop.smoke.ts       # Linux with xvfb + xauth

# With npm start running on localhost:3030, exercise desktop interactions
# against isolated test data (no changes to your saved preferences):
npx tsx tests/desktop.interaction.ts
```

All default tests are synthetic, local and free; API requests are mocked. The
desktop smoke checks real Electron startup, isolated renderer configuration,
typed practice, compact size/drag region, expansion, hide and quit. Linux smoke
passes `--no-sandbox` only in the container harness, never in the shipped app.
Set `ARTIFACT_DIR` to save optional screenshots. The Three.js production chunk
currently produces Vite's >500 kB advisory; this is not suppressed.

Before a paid smoke test, check the official API contract again, confirm the
project key is present without displaying it, and explicitly approve one fresh
session. Keep `store:false`, client delegation and synthetic context, close within
seconds, and record only status/event types and final duration—not credentials,
SDP, raw session payloads or conversation history. Creation success, WebRTC start,
delegation acknowledgment, audio playback and graceful close are separate checks;
report which actually occurred. Never restore/replay encrypted model history.
