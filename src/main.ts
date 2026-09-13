import "./style.css";
import { createAvatar } from "./avatar";
import { api, commentary, type AvatarState, type Fragment } from "./protocol";
import { LiveSession, delegatedLesson } from "./live";
import { stageView, UNAVAILABLE_REASON, type MicAction } from "./stage";
import { speakDemo } from "./voice";
import {
  Recorder,
  renderTranscripts,
  type TranscriptArchive,
} from "./transcripts";
import type { Settings, Progress, Word, Plan } from "../server/lesson";

declare global {
  interface Window {
    desktop?: {
      compact: (value: boolean) => void;
      hide: () => void;
      onSuspend: (callback: () => void) => void;
    };
  }
}
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
type Snapshot = {
  settings: Settings;
  progress: Progress;
  words: Word[];
  planTitle: string | null;
  liveAvailable: boolean;
};
let snapshot: Snapshot;
let index = 0;
let demo = false;
let live: LiveSession | undefined;
let revision = 0;
let muted = false;
let animationTimer: ReturnType<typeof setTimeout>;
let stageTimer: ReturnType<typeof setInterval> | undefined;
let avatarState: AvatarState = "idle";
const captions = new Map<string, HTMLElement>();
let lastSpoken = "";
function speakMiette(text: string) {
  lastSpoken = text;
  speakDemo(text);
}
const recorder = new Recorder(() => !!snapshot?.settings.retainTranscripts);
let avatar: ReturnType<typeof createAvatar> | undefined;
try {
  avatar = createAvatar(el("avatar"));
} catch {
  el("avatar").textContent =
    "✦ Miette · 3D unavailable on this device. Chat still works.";
}
function currentStage() {
  return stageView({
    live: !!live,
    ready: live?.isReady ?? false,
    paused: live?.isPaused ?? false,
    demo,
    liveAvailable: !!snapshot?.liveAvailable,
    avatarState,
    remainingMs: live?.remainingMs() ?? null,
    micMuted: live?.isMicMuted ?? muted,
  });
}
function renderStage() {
  const view = currentStage();
  const toggle = el<HTMLButtonElement>("stage-toggle");
  el("state-dot").textContent = view.icon;
  el("state-label").textContent = view.label;
  toggle.dataset.phase = view.phase;
  toggle.setAttribute("aria-label", view.ariaLabel);
  toggle.title = view.ariaLabel;
  toggle.disabled = view.action === "none";
  el("avatar").classList.toggle("actionable", view.action !== "none");
  const mic = el<HTMLButtonElement>("mic");
  mic.dataset.mic = view.mic.state;
  mic.setAttribute("aria-label", view.mic.ariaLabel);
  mic.title = view.mic.ariaLabel;
  mic.disabled = view.mic.action === "none";
  el("mic-caption").textContent = view.mic.caption;
  el("interrupt").textContent = live?.isSilenced ? "Resume audio" : "Interrupt";
  if (live && !stageTimer) stageTimer = setInterval(renderStage, 1000);
  if (!live && stageTimer) {
    clearInterval(stageTimer);
    stageTimer = undefined;
  }
}
function hint(target: "stage-hint" | "mic-hint", text: string) {
  el(target).textContent = text;
  el(target).hidden = !text;
}
function clearHints() {
  hint("stage-hint", "");
  hint("mic-hint", "");
}
function press(action: MicAction, hintTarget: "stage-hint" | "mic-hint") {
  clearHints();
  switch (action) {
    case "start":
      liveDialog.showModal();
      break;
    case "unavailable":
      hint(hintTarget, UNAVAILABLE_REASON);
      break;
    case "pause":
      live?.pause();
      break;
    case "resume":
      live?.resume();
      break;
    case "interrupt":
      live?.interrupt();
      break;
    case "replay":
      speakDemo(lastSpoken || el("bubble").textContent || "");
      break;
  }
  renderStage();
}
const stagePress = () => press(currentStage().action, "stage-hint");
const micPress = () => press(currentStage().mic.action, "mic-hint");
function setState(state: AvatarState) {
  avatarState = state;
  avatar?.setState(state);
  el("avatar").dataset.state = state;
  el("avatar").setAttribute("aria-label", `Miette, ${state}`);
  renderStage();
}
function notice(text: string) {
  el("status").textContent = text;
}
function report(error: unknown, target = "status") {
  el(target).textContent =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  if (target === "status") setState("error");
}
function message(role: string, text: string) {
  const log = el("messages");
  const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const row = document.createElement("p");
  row.className = `message ${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "YOU / " : "MIETTE / ";
  row.append(label, document.createTextNode(text));
  log.append(row);
  while (log.children.length > 100) log.firstElementChild?.remove();
  if (follow) log.scrollTop = log.scrollHeight;
}
function fragment(fragment: Fragment) {
  // Independent, revisable speaker streams; never pretend deltas are completed turns.
  let node = captions.get(fragment.role);
  if (!node) {
    node = document.createElement("p");
    node.className = "message";
    node.textContent = `${fragment.role === "user" ? "YOU" : "MIETTE"} / live captions: `;
    captions.set(fragment.role, node);
    el("messages").append(node);
  }
  node.append(document.createTextNode(fragment.text));
  if (node.textContent!.length > 10000)
    node.textContent = node.textContent!.slice(-8000);
  void recorder
    .save([
      {
        role: fragment.role,
        text: fragment.text.slice(0, 2000),
        start_ms: fragment.start_ms,
        end_ms: fragment.end_ms,
      },
    ])
    .catch((error) => report(error));
}
function controls() {
  const active = demo || !!live;
  for (const id of ["answer", "send", "repeat", "hint", "next"])
    el<HTMLButtonElement>(id).disabled = !active;
  el<HTMLInputElement>("answer").placeholder =
    active && snapshot
      ? `How do you say “${snapshot.words[index].en}” in French?`
      : "Choose Start demo to enable typing";
  el<HTMLButtonElement>("start").disabled = active;
  el<HTMLButtonElement>("live").disabled = active || !snapshot?.liveAvailable;
  el("end").hidden = !active;
  el("mute").hidden = !live;
  el("interrupt").hidden = !live;
  el("audio").hidden = !live;
  el("mode").textContent = live
    ? "● LIVE · CHECK MIC BELOW"
    : "● DEMO · NO MICROPHONE";
  el("retention").textContent = snapshot?.settings.retainTranscripts
    ? "Saved · parent enabled"
    : "Not saved";
  renderStage();
}
async function refresh() {
  snapshot = await api<Snapshot>("state");
  index = Math.min(index, snapshot.words.length - 1);
  el("words").replaceChildren();
  snapshot.words.forEach((word, i) => {
    const button = document.createElement("button");
    button.className = "word";
    button.setAttribute("aria-pressed", String(i === index));
    const content = document.createElement("span"),
      name = document.createElement("strong"),
      meaning = document.createElement("small");
    name.textContent = word.fr;
    name.lang = "fr";
    meaning.textContent = word.en;
    content.append(name, meaning);
    const marker = document.createElement("span");
    marker.className = "word-marker";
    marker.textContent = snapshot.progress.practiced.includes(word.fr)
      ? "✓"
      : "↗";
    button.append(content, marker);
    button.onclick = () => {
      index = i;
      void choose();
    };
    el("words").append(button);
  });
  el("lesson-title").textContent = snapshot.planTitle ?? "Meet & greet";
  el("lesson-description").textContent = snapshot.planTitle
    ? "Your approved school mission. Demo practices imported pairs; live follows the lesson text."
    : "A few words. A good first impression. Pick a word, then give it a shot.";
  const count = snapshot.words.filter((w) =>
    snapshot.progress.practiced.includes(w.fr),
  ).length;
  el("progress-label").textContent =
    `${count} / ${snapshot.words.length} words practiced`;
  el<HTMLProgressElement>("progress").max = snapshot.words.length;
  el<HTMLProgressElement>("progress").value = count;
  controls();
}
async function choose() {
  revision++;
  clearTimeout(animationTimer);
  await refresh();
  if (demo || live) await lesson("start");
}
async function lesson(action: string, text = "") {
  const current = ++revision;
  clearTimeout(animationTimer);
  setState("thinking");
  try {
    const result = await api<{ text: string; state: AvatarState }>("lesson", {
      action,
      index,
      text,
      session: recorder.session,
    });
    if (current !== revision) return;
    message("assistant", result.text);
    el("bubble").textContent =
      action === "answer" ? "Every attempt counts." : "À toi ! Your turn.";
    if (demo) speakMiette(result.text);
    setState(result.state);
    if (live) live.send(commentary(result.text));
    await refresh();
    if (demo)
      animationTimer = setTimeout(
        () => setState("listening"),
        result.state === "speaking" ? 1800 : 5000,
      );
  } catch (error) {
    if (current === revision) report(error);
  }
}
el("start").onclick = () => {
  demo = true;
  recorder.start("demo");
  el("messages").replaceChildren();
  notice("Demo · simulated voice states, text practice only · microphone OFF");
  controls();
  el<HTMLInputElement>("answer").focus();
  void lesson("start");
};
el("repeat").onclick = () => void lesson("repeat");
el("hint").onclick = () => void lesson("hint");
el("next").onclick = () => {
  index = (index + 1) % snapshot.words.length;
  void choose();
};
el("answer-form").onsubmit = (event) => {
  event.preventDefault();
  const input = el<HTMLInputElement>("answer");
  const text = input.value.trim();
  if (!text || !(demo || live)) return;
  message("user", text);
  input.value = "";
  void lesson("answer", text);
};
function end() {
  revision++;
  clearTimeout(animationTimer);
  if (live) {
    live.stop();
    return;
  }
  demo = false;
  lastSpoken = "";
  globalThis.speechSynthesis?.cancel();
  void recorder.finish().catch((error) => report(error));
  el("messages").replaceChildren();
  captions.clear();
  setState("idle");
  notice("Microphone OFF · session captions cleared");
  controls();
}
el("end").onclick = end;
el("mute").onclick = () => {
  muted = !muted;
  live?.mute(muted);
  el("mute").textContent = muted ? "Unmute mic" : "Mute mic";
};
el("interrupt").onclick = () => {
  if (live?.isSilenced) live.resumeAudio();
  else live?.interrupt();
  renderStage();
};

const parentDialog = el<HTMLDialogElement>("parent-dialog");
async function openParent() {
  if (live) {
    notice(
      "End the live session before changing settings or school materials.",
    );
    return;
  }
  if (demo) end();
  el("parent-status").textContent = "Loading settings…";
  el("settings-status").textContent = "";
  el("parent-content").hidden = true;
  parentDialog.showModal();
  try {
    await refresh();
    for (const key of ["age", "support", "difficulty"] as const)
      el<HTMLSelectElement>(key).value = snapshot.settings[key];
    el<HTMLInputElement>("retain").checked =
      snapshot.settings.retainTranscripts;
    const plan = await api<Plan | null>("plan");
    el<HTMLInputElement>("plan-title").value = plan?.title ?? "";
    el<HTMLTextAreaElement>("plan-text").value = plan?.text ?? "";
    el("parent-content").hidden = false;
    el("parent-status").textContent = "";
  } catch (error) {
    report(error, "parent-status");
  }
}
el("parents").onclick = () => void openParent();
el("school").onclick = () => void openParent();
el("close-parent").onclick = () => parentDialog.close();
parentDialog.onclose = () => {
  el<HTMLTextAreaElement>("plan-text").value = "";
  el("saved-transcripts").textContent = "";
};
el("settings-form").oninput = () => {
  el("settings-status").textContent = "Unsaved changes — choose Save settings.";
};
el("settings-form").onsubmit = async (event) => {
  event.preventDefault();
  const fields = el("settings-form").querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement
  >("input, select, button");
  fields.forEach((field) => (field.disabled = true));
  el("settings-status").textContent = "Saving settings…";
  try {
    await api("settings", {
      age: el<HTMLSelectElement>("age").value,
      support: el<HTMLSelectElement>("support").value,
      difficulty: el<HTMLSelectElement>("difficulty").value,
      retainTranscripts: el<HTMLInputElement>("retain").checked,
    });
    await refresh();
    el("settings-status").textContent =
      "Settings saved. New voice sessions use these preferences.";
  } catch (error) {
    report(error, "settings-status");
  } finally {
    fields.forEach((field) => (field.disabled = false));
    el("settings-status").scrollIntoView({ block: "nearest" });
  }
};
el("document").onchange = async () => {
  const input = el<HTMLInputElement>("document"),
    file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Choose a file smaller than 5 MB.");
    el("parent-status").textContent = "Extracting text locally…";
    const format = file.name.split(".").pop()?.toLowerCase();
    const response = await fetch(`/api/plan/extract?format=${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    el<HTMLTextAreaElement>("plan-text").value = result.text;
    el("parent-status").textContent =
      "Text ready. Review, remove private details, add a title, then approve. Nothing saved yet.";
  } catch (error) {
    report(error, "parent-status");
  } finally {
    input.value = "";
  }
};
el("save-plan").onclick = async () => {
  try {
    await api("plan", {
      title: el<HTMLInputElement>("plan-title").value.trim(),
      text: el<HTMLTextAreaElement>("plan-text").value.trim(),
      words: [],
    });
    index = 0;
    await refresh();
    el("parent-status").textContent =
      "School mission saved. New live sessions use the approved text; demo uses French = English lines.";
  } catch (error) {
    report(error, "parent-status");
  }
};
el("delete-plan").onclick = async () => {
  try {
    await api("plan", { remove: true });
    el<HTMLInputElement>("plan-title").value = "";
    el<HTMLTextAreaElement>("plan-text").value = "";
    index = 0;
    await refresh();
    el("parent-status").textContent = "School lesson removed.";
  } catch (error) {
    report(error, "parent-status");
  }
};
el("view-transcripts").onclick = async () => {
  try {
    const archive = await api<TranscriptArchive>("transcripts");
    el("saved-transcripts").hidden = false;
    renderTranscripts(archive, el("saved-transcripts"));
  } catch (error) {
    report(error, "parent-status");
  }
};
el("reset").onclick = async () => {
  if (
    !confirm(
      "Delete the profile settings, school lesson, vocabulary progress, and saved transcripts? This cannot be undone.",
    )
  )
    return;
  try {
    await api("reset", {});
    index = 0;
    el("messages").replaceChildren();
    await refresh();
    parentDialog.close();
    notice("All learning data deleted. Defaults restored.");
  } catch (error) {
    report(error, "parent-status");
  }
};
const liveDialog = el<HTMLDialogElement>("live-dialog");
el("live").onclick = () => liveDialog.showModal();
el("stage-toggle").onclick = stagePress;
el("avatar").onclick = stagePress;
el("mic").onclick = micPress;
el("cancel-live").onclick = () => liveDialog.close();
liveDialog.onclose = () => {
  el<HTMLInputElement>("approve-live").checked = false;
};
el("live-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = el("live-form").querySelector<HTMLButtonElement>(
    "button[type=submit]",
  )!;
  button.disabled = true;
  try {
    clearHints();
    el("messages").replaceChildren();
    captions.clear();
    muted = false;
    recorder.start("live");
    live = new LiveSession(el<HTMLAudioElement>("audio"), {
      state: setState,
      notice,
      fragment,
      lesson: (context) => delegatedLesson(index, context),
      ended: () => {
        live = undefined;
        void recorder.finish().catch((error) => report(error));
        el("messages").replaceChildren();
        captions.clear();
        controls();
      },
    });
    controls();
    const started = live.start();
    // Close after this click finishes so Approve cannot fall through onto
    // the avatar or mic and pause the session before the track arrives.
    await new Promise((resolve) => setTimeout(resolve, 0));
    liveDialog.close();
    await started;
  } catch (error) {
    report(error, "live-status");
  } finally {
    button.disabled = false;
  }
};
if (window.desktop) {
  document.body.classList.add("desktop");
  el("collapse").onclick = () => {
    if (live) {
      notice("End live voice before collapsing to avatar-only mode.");
      return;
    }
    document.body.classList.add("avatar-only");
    window.desktop!.compact(true);
  };
  el("expand-avatar").onclick = () => {
    document.body.classList.remove("avatar-only");
    window.desktop!.compact(false);
  };
  el("hide").onclick = () => {
    live?.dispose();
    window.desktop!.hide();
  };
  window.desktop.onSuspend(() => live?.dispose());
}
window.addEventListener("pagehide", () => {
  live?.dispose();
  avatar?.dispose();
});
void refresh().catch((error) => report(error));
