import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatRemaining,
  labels,
  micView,
  stageView,
  type StageInput,
} from "../src/stage";

const idle: StageInput = {
  live: false,
  ready: false,
  paused: false,
  demo: false,
  liveAvailable: true,
  avatarState: "idle",
  remainingMs: null,
};

test("idle pill starts live when available and explains when it is not", () => {
  const ready = stageView(idle);
  assert.equal(ready.phase, "idle");
  assert.equal(ready.action, "start");
  assert.equal(ready.label, "Idle · ready when you are");
  assert.match(ready.ariaLabel, /Start a live voice session/);
  const unavailable = stageView({ ...idle, liveAvailable: false });
  assert.equal(unavailable.phase, "idle");
  assert.equal(unavailable.action, "unavailable");
  assert.equal(unavailable.label, "Idle · ready when you are");
  assert.match(unavailable.ariaLabel, /unavailable/);
  // After a failed session the avatar shows an error but the pill can start again.
  const afterError = stageView({ ...idle, avatarState: "error" });
  assert.equal(afterError.action, "start");
  assert.equal(afterError.label, labels.error);
});

test("demo mode keeps the pill informational", () => {
  const demo = stageView({ ...idle, demo: true, avatarState: "listening" });
  assert.equal(demo.phase, "demo");
  assert.equal(demo.action, "none");
  assert.equal(demo.label, "Listening · your turn (demo)");
});

test("idle -> connecting -> live -> paused -> live transitions", () => {
  const connecting = stageView({ ...idle, live: true, avatarState: "thinking" });
  assert.equal(connecting.phase, "connecting");
  assert.equal(connecting.action, "pause");
  assert.equal(connecting.icon, "⏸");
  const live = stageView({
    ...idle,
    live: true,
    ready: true,
    avatarState: "listening",
    remainingMs: 572000,
  });
  assert.equal(live.phase, "live");
  assert.equal(live.action, "pause");
  assert.equal(live.label, "Listening · your turn · 9:32 left");
  assert.match(live.ariaLabel, /^Pause live session/);
  const paused = stageView({
    ...idle,
    live: true,
    ready: true,
    paused: true,
    avatarState: "idle",
    remainingMs: 61000,
  });
  assert.equal(paused.phase, "paused");
  assert.equal(paused.action, "resume");
  assert.equal(paused.icon, "▶");
  assert.equal(paused.label, "Paused · mic muted · 1:01 left");
  assert.match(paused.ariaLabel, /^Resume live session/);
  const resumed = stageView({
    ...idle,
    live: true,
    ready: true,
    avatarState: "speaking",
    remainingMs: 60000,
  });
  assert.equal(resumed.phase, "live");
  assert.equal(resumed.label, "Speaking · jump in anytime · 1:00 left");
  const ended = stageView({ ...idle, avatarState: "idle" });
  assert.equal(ended.action, "start");
});

test("microphone button mirrors the pill and adds cut-in while Miette speaks", () => {
  const start = micView(idle);
  assert.equal(start.state, "idle");
  assert.equal(start.action, "start");
  assert.match(start.ariaLabel, /Start a live voice conversation/);
  assert.match(start.ariaLabel, /parent approval/);
  const off = micView({ ...idle, liveAvailable: false });
  assert.equal(off.state, "unavailable");
  assert.equal(off.action, "unavailable");
  const demo = micView({ ...idle, demo: true });
  assert.equal(demo.state, "demo");
  assert.equal(demo.action, "none");
  const connecting = micView({ ...idle, live: true, avatarState: "thinking" });
  assert.equal(connecting.state, "connecting");
  assert.equal(connecting.action, "pause");
  const listening = micView({
    ...idle,
    live: true,
    ready: true,
    avatarState: "listening",
  });
  assert.equal(listening.state, "listening");
  assert.equal(listening.action, "pause");
  assert.match(listening.ariaLabel, /listening/);
  const speaking = micView({
    ...idle,
    live: true,
    ready: true,
    avatarState: "speaking",
  });
  assert.equal(speaking.state, "speaking");
  assert.equal(speaking.action, "interrupt");
  assert.match(speaking.ariaLabel, /interrupt/);
  const paused = micView({
    ...idle,
    live: true,
    ready: true,
    paused: true,
    avatarState: "speaking",
  });
  assert.equal(paused.state, "paused");
  assert.equal(paused.action, "resume");
  // Both controls derive from one input, so pause state can never disagree.
  const view = stageView({ ...idle, live: true, ready: true, paused: true });
  assert.equal(view.phase, "paused");
  assert.equal(view.mic.state, "paused");
  assert.equal(view.action, view.mic.action);
});

test("remaining time formatting rounds up and never goes negative", () => {
  assert.equal(formatRemaining(600000), "10:00 left");
  assert.equal(formatRemaining(59001), "1:00 left");
  assert.equal(formatRemaining(500), "0:01 left");
  assert.equal(formatRemaining(-20), "0:00 left");
});
