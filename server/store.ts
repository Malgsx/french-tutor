import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { defaults, type Settings, type Progress, type Plan } from "./lesson";

export type TranscriptEntry = {
  role: string;
  text: string;
  start_ms?: number;
  end_ms?: number;
  /** Recording this entry belongs to; LEGACY_SESSION for records saved before sessions existed. */
  session?: string;
  /** Epoch milliseconds when the entry was saved. */
  at?: number;
};
export type TranscriptSession = {
  id: string;
  mode: "live" | "demo" | "unknown";
  startedAt?: number;
  endedAt?: number;
};
export type State = {
  settings: Settings;
  progress: Progress;
  plan: Plan | null;
  transcripts: TranscriptEntry[];
  sessions: TranscriptSession[];
};
export const LEGACY_SESSION = "legacy";
export const TRANSCRIPT_LIMIT = 100;
export class Store {
  state: State;
  constructor(private file: string) {
    try {
      this.state = normalize(JSON.parse(readFileSync(file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = this.fresh();
    }
  }
  fresh(): State {
    return {
      settings: { ...defaults },
      progress: { practiced: [], attempts: 0 },
      plan: null,
      transcripts: [],
      sessions: [],
    };
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), {
      mode: 0o600,
    });
    renameSync(`${this.file}.tmp`, this.file);
  }
  reset() {
    this.state = this.fresh();
    this.save();
  }
  clearTranscripts() {
    this.state.transcripts = [];
    this.state.sessions = [];
  }
  record(entries: TranscriptEntry[], session?: TranscriptSession) {
    if (!this.state.settings.retainTranscripts) return;
    const now = Date.now();
    this.state.transcripts.push(
      ...entries.map((entry) => ({
        ...entry,
        session: entry.session ?? session?.id ?? LEGACY_SESSION,
        at: entry.at ?? now,
      })),
    );
    this.state.transcripts = this.state.transcripts.slice(-TRANSCRIPT_LIMIT);
    if (session) {
      const latest = Math.max(
        session.endedAt ?? 0,
        ...entries.map((entry) => entry.at ?? now),
      );
      const existing = this.state.sessions.find((s) => s.id === session.id);
      if (existing) {
        existing.mode = session.mode;
        existing.startedAt ??= session.startedAt;
        existing.endedAt = Math.max(existing.endedAt ?? 0, latest);
      } else
        this.state.sessions.push({
          id: session.id,
          mode: session.mode,
          startedAt: session.startedAt,
          endedAt: latest,
        });
    }
    this.state.sessions = reconcile(
      this.state.transcripts,
      this.state.sessions,
    );
    this.save();
  }
}
/**
 * Keeps sessions and entries consistent: sessions whose entries all aged out of
 * the retention window are dropped, and entries referencing an unknown session
 * (including legacy records) get an undated session so they can still be shown.
 */
function reconcile(
  transcripts: TranscriptEntry[],
  sessions: TranscriptSession[],
): TranscriptSession[] {
  const referenced = new Set(transcripts.map((entry) => entry.session));
  const kept = sessions.filter((s) => referenced.has(s.id));
  for (const id of referenced)
    if (id && !kept.some((s) => s.id === id))
      kept.push({ id, mode: "unknown" });
  return kept;
}
/** Upgrades state files written before recordings carried session metadata. */
export function normalize(raw: unknown): State {
  const state = raw as Partial<State>;
  const transcripts = Array.isArray(state.transcripts)
    ? state.transcripts.map((entry) => ({
        ...entry,
        session: entry.session ?? LEGACY_SESSION,
      }))
    : [];
  return {
    settings: state.settings ?? { ...defaults },
    progress: state.progress ?? { practiced: [], attempts: 0 },
    plan: state.plan ?? null,
    transcripts,
    sessions: reconcile(
      transcripts,
      Array.isArray(state.sessions) ? state.sessions : [],
    ),
  };
}
