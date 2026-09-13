import { api } from "./protocol";
import type { TranscriptEntry, TranscriptSession } from "../server/store";

export type { TranscriptEntry, TranscriptSession };
export type TranscriptArchive = {
  sessions: TranscriptSession[];
  entries: TranscriptEntry[];
};
export type Turn = { role: string; speaker: string; text: string };
export type Recording = {
  id: string;
  mode: TranscriptSession["mode"];
  startedAt?: number;
  endedAt?: number;
  /** e.g. "3:42 PM" or "Time unknown". */
  time: string;
  /** e.g. "4 min" or "under a minute". */
  duration: string;
  /** Summary line shown in the list, e.g. "3:42 PM · 4 min · Live voice · 6 turns". */
  label: string;
  turns: Turn[];
};
export type DayGroup = {
  /** Sortable "YYYY-MM-DD" in the viewer's time zone, or UNDATED for legacy records. */
  key: string;
  heading: string;
  recordings: Recording[];
};
export type GroupOptions = {
  /** IANA zone; defaults to the viewer's local time zone. */
  timeZone?: string;
  /** Reference "now" used to decide whether a heading needs a year. */
  now?: number;
};
export const UNDATED = "undated";
export const UNDATED_HEADING = "Earlier recordings";
export const UNDATED_NOTE = "Saved before Miette tracked recording dates.";
export const SPEAKERS: Record<string, string> = {
  user: "Me",
  assistant: "Miette",
};
const MODES: Record<TranscriptSession["mode"], string> = {
  live: "Live voice",
  demo: "Demo",
  unknown: "Earlier session",
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
type DateParts = { year: number; month: number; day: number; weekday: string };
function parts(ms: number, timeZone?: string): DateParts {
  const found = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(ms));
  const pick = (type: string) =>
    found.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    weekday: pick("weekday"),
  };
}
function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}
export function dayKey(ms: number, timeZone?: string) {
  const { year, month, day } = parts(ms, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** "Sunday, Sept 13th", with the year appended only when it is not the current year. */
export function formatDayHeading(ms: number, options: GroupOptions = {}) {
  const { year, month, day, weekday } = parts(ms, options.timeZone);
  const currentYear = parts(options.now ?? Date.now(), options.timeZone).year;
  return `${weekday}, ${MONTHS[month - 1]} ${day}${ordinal(day)}${year === currentYear ? "" : `, ${year}`}`;
}
export function formatTime(ms: number, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}
export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
}
/**
 * Folds saved entries into speaker turns. Live captions arrive as timed deltas
 * ("bon", "jour !") and are joined verbatim; complete practice messages stay
 * separate turns even when the same speaker has two in a row.
 */
export function turnsFrom(entries: TranscriptEntry[]): Turn[] {
  const turns: (Turn & { delta: boolean })[] = [];
  for (const entry of entries) {
    const last = turns.at(-1);
    const delta = typeof entry.start_ms === "number";
    if (last && delta && last.delta && last.role === entry.role)
      last.text += entry.text;
    else
      turns.push({
        role: entry.role,
        speaker: SPEAKERS[entry.role] ?? entry.role,
        text: entry.text,
        delta,
      });
  }
  return turns.map(({ role, speaker, text }) => ({
    role,
    speaker,
    text: text.trim(),
  }));
}
function recordingsFrom(
  archive: TranscriptArchive,
  options: GroupOptions,
): Recording[] {
  const byId = new Map<string, TranscriptEntry[]>();
  for (const entry of archive.entries) {
    const id = entry.session ?? UNDATED;
    byId.set(id, [...(byId.get(id) ?? []), entry]);
  }
  const sessions = new Map(archive.sessions.map((s) => [s.id, s]));
  return [...byId].map(([id, entries]) => {
    const session = sessions.get(id);
    const stamps = entries.flatMap((e) =>
      typeof e.at === "number" ? [e.at] : [],
    );
    const startedAt =
      session?.startedAt ?? (stamps.length ? Math.min(...stamps) : undefined);
    const ends = [session?.endedAt, ...stamps].flatMap((v) =>
      typeof v === "number" ? [v] : [],
    );
    const endedAt = ends.length ? Math.max(...ends) : undefined;
    const turns = turnsFrom(entries);
    const mode = session?.mode ?? "unknown";
    const time =
      startedAt === undefined
        ? "Time unknown"
        : formatTime(startedAt, options.timeZone);
    const duration =
      startedAt !== undefined && endedAt !== undefined
        ? formatDuration(endedAt - startedAt)
        : "";
    const label = [
      time,
      duration,
      MODES[mode],
      `${turns.length} ${turns.length === 1 ? "turn" : "turns"}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return { id, mode, startedAt, endedAt, time, duration, label, turns };
  });
}
/** Newest day first; within a day, newest recording first; undated legacy records last. */
export function groupByDay(
  archive: TranscriptArchive,
  options: GroupOptions = {},
): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const recording of recordingsFrom(archive, options)) {
    const key =
      recording.startedAt === undefined
        ? UNDATED
        : dayKey(recording.startedAt, options.timeZone);
    const group = groups.get(key) ?? {
      key,
      heading:
        key === UNDATED
          ? UNDATED_HEADING
          : formatDayHeading(recording.startedAt!, options),
      recordings: [],
    };
    group.recordings.push(recording);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) =>
      a.key === UNDATED
        ? 1
        : b.key === UNDATED
          ? -1
          : b.key.localeCompare(a.key),
    )
    .map((group) => ({
      ...group,
      recordings: group.recordings.sort(
        (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
      ),
    }));
}
/** Plain-text form of one recording: "Me: Hello\nMiette: Bonjour". */
export function transcriptText(recording: Pick<Recording, "turns">) {
  return recording.turns
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .join("\n");
}
export type DayExportFormat = "md" | "doc" | "json";
/** Download filename for one day, e.g. "miette-transcripts-2026-09-13.md". */
export function dayExportFilename(day: Pick<DayGroup, "key" | "heading">, format: DayExportFormat) {
  const slug =
    day.key === UNDATED
      ? "earlier-recordings"
      : day.key;
  return `miette-transcripts-${slug}.${format}`;
}
/** Agent-friendly Markdown for one day: heading, one section per recording, one turn per line. */
export function dayToMarkdown(day: DayGroup) {
  const lines = [
    `# ${day.heading}`,
    ``,
    `${day.recordings.length} ${day.recordings.length === 1 ? "recording" : "recordings"}`,
    ``,
  ];
  for (const recording of day.recordings) {
    lines.push(`## ${recording.label}`);
    if (recording.startedAt !== undefined)
      lines.push(`Recorded: ${new Date(recording.startedAt).toISOString()} · mode: ${recording.mode} · id: ${recording.id}`);
    lines.push(``);
    for (const turn of recording.turns)
      lines.push(`**${turn.speaker}:** ${turn.text}`);
    lines.push(``);
  }
  return lines.join("\n");
}
/** Machine-readable JSON for one day, including recording metadata and turns. */
export function dayToJson(day: DayGroup) {
  return JSON.stringify(
    {
      heading: day.heading,
      key: day.key,
      exportedAt: new Date().toISOString(),
      recordings: day.recordings.map((recording) => ({
        id: recording.id,
        mode: recording.mode,
        label: recording.label,
        startedAt:
          recording.startedAt === undefined
            ? null
            : new Date(recording.startedAt).toISOString(),
        endedAt:
          recording.endedAt === undefined
            ? null
            : new Date(recording.endedAt).toISOString(),
        turns: recording.turns,
      })),
    },
    null,
    2,
  );
}
function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
/**
 * Word-compatible HTML saved with a .doc extension so parents can open a
 * day's transcripts directly in Word/LibreOffice without extra tooling.
 */
export function dayToWordHtml(day: DayGroup) {
  const sections = day.recordings
    .map(
      (recording) => `<h2>${escapeHtml(recording.label)}</h2>` +
        (recording.startedAt !== undefined
          ? `<p><i>Recorded ${escapeHtml(new Date(recording.startedAt).toISOString())} · ${escapeHtml(recording.mode)} · ${escapeHtml(recording.id)}</i></p>`
          : "") +
        recording.turns
          .map(
            (turn) =>
              `<p><b>${escapeHtml(turn.speaker)}:</b> ${escapeHtml(turn.text)}</p>`,
          )
          .join("\n"),
    )
    .join("\n");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(day.heading)}</title></head><body><h1>${escapeHtml(day.heading)}</h1><p>${day.recordings.length} ${day.recordings.length === 1 ? "recording" : "recordings"}</p>${sections}</body></html>`;
}
/** Serializes one day and triggers a browser download. */
export function downloadDay(day: DayGroup, format: DayExportFormat) {
  const mime =
    format === "json"
      ? "application/json"
      : format === "md"
        ? "text/markdown"
        : "application/msword";
  const content =
    format === "json"
      ? dayToJson(day)
      : format === "md"
        ? dayToMarkdown(day)
        : dayToWordHtml(day);
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = dayExportFilename(day, format);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/**
 * Renders the review list into `container` using text nodes only.
 * Each recording opens as a chat-style document, one speaker turn per line.
 */
export function renderTranscripts(
  archive: TranscriptArchive,
  container: HTMLElement,
  options: GroupOptions = {},
) {
  const doc = container.ownerDocument;
  const make = (tag: string, className: string, text?: string) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const days = groupByDay(archive, options);
  container.replaceChildren();
  const total = days.reduce((n, day) => n + day.recordings.length, 0);
  if (!total) {
    container.append(make("p", "tiny", "No saved transcripts."));
    return days;
  }
  container.append(
    make(
      "p",
      "tiny",
      `${total} ${total === 1 ? "recording" : "recordings"} saved · newest first · your local time`,
    ),
  );
  for (const day of days) {
    const section = make("section", "transcript-day");
    section.append(make("h4", "transcript-heading", day.heading));
    const exports = make("div", "transcript-exports");
    for (const format of ["md", "doc", "json"] as const) {
      const button = make(
        "button",
        "transcript-export",
        `Export ${format === "doc" ? ".doc" : `.${format}`}`,
      );
      button.setAttribute("type", "button");
      button.setAttribute("data-format", format);
      button.setAttribute(
        "aria-label",
        `Export ${day.heading} as ${format === "doc" ? "Word (.doc)" : format === "md" ? "Markdown" : "JSON"}`,
      );
      button.addEventListener("click", () => downloadDay(day, format));
      exports.append(button);
    }
    section.append(exports);
    if (day.key === UNDATED) section.append(make("p", "tiny", UNDATED_NOTE));
    for (const recording of day.recordings) {
      const details = make("details", "transcript-recording");
      details.append(make("summary", "transcript-summary", recording.label));
      const document = make("div", "transcript-doc");
      for (const turn of recording.turns) {
        const line = make("p", `turn ${turn.role}`);
        line.append(
          make("strong", "speaker", `${turn.speaker}:`),
          doc.createTextNode(` ${turn.text}`),
        );
        document.append(line);
      }
      details.append(document);
      section.append(details);
    }
    container.append(section);
  }
  return days;
}
/** Tracks the active recording so every saved turn carries the same session metadata. */
export class Recorder {
  session?: TranscriptSession;
  constructor(private enabled: () => boolean) {}
  start(mode: "live" | "demo") {
    this.session = { id: crypto.randomUUID(), mode, startedAt: Date.now() };
    return this.session;
  }
  save(entries: TranscriptEntry[]) {
    if (!this.session || !this.enabled()) return Promise.resolve();
    return api("transcripts", { session: this.session, entries });
  }
  finish() {
    const session = this.session;
    this.session = undefined;
    if (!session || !this.enabled()) return Promise.resolve();
    return api("transcripts", {
      session: { ...session, endedAt: Date.now() },
      entries: [],
    });
  }
}
