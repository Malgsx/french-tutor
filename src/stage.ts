import type { AvatarState } from "./protocol";

// Pure view model for the pill under the avatar. main.ts feeds it the current
// session facts and applies the result to the DOM, so the transitions are
// testable without a browser.
export type StagePhase = "idle" | "demo" | "connecting" | "live" | "paused";
export type StageAction = "start" | "unavailable" | "pause" | "resume" | "none";
export type MicState =
  | "idle"
  | "unavailable"
  | "demo"
  | "connecting"
  | "listening"
  | "speaking"
  | "paused";
export type MicAction = StageAction | "interrupt";
export type MicView = {
  state: MicState;
  action: MicAction;
  caption: string;
  ariaLabel: string;
};
export type StageInput = {
  live: boolean;
  ready: boolean;
  paused: boolean;
  demo: boolean;
  liveAvailable: boolean;
  avatarState: AvatarState;
  remainingMs: number | null;
};
export type StageView = {
  phase: StagePhase;
  action: StageAction;
  icon: string;
  label: string;
  ariaLabel: string;
  mic: MicView;
};
export const labels: Record<AvatarState, string> = {
  idle: "Idle · ready when you are",
  listening: "Listening · your turn",
  thinking: "Thinking · checking the lesson",
  speaking: "Speaking · jump in anytime",
  correction: "Small adjustment · give it another go",
  success: "Nice one · keep that energy",
  error: "A snag · let’s pause here",
};
export const UNAVAILABLE_REASON =
  "Live voice is off on this server. A parent must set LIVE_ENABLED=true and a private OpenAI key, then restart Miette. Start demo works without a microphone.";

export function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds} left`;
}

// The microphone button is "your mic": press to start talking, to cut in while
// Miette speaks, to mute yourself while listening, or to unmute when paused.
export function micView(input: StageInput): MicView {
  if (input.live) {
    if (input.paused)
      return {
        state: "paused",
        action: "resume",
        caption: "Paused · press to resume",
        ariaLabel: "Resume: unmute your microphone and Miette’s voice",
      };
    if (!input.ready)
      return {
        state: "connecting",
        action: "pause",
        caption: "Connecting…",
        ariaLabel: "Connecting live voice · press to pause",
      };
    if (input.avatarState === "speaking")
      return {
        state: "speaking",
        action: "interrupt",
        caption: "Miette speaking · press to cut in",
        ariaLabel:
          "Miette is speaking · press to interrupt her and ask your question",
      };
    return {
      state: "listening",
      action: "pause",
      caption: "Listening · press to pause",
      ariaLabel: "Microphone live, Miette is listening · press to pause",
    };
  }
  if (input.demo)
    return {
      state: "demo",
      action: "none",
      caption: "Demo · no microphone",
      ariaLabel: "Microphone off during demo · End session to start live voice",
    };
  return input.liveAvailable
    ? {
        state: "idle",
        action: "start",
        caption: "Talk to Miette",
        ariaLabel:
          "Start a live voice conversation with Miette · parent approval required",
      }
    : {
        state: "unavailable",
        action: "unavailable",
        caption: "Live voice off",
        ariaLabel: "Live voice unavailable · press for details",
      };
}

export function stageView(input: StageInput): StageView {
  const mic = micView(input);
  if (input.live) {
    const remaining =
      input.remainingMs === null
        ? ""
        : ` · ${formatRemaining(input.remainingMs)}`;
    if (input.paused)
      return {
        phase: "paused",
        action: "resume",
        icon: "▶",
        label: `Paused · mic muted${remaining}`,
        ariaLabel:
          "Resume live session: unmute the microphone and Miette’s voice",
        mic,
      };
    if (!input.ready)
      return {
        phase: "connecting",
        action: "pause",
        icon: "⏸",
        label: "Connecting · microphone permission required",
        ariaLabel: "Pause live session: mute the microphone and Miette’s voice",
        mic,
      };
    return {
      phase: "live",
      action: "pause",
      icon: "⏸",
      label: `${labels[input.avatarState]}${remaining}`,
      ariaLabel: "Pause live session: mute the microphone and Miette’s voice",
      mic,
    };
  }
  if (input.demo)
    return {
      phase: "demo",
      action: "none",
      icon: "●",
      label: `${labels[input.avatarState]} (demo)`,
      ariaLabel: "Demo in progress · End session to start live voice",
      mic,
    };
  return {
    phase: "idle",
    action: input.liveAvailable ? "start" : "unavailable",
    icon: "●",
    label: labels[input.avatarState],
    ariaLabel: input.liveAvailable
      ? "Start a live voice session · parent approval required"
      : "Live voice unavailable · select for details",
    mic,
  };
}
