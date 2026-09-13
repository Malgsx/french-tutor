import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_LIMIT_MS, LiveSession } from "../src/live";
import type { AvatarState, LiveEvent } from "../src/protocol";

function harness() {
  const sent: { type: string; delegation_id?: string }[] = [];
  const states: AvatarState[] = [];
  const notices: string[] = [];
  const counters = { stopped: 0, closed: false, ended: false };
  const track = { enabled: true, stop: () => counters.stopped++ };
  const channel = {
    readyState: "open",
    onmessage: (_event: { data: string }) => {
      void _event;
    },
    onclose: () => {},
    send: (text: string) => sent.push(JSON.parse(text)),
    close: () => {
      counters.closed = true;
    },
  };
  const order: string[] = [];
  class Peer {
    iceGatheringState = "complete";
    localDescription = { sdp: "fake-sdp" };
    addTrack() {
      order.push("track");
    }
    createDataChannel(label: string) {
      assert.equal(label, "oai-events");
      order.push("channel");
      return channel;
    }
    async createOffer() {
      order.push("offer");
      return {};
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    close() {
      counters.closed = true;
    }
  }
  class Audio {
    async resume() {}
    async close() {}
  }
  const originals = [
    "RTCPeerConnection",
    "AudioContext",
    "navigator",
    "fetch",
  ].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const replace = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  replace("RTCPeerConnection", Peer);
  replace("AudioContext", Audio);
  replace("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    },
  });
  replace("fetch", async () =>
    Response.json({
      session: { id: "live_test" },
      transport: { sdp: "answer" },
    }),
  );
  const emit = async (event: LiveEvent) => {
    channel.onmessage({ data: JSON.stringify(event) });
    await new Promise((r) => setImmediate(r));
  };
  let resolveLesson: (value: string) => void = () => {};
  const audio = {
    muted: false,
    srcObject: null,
  } as unknown as HTMLAudioElement;
  const session = new LiveSession(audio, {
    state: (state) => states.push(state),
    notice: (text) => notices.push(text),
    fragment: () => {},
    ended: () => {
      counters.ended = true;
    },
    lesson: () =>
      new Promise<string>((r) => {
        resolveLesson = r;
      }),
  });
  const restore = () => {
    session.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  return {
    session,
    sent,
    states,
    notices,
    counters,
    track,
    audio,
    order,
    emit,
    resolveLesson: (value: string) => resolveLesson(value),
    restore,
  };
}

test("WebRTC readiness, exact delegation IDs, mute, late work and graceful close", async () => {
  const h = harness();
  const { session, sent, track, audio, emit } = h;
  try {
    await session.start();
    assert.deepEqual(h.order, ["track", "channel", "offer"]);
    session.send({ type: "must-not-send" });
    assert.equal(sent.length, 0);
    await emit({ type: "session.started" });
    assert.equal(sent[0].type, "session.instructions.append");
    assert.equal(
      sent.some((e) => e.type === "session.start"),
      false,
    );
    session.mute(true);
    assert.equal(track.enabled, false);
    session.mute(false);
    assert.equal(track.enabled, true);
    session.interrupt();
    assert.equal(audio.muted, true);
    session.resumeAudio();
    assert.equal(audio.muted, false);
    await emit({
      type: "session.delegation.created",
      delegation: { id: "item_exact", target: "client" },
    });
    h.resolveLesson("A verified lesson");
    await new Promise((r) => setImmediate(r));
    assert.equal(sent.at(-1)?.delegation_id, "item_exact");
    const beforeDuplicate = sent.length;
    await emit({
      type: "session.delegation.created",
      delegation: { id: "item_exact", target: "client" },
    });
    assert.equal(sent.length, beforeDuplicate);
    await emit({
      type: "session.delegation.created",
      delegation: { id: "item_late", target: "client" },
    });
    session.stop();
    assert.equal(sent.at(-1)?.type, "session.close");
    assert.equal(track.enabled, false);
    assert.equal(h.counters.stopped, 0);
    assert.equal(h.counters.closed, false);
    session.mute(false);
    assert.equal(track.enabled, false);
    h.resolveLesson("Late result must not be spoken");
    await new Promise((r) => setImmediate(r));
    assert.equal(sent.at(-1)?.type, "session.close");
    await emit({ type: "session.closed", reason: "close_requested" });
    assert.equal(h.counters.stopped, 1);
    assert.equal(h.counters.ended, true);
    assert.equal(h.counters.closed, true);
  } finally {
    h.restore();
  }
});

test("pause keeps the session open, mutes mic and playback, and play resumes instantly", async () => {
  const h = harness();
  const { session, sent, track, audio, emit } = h;
  try {
    assert.equal(session.isReady, false);
    assert.equal(session.remainingMs(), null);
    await session.start();
    await emit({ type: "session.started" });
    assert.equal(session.isReady, true);
    const remaining = session.remainingMs();
    assert.ok(remaining !== null && remaining <= LIVE_LIMIT_MS);
    assert.ok(remaining! > LIVE_LIMIT_MS - 5000);
    const before = sent.length;
    session.pause();
    assert.equal(session.isPaused, true);
    assert.equal(track.enabled, false, "mic track disabled while paused");
    assert.equal(audio.muted, true, "playback silenced while paused");
    assert.equal(h.states.at(-1), "idle");
    assert.equal(sent.length, before, "pause sends nothing over the channel");
    assert.equal(h.counters.stopped, 0, "device track kept for instant resume");
    assert.equal(h.counters.closed, false, "session stays open");
    session.mute(false);
    assert.equal(track.enabled, false, "Unmute mic cannot bypass pause");
    session.resume();
    assert.equal(session.isPaused, false);
    assert.equal(track.enabled, true);
    assert.equal(audio.muted, false);
    assert.equal(h.states.at(-1), "listening");
    session.mute(true);
    session.pause();
    session.resume();
    assert.equal(track.enabled, false, "resume honors an explicit mic mute");
    session.mute(false);
    session.interrupt();
    session.pause();
    session.resume();
    assert.equal(audio.muted, true, "resume honors an explicit interrupt");
    session.resumeAudio();
    assert.equal(audio.muted, false);
    session.pause();
    session.stop();
    assert.equal(sent.at(-1)?.type, "session.close");
    session.resume();
    assert.equal(session.isPaused, true, "no resume while closing");
    assert.equal(track.enabled, false);
    await emit({ type: "session.closed", reason: "close_requested" });
    assert.equal(h.counters.ended, true);
    assert.equal(h.counters.stopped, 1);
  } finally {
    h.restore();
  }
});

test("pausing before the microphone is granted applies once the track arrives", async () => {
  const h = harness();
  const { session, track, audio } = h;
  try {
    session.pause();
    assert.equal(session.isPaused, true);
    await session.start();
    assert.equal(track.enabled, false);
    assert.equal(audio.muted, true);
    session.resume();
    assert.equal(track.enabled, true);
    assert.equal(audio.muted, false);
    assert.equal(h.states.at(-1), "thinking", "still connecting after resume");
  } finally {
    h.restore();
  }
});
