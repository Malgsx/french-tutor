import {
  api,
  commentary,
  replyIdentities,
  transcript,
  type AvatarState,
  type Fragment,
  type LiveEvent,
} from "./protocol";

type Hooks = {
  state: (state: AvatarState) => void;
  notice: (text: string) => void;
  fragment: (fragment: Fragment) => void;
  ended: () => void;
  lesson: (context: string) => Promise<string>;
};
export const LIVE_LIMIT_MS = 600000;
export const LIVE_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
export class LiveSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private mic?: MediaStream;
  private context?: AudioContext;
  private meter?: ReturnType<typeof setInterval>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private ready = false;
  private negotiated = false;
  private closing = false;
  private disposed = false;
  // Pause, Mute mic and Interrupt are independent switches; apply() reconciles them.
  private paused = false;
  private micMuted = false;
  private silenced = false;
  // After a cut-in, playback returns only once the learner has spoken and the
  // newly started assistant reply arrives. Identity (item/reply id) distinguishes
  // that reply from delayed deltas of the interrupted answer.
  private cutIn: "none" | "waiting-for-learner" | "waiting-for-reply" = "none";
  private lastAssistantIds: string[] = [];
  private interruptedIds = new Set<string>();
  private cutInLearnerStartMs?: number;
  private deadline?: number;
  private history: Fragment[] = [];
  private delegations = new Set<string>();
  private pending = 0;
  constructor(
    private audio: HTMLAudioElement,
    private hooks: Hooks,
  ) {}
  get isReady() {
    return this.ready;
  }
  get isPaused() {
    return this.paused;
  }
  get isSilenced() {
    return this.silenced;
  }
  get isMicMuted() {
    return this.micMuted;
  }
  remainingMs() {
    return this.deadline === undefined
      ? null
      : Math.max(0, this.deadline - Date.now());
  }
  async start() {
    this.hooks.state("thinking");
    this.hooks.notice("Connecting · microphone permission required");
    try {
      this.audio.autoplay = true;
      this.audio.muted = false;
      void this.audio.play?.().catch(() => {});
      const peer = new RTCPeerConnection({ iceServers: LIVE_ICE_SERVERS });
      this.peer = peer;
      peer.ontrack = (event) => this.hear(event.track);
      peer.ondatachannel = ({ channel }) => this.bindChannel(channel);
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (this.disposed) {
        this.mic.getTracks().forEach((t) => t.stop());
        return;
      }
      this.hooks.notice("Microphone ON · connecting · audio is sent to OpenAI");
      this.mic.getAudioTracks().forEach((t) => peer.addTrack(t, this.mic!));
      this.apply();
      try {
        this.context = new AudioContext();
        await this.context.resume();
      } catch {
        this.context = undefined;
      }
      this.bindChannel(peer.createDataChannel("oai-events"));
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed")
          this.fail("Connection lost · final usage unconfirmed");
      };
      await peer.setLocalDescription(
        await peer.createOffer({ offerToReceiveAudio: true }),
      );
      if (peer.iceGatheringState !== "complete")
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            peer.removeEventListener("icegatheringstatechange", check);
            reject(new Error("ICE gathering timed out"));
          }, 10000);
          function check() {
            if (peer.iceGatheringState === "complete") {
              clearTimeout(timer);
              peer.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          }
          peer.addEventListener("icegatheringstatechange", check);
          check();
        });
      if (this.disposed) return;
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: peer.localDescription?.sdp,
          approved: true,
        }),
        signal: this.abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (this.disposed) return;
      await peer.setRemoteDescription({
        type: "answer",
        sdp: result.transport.sdp,
      });
      this.negotiated = true;
      // HTTP creation starts Live. Never send session.start or Realtime response events.
      if (!this.ready)
        this.readyTimer = setTimeout(
          () =>
            this.fail("Session did not become ready · final usage unconfirmed"),
          20000,
        );
    } catch (error) {
      if (!this.disposed)
        this.fail(
          error instanceof Error ? error.message : "Live startup failed",
        );
    }
  }
  private async receive(event: LiveEvent) {
    if (this.disposed) return;
    if (event.type === "session.closed") {
      this.hooks.notice(
        `Microphone OFF · session finalized (${event.reason ?? "closed"})`,
      );
      this.cleanup();
      return;
    }
    if (event.type === "error") {
      // Live emits error events for rejected commands and moderation cut-offs
      // while the session stays open; only session.closed or a lost transport
      // ends it. Before startup completes an error is a failed connection.
      const detail = event.error?.message ?? "Live reported an error";
      if (!this.ready) {
        this.fail(`${detail} · final usage unconfirmed`);
        return;
      }
      this.hooks.notice(
        `Microphone ON · Live notice: ${detail} · session continues`,
      );
      return;
    }
    if (this.closing) return;
    if (event.type === "session.started") {
      clearTimeout(this.readyTimer);
      this.ready = true;
      this.apply();
      this.hooks.notice(
        this.paused || this.micMuted
          ? this.paused
            ? "Paused · microphone MUTED and playback silenced · session open, live time still billed"
            : "Microphone MUTED · device track disabled · live time still billed"
          : "Microphone ON · speak naturally; you can interrupt · 10-minute limit",
      );
      this.send({
        type: "session.instructions.append",
        delegation_id: null,
        event_id: crypto.randomUUID(),
        content:
          "Greet immediately in French: Bonjour! Explain briefly that you are an AI tutor, then invite one short reply and listen.",
      });
      this.deadline = Date.now() + LIVE_LIMIT_MS;
      this.limitTimer = setTimeout(() => this.stop(), LIVE_LIMIT_MS);
    }
    const fragment = transcript(event);
    if (fragment) {
      this.history.push(fragment);
      this.history = this.history.slice(-500);
      this.hooks.fragment(fragment);
      if (fragment.role === "user" && this.cutIn === "waiting-for-learner") {
        this.cutIn = "waiting-for-reply";
        this.cutInLearnerStartMs = fragment.start_ms;
      } else if (fragment.role === "assistant") {
        const ids = replyIdentities(event);
        if (ids.length) this.lastAssistantIds = ids;
        if (this.cutIn === "waiting-for-learner")
          for (const id of ids) this.interruptedIds.add(id);
        else if (
          this.cutIn === "waiting-for-reply" &&
          this.isNewAssistantReply(event, fragment)
        ) {
          this.clearCutIn();
          this.silenced = false;
          this.apply();
          this.hooks.notice(
            "Miette is answering · playback back on · you can interrupt again",
          );
        }
      }
    }
    if (
      event.type === "session.delegation.created" &&
      event.delegation?.target === "client"
    ) {
      const id = event.delegation.id;
      if (this.delegations.has(id)) return;
      this.delegations.add(id);
      this.pending++;
      // Metadata has no task text. Supply in-memory conversation plus current UI lesson.
      try {
        const result = await this.hooks.lesson(
          this.history
            .map((f) => `${f.role}: ${f.text}`)
            .join("")
            .slice(-4000),
        );
        if (!this.closing && !this.disposed) this.send(commentary(result, id));
      } finally {
        this.pending--;
      }
    }
  }
  private hear(track: MediaStreamTrack) {
    this.audio.autoplay = true;
    this.audio.srcObject = new MediaStream([track]);
    void this.audio.play?.().catch(() =>
      this.hooks.notice(
        "Microphone ON · press play in the audio controls to hear Miette.",
      ),
    );
    if (!this.context) return;
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    this.context
      .createMediaStreamSource(this.audio.srcObject as MediaStream)
      .connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let lastSound = 0;
    this.meter = setInterval(() => {
      if (!this.ready || this.closing || this.paused) return;
      analyser.getByteTimeDomainData(data);
      if (
        data.some((value) => Math.abs(value - 128) > 5) &&
        !this.audio.muted &&
        !this.audio.paused
      )
        lastSound = Date.now();
      this.hooks.state(
        Date.now() - lastSound < 220
          ? "speaking"
          : this.pending
            ? "thinking"
            : "listening",
      );
    }, 100);
  }
  private bindChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onmessage = ({ data }) => {
      try {
        void this.receive(JSON.parse(data) as LiveEvent).catch(() =>
          this.fail(
            "Lesson delegation failed. End the session and try demo mode.",
          ),
        );
      } catch {
        this.fail("Invalid session event.");
      }
    };
    channel.onclose = () => {
      if (!this.disposed && (this.ready || this.negotiated))
        this.fail("Disconnected · final usage unconfirmed");
    };
  }
  send(event: object) {
    if (this.ready && !this.closing && this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(event));
  }
  private apply() {
    const micOn = !this.micMuted && !this.paused && !this.closing;
    this.mic?.getTracks().forEach((track) => {
      track.enabled = micOn;
    });
    this.audio.muted = this.silenced || this.paused || this.closing;
  }
  mute(muted: boolean) {
    if (this.closing || this.disposed) return;
    this.micMuted = muted;
    this.apply();
    this.hooks.notice(
      muted
        ? "Microphone MUTED · device track disabled · live time still billed"
        : this.paused
          ? "Paused · microphone stays muted until you press play"
          : "Microphone ON · speak naturally; you can interrupt",
    );
  }
  // Pause is local only: the mic track and playback are muted while the session
  // stays open so play resumes instantly. No stop instruction is sent because
  // instruction appends are unacknowledged and could not confirm the model stopped.
  pause() {
    if (this.closing || this.disposed || this.paused) return;
    this.paused = true;
    this.apply();
    this.hooks.state("idle");
    this.hooks.notice(
      "Paused · microphone MUTED and playback silenced · session open, live time still billed",
    );
  }
  resume() {
    if (this.closing || this.disposed || !this.paused) return;
    this.paused = false;
    this.apply();
    this.hooks.state(this.ready ? "listening" : "thinking");
    this.hooks.notice(
      this.micMuted
        ? "Resumed · microphone still MUTED · select Unmute mic to speak"
        : "Microphone ON · speak naturally; you can interrupt",
    );
  }
  // Cut-in: silence playback immediately and ask the model to stop. The append
  // is unacknowledged, so the local mute is what guarantees quiet; the model
  // itself also stops on server-side voice interruption when the learner talks.
  private isNewAssistantReply(event: LiveEvent, fragment: Fragment) {
    const ids = replyIdentities(event);
    if (ids.length)
      return ids.some((id) => !this.interruptedIds.has(id));
    return (
      this.cutInLearnerStartMs !== undefined &&
      fragment.start_ms > this.cutInLearnerStartMs
    );
  }
  private clearCutIn() {
    this.cutIn = "none";
    this.interruptedIds.clear();
    this.cutInLearnerStartMs = undefined;
  }
  interrupt() {
    if (this.closing || this.disposed) return;
    this.silenced = true;
    this.cutIn = "waiting-for-learner";
    this.interruptedIds = new Set(this.lastAssistantIds);
    this.cutInLearnerStartMs = undefined;
    this.apply();
    this.send({
      type: "session.instructions.append",
      delegation_id: null,
      event_id: crypto.randomUUID(),
      content:
        "The learner interrupted you. Stop speaking now and listen. Do not repeat the interrupted answer. When they speak, answer their question briefly as their French tutor: simple French first, a short English explanation if helpful, one gentle correction at most, then invite them to continue practising.",
    });
    if (this.ready && !this.paused) this.hooks.state("listening");
    this.hooks.notice(
      "Miette silenced · your turn, speak now · her reply plays automatically (Resume audio brings sound back sooner)",
    );
  }
  resumeAudio() {
    if (this.closing || this.disposed) return;
    this.silenced = false;
    this.clearCutIn();
    this.apply();
  }
  stop() {
    if (this.disposed || this.closing) return;
    if (!this.ready) {
      this.hooks.notice(
        "Startup cancelled · any initialization charge is unconfirmed",
      );
      this.cleanup();
      return;
    }
    this.channel?.send(JSON.stringify({ type: "session.close" }));
    this.closing = true;
    this.apply();
    this.hooks.notice("Microphone MUTED · ending session…");
    this.closeTimer = setTimeout(
      () =>
        this.fail("Microphone OFF · close timed out; final usage unconfirmed"),
      15000,
    );
  }
  private fail(message: string) {
    this.hooks.notice(`Microphone OFF · ${message}`);
    this.cleanup();
    this.hooks.state("error");
  }
  dispose() {
    if (!this.disposed) {
      this.stop();
      this.cleanup();
    }
  }
  private cleanup() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.negotiated = false;
    this.abort.abort();
    clearTimeout(this.readyTimer);
    clearTimeout(this.closeTimer);
    clearTimeout(this.limitTimer);
    clearInterval(this.meter);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.channel?.close();
    this.peer?.close();
    void this.context?.close();
    this.audio.srcObject = null;
    this.audio.muted = false;
    this.history = [];
    this.hooks.state("idle");
    this.hooks.ended();
  }
}

export async function delegatedLesson(index: number, text: string) {
  return (
    await api<{ text: string }>("lesson", { action: "delegate", index, text })
  ).text;
}
