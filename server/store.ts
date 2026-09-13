import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { defaults, type Settings, type Progress, type Plan } from "./lesson";

export type State = {
  settings: Settings;
  progress: Progress;
  plan: Plan | null;
  transcripts: {
    role: string;
    text: string;
    start_ms?: number;
    end_ms?: number;
  }[];
};
export class Store {
  state: State;
  constructor(private file: string) {
    try {
      this.state = JSON.parse(readFileSync(file, "utf8"));
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
  record(entries: State["transcripts"]) {
    if (!this.state.settings.retainTranscripts) return;
    this.state.transcripts.push(...entries);
    this.state.transcripts = this.state.transcripts.slice(-100);
    this.save();
  }
}
