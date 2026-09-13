import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGACY_SESSION, Store, normalize } from "../server/store";
import { defaults } from "../server/lesson";
import {
  UNDATED,
  UNDATED_HEADING,
  formatDayHeading,
  formatDuration,
  groupByDay,
  renderTranscripts,
  transcriptText,
  turnsFrom,
  type TranscriptArchive,
} from "../src/transcripts";

// 2026-09-13T20:30:00Z is Sunday evening in New York and already Monday in Tokyo.
const SUNDAY_EVENING = Date.parse("2026-09-13T20:30:00Z");
const MINUTE = 60_000;
const zone = { timeZone: "America/New_York", now: SUNDAY_EVENING + MINUTE };

test("day headings follow the viewer's time zone and ordinal style", () => {
  assert.equal(formatDayHeading(SUNDAY_EVENING, zone), "Sunday, Sept 13th");
  assert.equal(
    formatDayHeading(SUNDAY_EVENING, { ...zone, timeZone: "Asia/Tokyo" }),
    "Monday, Sept 14th",
  );
  assert.equal(
    formatDayHeading(Date.parse("2025-03-01T12:00:00Z"), zone),
    "Saturday, Mar 1st, 2025",
  );
  assert.equal(
    formatDayHeading(Date.parse("2026-01-22T12:00:00Z"), zone),
    "Thursday, Jan 22nd",
  );
  assert.equal(
    formatDayHeading(Date.parse("2026-05-23T12:00:00Z"), zone),
    "Saturday, May 23rd",
  );
  assert.equal(formatDuration(20_000), "under a minute");
  assert.equal(formatDuration(4 * MINUTE + 20_000), "4 min");
  assert.equal(formatDuration(65 * MINUTE), "1 h 5 min");
});

test("recordings group by local day, newest first, with same-day sessions kept apart", () => {
  const earlier = SUNDAY_EVENING - 3 * MINUTE * 60;
  const yesterday = SUNDAY_EVENING - 26 * MINUTE * 60;
  const archive: TranscriptArchive = {
    sessions: [
      {
        id: "old",
        mode: "demo",
        startedAt: yesterday,
        endedAt: yesterday + 2 * MINUTE,
      },
      {
        id: "late",
        mode: "live",
        startedAt: SUNDAY_EVENING,
        endedAt: SUNDAY_EVENING + 4 * MINUTE,
      },
      {
        id: "early",
        mode: "demo",
        startedAt: earlier,
        endedAt: earlier + MINUTE,
      },
    ],
    entries: [
      { role: "user", text: "bonjour", session: "old", at: yesterday + MINUTE },
      { role: "user", text: "merci", session: "early", at: earlier + MINUTE },
      {
        role: "assistant",
        text: "Bravo !",
        session: "early",
        at: earlier + MINUTE,
      },
      {
        role: "assistant",
        text: "Bon",
        start_ms: 0,
        end_ms: 200,
        session: "late",
        at: SUNDAY_EVENING + MINUTE,
      },
      {
        role: "assistant",
        text: "jour !",
        start_ms: 200,
        end_ms: 400,
        session: "late",
        at: SUNDAY_EVENING + MINUTE,
      },
      {
        role: "user",
        text: "Salut",
        start_ms: 500,
        end_ms: 900,
        session: "late",
        at: SUNDAY_EVENING + 2 * MINUTE,
      },
    ],
  };
  const days = groupByDay(archive, zone);
  assert.deepEqual(
    days.map((day) => day.heading),
    ["Sunday, Sept 13th", "Saturday, Sept 12th"],
  );
  assert.deepEqual(
    days[0].recordings.map((r) => r.id),
    ["late", "early"],
    "two sessions on one day stay separate, newest first",
  );
  assert.equal(
    days[0].recordings[0].label,
    "4:30 PM · 4 min · Live voice · 2 turns",
  );
  assert.equal(days[0].recordings[1].label, "1:30 PM · 1 min · Demo · 2 turns");
  assert.deepEqual(
    days[1].recordings.map((r) => r.id),
    ["old"],
  );
  // The same instants fall on different local days for a viewer in Tokyo.
  const tokyo = groupByDay(archive, { ...zone, timeZone: "Asia/Tokyo" });
  assert.deepEqual(
    tokyo.map((day) => [day.heading, day.recordings.length]),
    [
      ["Monday, Sept 14th", 2],
      ["Sunday, Sept 13th", 1],
    ],
  );
});

test("legacy records without timestamps fall back to an undated group listed last", () => {
  const legacyFile = {
    settings: { ...defaults, retainTranscripts: true },
    progress: { practiced: [], attempts: 1 },
    plan: null,
    transcripts: [
      { role: "user", text: "bonjour" },
      { role: "assistant", text: "Bravo !" },
    ],
  };
  const state = normalize(legacyFile);
  assert.deepEqual(state.sessions, [{ id: LEGACY_SESSION, mode: "unknown" }]);
  assert.equal(state.transcripts[0].session, LEGACY_SESSION);
  const dated = {
    id: "new",
    mode: "demo" as const,
    startedAt: SUNDAY_EVENING,
    endedAt: SUNDAY_EVENING + MINUTE,
  };
  const days = groupByDay(
    {
      sessions: [...state.sessions, dated],
      entries: [
        ...state.transcripts,
        { role: "user", text: "merci", session: "new", at: SUNDAY_EVENING },
      ],
    },
    zone,
  );
  assert.deepEqual(
    days.map((day) => day.key),
    ["2026-09-13", UNDATED],
  );
  assert.equal(days[1].heading, UNDATED_HEADING);
  assert.equal(
    days[1].recordings[0].label,
    "Time unknown · Earlier session · 2 turns",
  );
  assert.equal(
    transcriptText(days[1].recordings[0]),
    "Me: bonjour\nMiette: Bravo !",
  );
  // Entries referencing a session that is missing from the archive still render.
  const orphan = groupByDay(
    {
      sessions: [],
      entries: [
        { role: "user", text: "salut", session: "gone", at: SUNDAY_EVENING },
      ],
    },
    zone,
  );
  assert.equal(orphan[0].heading, "Sunday, Sept 13th");
  assert.equal(orphan[0].recordings[0].mode, "unknown");
});

test("chat-style rendering: one labelled turn per line, live deltas joined, text nodes only", () => {
  const turns = turnsFrom([
    { role: "user", text: "Hello" },
    { role: "assistant", text: "Bon", start_ms: 0, end_ms: 100 },
    { role: "assistant", text: "jour ", start_ms: 100, end_ms: 200 },
    { role: "assistant", text: "Ça va ?", start_ms: 300, end_ms: 500 },
    { role: "assistant", text: "Bravo !" },
    { role: "assistant", text: "Encore ?" },
  ]);
  assert.equal(
    transcriptText({ turns }),
    "Me: Hello\nMiette: Bonjour Ça va ?\nMiette: Bravo !\nMiette: Encore ?",
  );
  const doc = fakeDocument();
  const container = doc.createElement("div");
  const archive: TranscriptArchive = {
    sessions: [
      {
        id: "s",
        mode: "live",
        startedAt: SUNDAY_EVENING,
        endedAt: SUNDAY_EVENING + MINUTE,
      },
    ],
    entries: [
      { role: "user", text: "<b>Hello</b>", session: "s", at: SUNDAY_EVENING },
      { role: "assistant", text: "Bonjour", session: "s", at: SUNDAY_EVENING },
    ],
  };
  renderTranscripts(archive, container as unknown as HTMLElement, zone);
  const [count, day] = container.children;
  assert.equal(
    count.textContent,
    "1 recording saved · newest first · your local time",
  );
  assert.equal(day.children[0].tagName, "h4");
  assert.equal(day.children[0].textContent, "Sunday, Sept 13th");
  const details = day.children[1];
  assert.equal(details.tagName, "details");
  assert.equal(
    details.children[0].textContent,
    "4:30 PM · 1 min · Live voice · 2 turns",
  );
  const lines = details.children[1].children;
  assert.deepEqual(
    lines.map((line) => [line.className, line.textContent]),
    [
      ["turn user", "Me: <b>Hello</b>"],
      ["turn assistant", "Miette: Bonjour"],
    ],
  );
  assert.equal(lines[0].children[0].tagName, "strong");
  renderTranscripts(
    { sessions: [], entries: [] },
    container as unknown as HTMLElement,
    zone,
  );
  assert.equal(container.textContent, "No saved transcripts.");
});

test("store persists session metadata, updates ended-at, prunes aged sessions and migrates legacy files", () => {
  const dir = mkdtempSync(join(tmpdir(), "miette-transcripts-"));
  try {
    const file = join(dir, "state.json");
    writeFileSync(
      file,
      JSON.stringify({
        settings: { ...defaults, retainTranscripts: true },
        progress: { practiced: [], attempts: 0 },
        plan: null,
        transcripts: [{ role: "user", text: "legacy line" }],
      }),
    );
    const store = new Store(file);
    assert.equal(store.state.transcripts[0].session, LEGACY_SESSION);
    assert.deepEqual(store.state.sessions, [
      { id: LEGACY_SESSION, mode: "unknown" },
    ]);
    const session = {
      id: "demo-1",
      mode: "demo" as const,
      startedAt: SUNDAY_EVENING,
    };
    store.record(
      [{ role: "user", text: "bonjour", at: SUNDAY_EVENING + MINUTE }],
      session,
    );
    store.record(
      [{ role: "assistant", text: "Bravo !", at: SUNDAY_EVENING + 2 * MINUTE }],
      session,
    );
    store.record([], { ...session, endedAt: SUNDAY_EVENING + 5 * MINUTE });
    const saved = new Store(file).state;
    assert.deepEqual(saved.sessions, [
      { id: LEGACY_SESSION, mode: "unknown" },
      {
        id: "demo-1",
        mode: "demo",
        startedAt: SUNDAY_EVENING,
        endedAt: SUNDAY_EVENING + 5 * MINUTE,
      },
    ]);
    assert.deepEqual(
      saved.transcripts.map((entry) => [entry.session, entry.at]),
      [
        [LEGACY_SESSION, undefined],
        ["demo-1", SUNDAY_EVENING + MINUTE],
        ["demo-1", SUNDAY_EVENING + 2 * MINUTE],
      ],
    );
    // Entries saved without an explicit timestamp are stamped on arrival.
    store.record([{ role: "user", text: "now" }], {
      id: "live-1",
      mode: "live",
      startedAt: Date.now(),
    });
    assert.ok(typeof store.state.transcripts.at(-1)!.at === "number");
    // Once every entry of a session ages out of the retention window, the session goes too.
    store.record(
      Array.from({ length: 100 }, (_, i) => ({ role: "user", text: `f${i}` })),
      { id: "live-2", mode: "live", startedAt: Date.now() },
    );
    assert.deepEqual(
      store.state.sessions.map((s) => s.id),
      ["live-2"],
    );
    assert.equal(store.state.transcripts.length, 100);
    store.clearTranscripts();
    assert.deepEqual([store.state.transcripts, store.state.sessions], [[], []]);
    store.state.settings.retainTranscripts = false;
    store.record([{ role: "user", text: "ignored" }], session);
    assert.deepEqual([store.state.transcripts, store.state.sessions], [[], []]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

/** Minimal DOM stand-in: enough for text-node rendering assertions without a browser. */
type FakeNode = {
  tagName: string;
  className: string;
  children: FakeNode[];
  text: string;
  textContent: string;
  ownerDocument: FakeDocument;
  append: (...nodes: FakeNode[]) => void;
  replaceChildren: () => void;
};
type FakeDocument = {
  createElement: (tag: string) => FakeNode;
  createTextNode: (text: string) => FakeNode;
};
function fakeDocument(): FakeDocument {
  const doc: FakeDocument = {
    createElement(tag) {
      const node: FakeNode = {
        tagName: tag,
        className: "",
        children: [],
        text: "",
        ownerDocument: doc,
        get textContent() {
          return this.text + this.children.map((c) => c.textContent).join("");
        },
        set textContent(value: string) {
          this.text = value;
          this.children = [];
        },
        append(...nodes) {
          this.children.push(...nodes);
        },
        replaceChildren() {
          this.children = [];
          this.text = "";
        },
      };
      return node;
    },
    createTextNode(text) {
      const node = doc.createElement("#text");
      node.text = text;
      return node;
    },
  };
  return doc;
}
