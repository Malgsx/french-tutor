import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_ICE_SERVERS, LIVE_LIMIT_MS, LiveSession } from "../src/live";
import type { AvatarState, LiveEvent } from "../src/protocol";

function harness(options: { resumeError?: boolean; closeOnBind?: boolean } = {}) {
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
  const peerConfigs: RTCConfiguration[] = [];
  class Peer {
    iceGatheringState = "complete";
    localDescription = { sdp: "fake-sdp" };
    constructor(config: RTCConfiguration = {}) {
      peerConfigs.push(config);
    }
    addTrack() {
      order.push("track");
    }
    createDataChannel(label: string) {
      assert.equal(label, "oai-events");
      order.push("channel");
      if (options.closeOnBind) queueMicrotask(() => channel.onclose());
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
    async resume() {
      if (options.resumeError) throw new Error("blocked");
    }
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
    autoplay: false,
    srcObject: null,
    play: async () => {},
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
    peerConfigs,
    channel,
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
    assert.equal(track.enabled, true, "mic track stays enabled after permission");
    assert.equal(audio.autoplay, true);
    assert.deepEqual(h.peerConfigs[0]?.iceServers, LIVE_ICE_SERVERS);
    assert.deepEqual(h.order, ["track", "channel", "offer"]);
    session.send({ type: "must-not-send" });
    assert.equal(sent.length, 0);
    await emit({ type: "session.started" });
    assert.equal(track.enabled, true);
    assert.match(h.notices.at(-1) ?? "", /Microphone ON/);
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

test("cut-in silences Miette, keeps the session and mic, and restores sound for her reply", async () => {
  const h = harness();
  const { session, sent, track, audio, emit } = h;
  const say = (
    role: "user" | "assistant",
    text: string,
    identity: { item_id?: string; response_id?: string } = {},
  ) =>
    emit({
      type:
        role === "user"
          ? "session.input_transcript.delta"
          : "session.output_transcript.delta",
      delta: text,
      start_ms: 0,
      end_ms: 100,
      ...identity,
    });
  try {
    await session.start();
    await emit({ type: "session.started" });
    await say("assistant", "Bonjour !", { item_id: "item_old" });
    session.interrupt();
    assert.equal(session.isSilenced, true);
    assert.equal(audio.muted, true, "playback stops immediately");
    assert.equal(track.enabled, true, "learner can talk right away");
    assert.equal(h.counters.closed, false, "session is not ended");
    const stop = sent.at(-1) as { type: string; content?: string };
    assert.equal(stop.type, "session.instructions.append");
    assert.match(stop.content!, /Stop speaking now/);
    assert.match(stop.content!, /French tutor/);
    assert.equal(h.states.at(-1), "listening");
    await say("assistant", "…tail of the interrupted answer", {
      item_id: "item_old",
    });
    assert.equal(audio.muted, true, "old answer stays quiet");
    await say("user", "Comment dit-on cat ?");
    assert.equal(audio.muted, true, "still quiet until she replies");
    await say("assistant", "Un chat !", { item_id: "item_new" });
    assert.equal(session.isSilenced, false);
    assert.equal(audio.muted, false, "reply is audible");
    session.interrupt();
    session.resumeAudio();
    assert.equal(audio.muted, false, "manual Resume audio works too");
    await say("user", "encore");
    await say("assistant", "Encore une fois", { item_id: "item_encore" });
    assert.equal(audio.muted, false);
    session.interrupt();
    session.pause();
    session.resume();
    assert.equal(audio.muted, true, "resume from pause keeps the cut-in");
    await say("user", "?");
    await say("assistant", "Oui", { item_id: "item_oui" });
    assert.equal(audio.muted, false);
    await emit({ type: "session.closed", reason: "close_requested" });
    assert.equal(h.counters.ended, true);
  } finally {
    h.restore();
  }
});

test("cut-in ignores a delayed old assistant delta after the learner speaks", async () => {
  const h = harness();
  const { session, audio, emit } = h;
  const say = (
    role: "user" | "assistant",
    text: string,
    identity: { item_id?: string; response_id?: string } = {},
  ) =>
    emit({
      type:
        role === "user"
          ? "session.input_transcript.delta"
          : "session.output_transcript.delta",
      delta: text,
      start_ms: role === "user" ? 400 : text.includes("late") ? 200 : 800,
      end_ms: role === "user" ? 500 : text.includes("late") ? 300 : 900,
      ...identity,
    });
  try {
    await session.start();
    await emit({ type: "session.started" });
    await say("assistant", "Bonjour les amis", {
      item_id: "item_old",
      response_id: "resp_old",
    });
    session.interrupt();
    await say("user", "Comment dit-on cat ?");
    assert.equal(audio.muted, true);
    await say("assistant", "…late tail of the interrupted answer", {
      item_id: "item_old",
      response_id: "resp_old",
    });
    assert.equal(session.isSilenced, true);
    assert.equal(audio.muted, true, "delayed old reply stays silent");
    await say("assistant", "Un chat !", {
      item_id: "item_new",
      response_id: "resp_new",
    });
    assert.equal(session.isSilenced, false);
    assert.equal(audio.muted, false, "new reply restores playback");
    await emit({ type: "session.closed", reason: "close_requested" });
  } finally {
    h.restore();
  }
});

test("pausing before the microphone is granted applies once the track arrives", async () => {
  const h = harness();
  const { session, track, audio, emit } = h;
  try {
    session.pause();
    assert.equal(session.isPaused, true);
    await session.start();
    assert.equal(track.enabled, false);
    assert.equal(audio.muted, true);
    await emit({ type: "session.started" });
    assert.equal(track.enabled, false, "ready does not unmute a paused start");
    assert.doesNotMatch(
      h.notices.at(-1) ?? "",
      /Microphone ON/,
      "status must not claim the mic is on while paused",
    );
    session.resume();
    assert.equal(track.enabled, true);
    assert.equal(audio.muted, false);
    assert.equal(h.states.at(-1), "listening");
  } finally {
    h.restore();
  }
});

test("AudioContext resume failure does not tear down the mic after permission", async () => {
  const h = harness({ resumeError: true });
  const { session, track } = h;
  try {
    await session.start();
    assert.equal(h.counters.ended, false);
    assert.equal(track.enabled, true);
    assert.match(h.notices.at(-1) ?? "", /connecting/);
  } finally {
    h.restore();
  }
});

test("a data-channel close before negotiation does not end the session", async () => {
  const h = harness({ closeOnBind: true });
  try {
    await h.session.start();
    assert.equal(h.counters.ended, false);
    assert.equal(h.track.enabled, true);
  } finally {
    h.restore();
  }
});

test("a rejected command or moderation error keeps the dialogue open; a startup error ends it", async () => {
  const h = harness();
  try {
    await h.session.start();
    await h.emit({ type: "session.started" });
    await h.emit({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "immutable_field_update",
        message: "The delegation type cannot change after session startup.",
        client_event_id: "evt_1",
      },
    } as LiveEvent);
    assert.equal(h.counters.ended, false, "session survives an error event");
    assert.equal(h.session.isReady, true);
    assert.equal(h.track.enabled, true, "mic keeps sending after the notice");
    assert.match(h.notices.at(-1) ?? "", /delegation type cannot change/);
    assert.match(h.notices.at(-1) ?? "", /session continues/);
    await h.emit({
      type: "session.output_transcript.delta",
      delta: "Bonjour !",
      start_ms: 0,
      end_ms: 400,
    });
    assert.equal(h.counters.ended, false);
    await h.emit({ type: "session.closed", reason: "content" });
    assert.equal(h.counters.ended, true, "only session.closed finalizes");
  } finally {
    h.restore();
  }
  const early = harness();
  try {
    await early.session.start();
    await early.emit({
      type: "error",
      error: { message: "Session could not be created." },
    } as LiveEvent);
    assert.equal(early.counters.ended, true);
    assert.match(early.notices.at(-1) ?? "", /Microphone OFF · Session could not be created/);
  } finally {
    early.restore();
  }
});
