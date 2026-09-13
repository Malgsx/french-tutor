// Local spoken demo lines. No network and no microphone.
export function speakDemo(
  text: string,
  speech: Pick<SpeechSynthesis, "cancel" | "speak"> | undefined = globalThis
    .speechSynthesis,
) {
  const spoken = text.trim();
  if (!spoken || !speech || typeof SpeechSynthesisUtterance === "undefined")
    return false;
  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = "fr-FR";
  speech.speak(utterance);
  return true;
}
