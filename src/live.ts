import {
  api,
  commentary,
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
  private closing = false;
  private disposed = false;
  private history: Fragment[] = [];
  private delegations = new Set<string>();
  private pending = 0;
  constructor(
    private audio: HTMLAudioElement,
    private hooks: Hooks,
  ) {}
  async start() {
    this.hooks.state("thinking");
    this.hooks.notice("Connecting · microphone permission required");
    try {
      const peer = new RTCPeerConnection();
      this.peer = peer;
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
      this.context = new AudioContext();
      await this.context.resume();
      peer.ontrack = (event) => {
        this.audio.srcObject = new MediaStream([event.track]);
        void this.audio
          .play()
          .catch(() =>
            this.hooks.notice(
              "Microphone ON · press play in the audio controls to hear Miette.",
            ),
          );
        const analyser = this.context!.createAnalyser();
        analyser.fftSize = 256;
        this.context!.createMediaStreamSource(
          this.audio.srcObject as MediaStream,
        ).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let lastSound = 0;
        this.meter = setInterval(() => {
          if (!this.ready || this.closing) return;
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
      };
      this.channel = peer.createDataChannel("oai-events");
      this.channel.onmessage = ({ data }) => {
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
      this.channel.onclose = () => {
        if (!this.disposed) this.fail("Disconnected · final usage unconfirmed");
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed")
          this.fail("Connection lost · final usage unconfirmed");
      };
      await peer.setLocalDescription(await peer.createOffer());
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
      this.fail("Live reported an error · final usage unconfirmed");
      return;
    }
    if (this.closing) return;
    if (event.type === "session.started") {
      clearTimeout(this.readyTimer);
      this.ready = true;
      this.hooks.notice(
        "Microphone ON · speak naturally; you can interrupt · 10-minute limit",
      );
      this.send({
        type: "session.instructions.append",
        delegation_id: null,
        event_id: crypto.randomUUID(),
        content:
          "Greet immediately in French: Bonjour! Explain briefly that you are an AI tutor, then invite one short reply and listen.",
      });
      this.limitTimer = setTimeout(() => this.stop(), 600000);
    }
    const fragment = transcript(event);
    if (fragment) {
      this.history.push(fragment);
      this.history = this.history.slice(-500);
      this.hooks.fragment(fragment);
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
  send(event: object) {
    if (this.ready && !this.closing && this.channel?.readyState === "open")
      this.channel.send(JSON.stringify(event));
  }
  mute(muted: boolean) {
    if (this.closing || this.disposed) return;
    this.mic?.getTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.hooks.notice(
      muted
        ? "Microphone MUTED · device track disabled · live time still billed"
        : "Microphone ON · speak naturally; you can interrupt",
    );
  }
  interrupt() {
    this.audio.muted = true;
    this.send({
      type: "session.instructions.append",
      delegation_id: null,
      event_id: crypto.randomUUID(),
      content:
        "Stop speaking now and wait for the learner. Do not repeat the interrupted answer.",
    });
    this.hooks.notice(
      "Playback silenced · microphone unchanged · select Resume audio when ready",
    );
  }
  resumeAudio() {
    if (this.closing || this.disposed) return;
    this.audio.muted = false;
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
    this.mic?.getTracks().forEach((t) => {
      t.enabled = false;
    });
    this.audio.muted = true;
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
