# Miette — French, your next chapter

A parent-supervised French practice app with a comic 3D companion.

- **Demo** and **avatar customization** work with no API key.
- **Live voice** is optional and paid. You add **your own** OpenAI Live key
  if you want spoken practice.
- This is not a public tutoring service. It runs on your computer only.

Do not use someone else’s OpenAI key. Each household that wants voice
creates its own project key and budget.

## What you need

- **Node.js 26.5 or newer** and npm
- A browser (or, on a Mac, the optional menu-bar app)
- Optional, for Live voice: an OpenAI account with **`gpt-live-1`** access

## Install

Fork [Malgsx/french-tutor](https://github.com/Malgsx/french-tutor) on
GitHub, then clone **your** copy (replace `YOUR_USER`):

```sh
git clone https://github.com/YOUR_USER/french-tutor.git
cd french-tutor
npm ci
npm run build
npm start
```

You can also clone this repository directly if you do not need a fork.

Open <http://localhost:3030> on the same computer. Use `localhost`, not
`127.0.0.1`.

On a Mac, `npm run desktop` builds the UI, starts the server if needed,
and opens the floating-avatar window. Keep that Terminal open.

## Try it without a key

1. **Start demo** — typed vocabulary. No microphone. No AI calls.
   Try `merci` on the hello card for a gentle correction, then `bonjour`
   for success. Use **Say it again**, **A little hint**, **Next word**,
   and the word cards. Progress counts typed practice, not accent scores.
2. **Customize avatar** (top of the page) — hair, colors, and outfit.
   Presets: Classic, Sunrise, Midnight, Garden. **Save look** keeps it on
   this computer. Nothing is sent to OpenAI.
3. **Parent settings** — age band, language support, difficulty, optional
   transcript saving, and school-lesson import.

## Add your GPT Live key (real-time voice)

Spoken practice uses **OpenAI Live** (`gpt-live-1`). People often call this
“Realtime.” This app does **not** use the older `/v1/realtime` URL, and it
does not accept OpenRouter or Anthropic keys.

Your key stays on your computer. The browser never sees it.

### 1. Create a key

1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Create or pick a **project**. Add billing and a budget alert. Live is
   billed by the minute.
3. Confirm the project can use
   [`gpt-live-1`](https://developers.openai.com/api/docs/models/gpt-live-1).
4. Create a **project API key** under
   [API keys](https://platform.openai.com/settings/organization/api-keys).
   It should start with `sk-`.

More detail: [Live getting started](https://developers.openai.com/api/docs/guides/live).

### 2. Save it locally

In your project folder:

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set both lines:

```
LIVE_ENABLED=true
OPENAI_API_KEY=sk-your-project-key-here
```

Do not put the key in `VITE_*` or in any file you commit. `.env` is already
ignored by Git.

### 3. Check and start

Stop any Miette server that was started without the key. Then:

```sh
npm run doctor
npm run desktop:live
```

On any computer, you can use the browser instead of the Mac app:

```sh
npm run build
LIVE_ENABLED=true npm start
```

Open <http://localhost:3030>, choose **Live voice**, approve the paid
session, and allow the microphone. **End session** when you are done.
**Mute mic** does not stop billing.

### If Live stays off

| What you see | What to do |
| ------------ | ---------- |
| “Live voice off” | `LIVE_ENABLED` must be the exact word `true`. Restart after editing `.env`. |
| Doctor says there is no key | Add `OPENAI_API_KEY` to `.env` or export it in this Terminal. |
| Doctor mentions OpenRouter or Anthropic | Use an OpenAI project key that starts with `sk-` (not `sk-or-` or `sk-ant-`). |
| HTTP 401 or 403 | The key or project cannot call Live. Fix access; do not keep retrying. |
| Microphone blocked | Allow the mic for this site, or on a Mac: **System Settings → Privacy & Security → Microphone**. |
| Still demo-only after adding a key | Quit the old server first, then start with `desktop:live` or `LIVE_ENABLED=true`. |

## Using Live voice

- Sessions last up to **10 minutes**. Pause keeps the session open, so time
  still counts.
- You can interrupt Miette and speak; **Interrupt** silences her voice.
- OpenAI’s listed Live price (reviewed September 13, 2026) is about
  $0.05/minute plus a short setup charge. Check current pricing before you
  start.
- A parent should stay nearby. Generated speech can make mistakes and is
  not pre-screened word by word.

## School lessons

1. End any live session. Open **Parent settings**.
2. Upload a PDF, DOCX, or UTF-8 TXT (5 MB max), or paste text.
3. Review the text. Remove names, school details, and anything private.
   Reading a file does not send it to OpenAI.
4. Add a title and choose **Approve & save lesson**. Live uses that text.
   Up to twelve `French = English` lines become demo cards.

## Privacy on this computer

- Learning data (settings, lesson, progress, optional transcripts, avatar
  look) stays in `.local/state.json` on your machine.
- Audio is not recorded by this app. Live sends microphone audio and the
  approved lesson to OpenAI.
- Transcripts are off by default. If you turn them on, only the latest 100
  fragments are saved here. Turning them off deletes them.
- **Delete all learning data** resets settings, lesson, progress,
  transcripts, and the avatar look.
- Anyone who can use this computer can change settings. Do not put the app
  on a public website.

## Mac menu-bar app

```sh
npm run desktop
```

The window stays on top. Drag the top bar to move it. **Avatar only**
shrinks it; **Open chat** expands it. End live voice before shrinking so
mic controls stay available. Hide, close, or lock the screen to release
the microphone. Closing the window does not quit the menu-bar app.

## Settings you might change

These go in `.env` next to `package.json`, or in your Terminal. Existing
Terminal values win.

| Name             | What it does                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| `LIVE_ENABLED`   | Must be exactly `true` to allow Live                                      |
| `OPENAI_API_KEY` | Your OpenAI project key (server only)                                     |
| `PORT`           | Default `3030`                                                            |
| `APP_ORIGIN`     | Browser origin; default `http://localhost:3030`                           |
| `DATA_FILE`      | Where local data is stored; default `.local/state.json`                   |

```sh
npm run doctor
```

checks whether Live is configured, without printing your key.
