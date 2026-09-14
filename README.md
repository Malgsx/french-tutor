# Miette — French, your next chapter

A parent-supervised French-practice prototype with a comic 3D companion.
Demo, school-lesson cards, and **avatar customization work with no API key**.
Live voice is optional, paid, and off by default.

This is not a public tutoring service, a parental-control product, or a
certified language assessment. Each clone runs on that computer only.

**Forks should not use someone else’s OpenAI key — including this repo’s
author.** Sharing a Live key would put that person’s bill, quota, and
provider account on every fork. Keep Live on your own project key, or skip
Live and use demo + customize.

## Fork, run, customize (no API)

You need **Node.js 26.5 or newer** and npm. The document worker uses Node’s
network permission controls; do not run it on older versions.

```sh
git clone https://github.com/Malgsx/french-tutor.git
cd french-tutor
npm ci
npm run build
npm start
```

Open <http://localhost:3030> on that same computer.

1. **Start demo** — scripted text vocabulary. No microphone. No AI calls.
   Try `merci` on the hello card for a gentle correction, then `bonjour`
   for success. **Say it again**, **A little hint**, **Next word**, and the
   word cards guide repetition. Progress counts typed practice, never accent
   scores.
2. **Customize avatar** (top navigation) — change Miette’s hair, colors, and
   outfit. Presets: Classic, Sunrise, Midnight, Garden. **Save look** stores
   it in local learning data (`.local/state.json`). Nothing is sent to
   OpenAI. Close without saving to keep the last saved look.
3. **Parent settings** — age band, language support, difficulty, optional
   transcript retention, and school-lesson import. No password in this local
   version.

That is the whole fork path. You can stop here.

A one-liner that only does the same clone-and-build (still no key):

```sh
git clone https://github.com/Malgsx/french-tutor.git && cd french-tutor && npm ci && npm run build && npm start
```

Do not pipe a remote script into `bash` to “install a key.” There is no
shared Live endpoint to curl. If you want voice, create **your own** OpenAI
project key below.

`npm run desktop` builds the UI, starts the server if needed, and opens the
macOS menu-bar app. Keep that Terminal open. Without a private key and
`LIVE_ENABLED=true`, it stays demo-only.

`npm run dev` also runs the broker; it does **not** run Vite HMR. Rebuild
after frontend edits. `npm start` must run from this folder so it finds
`dist/` and `.env`.

## Optional: your own Live voice

Only if you want spoken practice. Each household uses its own OpenAI
project key, budget, and alerts. The key stays on the server. The browser
never sees it.

1. Create an OpenAI project key with **GPT-Live** access:
   [API keys](https://platform.openai.com/settings/organization/api-keys).
   Official Live docs:
   [Getting started](https://developers.openai.com/api/docs/guides/live),
   [model access](https://developers.openai.com/api/docs/models/gpt-live-1).
2. Copy the example env file and lock it down. Put **your** key there — not
   a key from a chat, a gist, or this repository.

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

   Edit `.env`:

   ```
   LIVE_ENABLED=true
   OPENAI_API_KEY=sk-…
   ```

   Or paste the key only into a hidden local Terminal prompt (it is not
   written to disk):

   ```sh
   read -rs 'OPENAI_API_KEY?OpenAI project key (hidden): '; printf '\n'
   export OPENAI_API_KEY
   npm run desktop:live
   ```

3. Check the setup without printing the key:

   ```sh
   npm run doctor
   ```

4. Restart the broker (`npm run desktop:live` or `LIVE_ENABLED=true npm start`).
   Choose **Live voice**, approve the paid session, and allow the microphone.
   End promptly with **End session**.

`npm run desktop:live` sets `LIVE_ENABLED=true` and starts the same
server/desktop pair. It never prompts for, saves, or supplies a key. Without
a key, Live stays disabled. You still approve each paid session in the app.

Existing environment values win over `.env`. Never commit `.env` or put a
key in `VITE_*`, renderer code, Electron preload, screenshots, logs, or a
chat message. An HTTP 401 means fix authentication privately; do not retry
automatically. After a prompt-only session, `unset OPENAI_API_KEY`. If a
demo server is already running, stop it first: reusing it cannot change its
environment or enable Live.

## This Mac (author install)

The recovered files for this household are in **`/Users/malgsx/French Tutor`**.
The separate Home checkout is `/Users/malgsx/Home` and is unchanged.
Credentials (`.env` and `.env.*`), learning data/screenshots (`.local/`),
dependencies and build output are ignored.

The default Node on this Mac is 25.2.1. The desktop command automatically
uses an isolated Node 26.5 runtime; no system Node upgrade is needed.

```sh
cd "/Users/malgsx/French Tutor"
npm run desktop
```

An already-running Miette server is reused without changing its live
settings. An unrelated service on port 3030 is left untouched and reported
as a conflict. Quit from the menu-bar menu or press Ctrl+C to close the app
and any server this command started. A reused server is never stopped by
the launcher. The launcher strips the API key from Electron’s environment.

To rerun checks under the required runtime:

```sh
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- sh -c 'npm run check && npm test && npm run build && npm audit'
# Requires port 3030 to be free:
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- npx tsx tests/desktop.smoke.ts
env -u OPENAI_API_KEY npm exec --yes --package=node@26.5.0 -- npx tsx tests/startup.smoke.ts
```

## Private Amp orb

Use the personal Amp project [mal/french-tutor](https://ampcode.com/@mal/french-tutor),
linked to this GitHub repository. Start a **New Orb** for that project. The
orb runs the browser tutor, not the macOS menu-bar app. Do not use
`desktop:live` there. Invited collaborators share that orb’s Live
configuration — do not treat the orb as a public demo for forks.

1. In that project’s **Secrets & Env Vars**, privately configure
   `OPENAI_API_KEY` if it is not already supplied by your personal settings.
   A key scoped only to another project is not sufficient. Never paste the
   key into a thread, setup script, service command or Git file.
2. **Live is already enabled for the orb service** in `.amp/services.yaml`:
   `env: { LIVE_ENABLED: "true" }`. The name is case-sensitive and all
   uppercase. This is ordinary configuration, not a secret. A missing key
   still disables Live. To disable Live, change that service value to
   `"false"` and restart it.
3. `.agents/setup` installs dependencies with Node 26.5 and checks/builds
   the web app. It strips the OpenAI key from its process, skips the
   Electron binary, and does not start services or save credentials.
4. In the orb Terminal, run `amp orb services ensure`. Amp supplies `PORT`,
   `PUBLIC_URL` and `AMP_ORB=1`; do not copy a localhost `APP_ORIGIN` or
   hardcode a generated portal hostname.
5. Open the exact generated portal URL **in a new browser tab**, signed in
   as the thread owner or an invited collaborator. Keep the portal private.
   Microphone access should happen in the top-level HTTPS page, not the
   embedded Portal pane.

After saving or changing a secret:

```sh
amp orb restart-processes
```

See [Handling Secrets](https://ampcode.com/docs/orbs/handling-secrets).
For code or `.amp/services.yaml` only:

```sh
amp orb service restart tutor
amp orb service status tutor
```

The service prints only whether Live is available, never the key. A 403
means the viewer is not an authorized thread collaborator, or a write used
the wrong origin. Only `/healthz` is exempt. This header-based protection
is for Amp’s trusted proxy, **not** generic hosting. Orb data stays in that
orb’s ignored `.local/state.json`. Do not put family data into setup
snapshots.

### Environment

The server reads environment variables, then an optional ignored `.env` in
this folder (next to `package.json`).

| Variable         | Default / meaning                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`           | `3030`; server binds only to `127.0.0.1`                                                            |
| `APP_ORIGIN`     | Exact browser origin (scheme, host, port); defaults to `PUBLIC_URL`, then `http://localhost:<PORT>` |
| `AMP_ORB`        | Amp sets `1` in orbs, enabling collaborator-only access and requiring HTTPS `PUBLIC_URL`            |
| `PUBLIC_URL`     | Amp-generated portal URL; in an orb this takes precedence over `APP_ORIGIN`                         |
| `LIVE_ENABLED`   | Only the literal `true` permits live session creation                                               |
| `OPENAI_API_KEY` | Server-only OpenAI project key; required for live                                                   |
| `DATA_FILE`      | `.local/state.json`; local settings, approved plan, progress, optional transcripts, avatar look     |

On macOS, the desktop shell trusts **only** `http://localhost:3030/`. Do
not substitute `127.0.0.1` in the browser address because cross-origin
writes are rejected.

### Local access only

The parent-password gate has been removed for local testing. Anyone using
this computer can change settings, the avatar, and (if a key is present)
approve live usage. Keep the broker on loopback. Do not expose this
prototype publicly or deploy it without restoring access controls.

## Live voice (how the paid path works)

Set `OPENAI_API_KEY` privately and `LIVE_ENABLED=true`, restart the broker,
select **Live voice**, and approve the cost/data-sharing checkbox. Browser
microphone permission is requested only then.

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
- **End session** sends `session.close`, mutes input/output, waits up to 15
  seconds for `session.closed`, then releases media and peer resources.

The UI reports microphone state separately from the avatar. **Mute mic**
disables the device track but does not end billing. **Interrupt** silences
playback and asks the model to stop. The status pill under the avatar starts
live when idle. While live, the pill is a pause/play button: pause keeps the
session open, so live time is still billed. The browser ends practice after
ten minutes; this is not a tamper-proof spending cap. Starts are limited to
one per minute per broker.

OpenAI’s documentation reviewed September 13, 2026 lists $0.05/minute,
billed by the second, and a 15-second WebRTC initialization charge credited
against the running duration. Check current pricing before use.
Unsuccessful initialization may still incur a charge. A 401/403 or
model-access failure needs key/project access review, not a fallback to a
remembered Realtime endpoint.

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
   information, and irrelevant instructions. Extraction alone does not save
   or send anything to OpenAI.
4. Add a title and choose **Approve & save lesson**. The approved text is
   used by the next live session. Up to twelve `French = English` lines
   become demo cards.

The worker runs as a short-lived permission-restricted Node process with a
stripped environment, no network/writes/addons/child-process access, an
8-second timeout and a 128 MiB V8 heap limit. Originals are held in memory
and discarded. Only plain text is returned, capped at 20,000 characters.
PDFs are capped at 50 pages. Node permissions are defense in depth, **not
an OS isolation boundary**.

Saved state uses a mode-700 directory and atomic mode-600 file replacement.
There is currently no parent authentication.

- Audio is not recorded by this app. Live sends audio and approved lesson
  text to OpenAI. `store:false` does **not** promise Zero Data Retention.
- Captions are memory-only by default. Opt-in retention saves the latest 100
  fragments, grouped by local day, with Markdown / Word / JSON export.
  Turning retention off deletes saved transcripts immediately.
- **Remove school lesson** clears the approved plan and vocabulary progress.
  **Delete all learning data** resets settings, plan, progress, transcripts,
  and the avatar look.
- Prompts request brief age-appropriate French lessons. Generated speech is
  **not pre-screened**. Parent supervision is essential.

## macOS menu-bar / floating-avatar app

```sh
npm run desktop
```

The transparent, always-on-top window has a draggable top bar. **Avatar only**
shrinks it to 230×280; drag the character to move it and select **Open chat**
to expand. End live voice before compacting so microphone controls are never
hidden. Hide, close, lock-screen and suspend release voice capture. Closing
the window does not quit the menu-bar app.

The renderer has context isolation, no Node integration, sandboxing, blocked
popups/webviews/navigation, and an audio-only permission allowlist for the
trusted local broker. The desktop does not read `.env` or use the OpenAI
key.

**Why Electron rather than Swift?** It shares the WebRTC, lesson UI and
Three.js implementation with the web app. Nothing here claims Puck’s
implementation or uses its design or assets.

### Packaging and Apple signing

`npm run desktop:pack` on a Mac builds an unpacked local app. It contains
the desktop shell, **not** a bundled broker, Node runtime, updater, or
one-click installer. Do not treat an unsigned build as ready to distribute.

For distribution, a Mac owner must choose an owned reverse-DNS application
ID, obtain their own Developer ID certificate, sign and notarize with
protected credentials, and verify on real macOS. Never commit certificates
or API keys. Linux/Xvfb smoke cannot establish TCC, Gatekeeper, or
notarization.

## Avatar customization

`src/avatar.ts` builds an original male comic adventurer from Three.js
shapes: purple spiked hair, a lavender coat with diagonal gold trim and a
star pin. There are no downloaded character models, branded swords,
franchise marks, costumes, names, or proprietary artwork.

**In the app:** **Customize avatar** opens a studio with a live preview.
Looks persist through `POST /api/avatar` into local state. Hair styles:
spiky, short, wavy. Outfits: classic coat, hoodie, vest. Colors: hair,
skin, eyes, jacket, coat/layer, accent.

The `createAvatar(host, look)` boundary returns `setState(state)`,
`applyLook(look)`, and `dispose()`. `AvatarState` in `src/protocol.ts` has
seven states: **idle, listening, thinking (delegating), speaking,
correction, success, error**. Live speaking is driven by output-audio
energy, not transcript timing. Reduced-motion preferences are respected.

For a polished replacement, commission/license an original rigged GLB and
keep Three.js, or replace `createAvatar` with a Rive runtime in the same
host. Preserve transparent compact mode and microphone controls. No Rive
dependency is required today.

## Source map and verification

| Area                             | Files                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Broker/config                    | `server/app.ts`, `server/index.ts`                                                              |
| Lesson prompts/exercises/storage | `server/lesson.ts`, `server/store.ts`                                                           |
| Upload/extraction                | `server/upload.ts`, `server/extract.mjs`                                                        |
| Avatar look                      | `src/avatar-look.ts`, `src/avatar.ts`                                                           |
| WebRTC/events/lifecycle          | `src/live.ts`, `src/protocol.ts`                                                                |
| Web UI/avatar                    | `src/main.ts`, `src/avatar.ts`, `src/*.css`, `web/index.html`                                   |
| Desktop shell                    | `desktop/main.cjs`, `desktop/preload.cjs`                                                       |
| Tests                            | `tests/core.test.ts`, `tests/avatar.test.ts`, `tests/live.test.ts`, `tests/desktop.smoke.ts`    |

```sh
npm ci
npm run check && npm test && npm run build && npm audit

# Stop anything on port 3030 first; smoke owns an isolated mock broker.
npx tsx tests/desktop.smoke.ts                   # macOS with a desktop
xvfb-run -a npx tsx tests/desktop.smoke.ts       # Linux with xvfb + xauth

npx tsx tests/desktop.interaction.ts
```

All default tests are synthetic, local and free; API requests are mocked.
The Three.js production chunk currently produces Vite’s >500 kB advisory;
this is not suppressed.

Before a paid smoke test, confirm the project key is present without
displaying it, and explicitly approve one fresh session. Keep `store:false`,
close within seconds, and record only status/event types — not credentials,
SDP, or conversation history.
