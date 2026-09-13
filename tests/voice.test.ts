import { test } from "node:test";
import assert from "node:assert/strict";
import { speakDemo } from "../src/voice";

test("speakDemo speaks French locally and skips empty text", () => {
  const spoken: { text: string; lang: string }[] = [];
  const speech = {
    cancel() {
      spoken.length = 0;
    },
    speak(utterance: SpeechSynthesisUtterance) {
      spoken.push({ text: utterance.text, lang: utterance.lang });
    },
  };
  const Utterance = class {
    text = "";
    lang = "";
    constructor(text: string) {
      this.text = text;
    }
  };
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "SpeechSynthesisUtterance",
  );
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: Utterance,
  });
  try {
    assert.equal(speakDemo("  ", speech), false);
    assert.equal(spoken.length, 0);
    assert.equal(speakDemo("Bonjour !", speech), true);
    assert.deepEqual(spoken, [{ text: "Bonjour !", lang: "fr-FR" }]);
    assert.equal(speakDemo("Encore", speech), true);
    assert.deepEqual(spoken, [{ text: "Encore", lang: "fr-FR" }]);
    assert.equal(speakDemo("Hi", undefined), false);
  } finally {
    if (previous)
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", previous);
    else Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
  }
});
