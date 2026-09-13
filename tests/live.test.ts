import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveSession } from "../src/live";
import type { LiveEvent } from "../src/protocol";

test("WebRTC readiness, exact delegation IDs, mute, late work and graceful close", async () => {
  const sent: { type: string; delegation_id?: string }[] = [];
  let stopped = 0,
    closed = false,
    ended = false;
  const track = { enabled: true, stop: () => stopped++ };
  const channel = {
    readyState: "open",
    onmessage: (_event: { data: string }) => {
      void _event;
    },
    onclose: () => {},
    send: (text: string) => sent.push(JSON.parse(text)),
    close: () => {
      closed = true;
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
      closed = true;
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
    state: () => {},
    notice: () => {},
    fragment: () => {},
    ended: () => {
      ended = true;
    },
    lesson: () =>
      new Promise<string>((r) => {
        resolveLesson = r;
      }),
  });
  try {
    await session.start();
    assert.deepEqual(order, ["track", "channel", "offer"]);
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
    resolveLesson("A verified lesson");
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
    assert.equal(stopped, 0);
    assert.equal(closed, false);
    session.mute(false);
    assert.equal(track.enabled, false);
    resolveLesson("Late result must not be spoken");
    await new Promise((r) => setImmediate(r));
    assert.equal(sent.at(-1)?.type, "session.close");
    await emit({ type: "session.closed", reason: "close_requested" });
    assert.equal(stopped, 1);
    assert.equal(ended, true);
    assert.equal(closed, true);
  } finally {
    session.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
