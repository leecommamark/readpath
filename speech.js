// speech.js — the Cantonese voice (brief 7.31 A1, A3).
//
// System speech only: speechSynthesis with a Cantonese voice, never a
// Mandarin one. No Cantonese voice, no audio: canSpeak() is false and no
// speaker is drawn. Chrome lists no voices until `voiceschanged`; Firefox
// lists them at once and never fires it (Phase 0); so the voices are taken
// at once when there are any, else on the event, else not after TIMEOUT_MS.
// Where there are two, a voice on the device beats a network one (Sinji
// over Google 粤語 on desktop Chrome; Mark, Phase 0). What a reading says
// is views/facts.js's sayFor.

export const RATE = 0.85;                  // a little slower than the default (A3)
export const TIMEOUT_MS = 2000;

// zh-HK, zh_HK (macOS's own spelling) or yue-*: Chrome calls Sinji yue-HK
export const isCantonese = v => /^(yue|zh[-_]hk)\b/i.test(v.lang || '');

// The voice to use, or null: a Cantonese one, on the device first.
export function pickVoice(voices) {
  const ok = (voices || []).filter(isCantonese);
  return ok.find(v => v.localService) || ok[0] || null;
}

// createSpeech(synth = speechSynthesis) -> {ready, canSpeak(), say(text), cancel()}
//   ready: a promise of canSpeak() once the voices are known
export function createSpeech(synth = globalThis.speechSynthesis,
                             {timeout = TIMEOUT_MS, Utterance = globalThis.SpeechSynthesisUtterance} = {}) {
  let voice = null;
  const pick = () => { voice = synth ? pickVoice(synth.getVoices()) : null; return !!voice; };
  const ready = !synth ? Promise.resolve(false) : new Promise(resolve => {
    if (synth.getVoices().length) return resolve(pick());
    const done = () => { clearTimeout(timer); resolve(pick()); };
    const timer = setTimeout(done, timeout);
    synth.addEventListener('voiceschanged', done, {once: true});
  });
  // a voice installed later is found the next time the list changes
  if (synth) synth.addEventListener('voiceschanged', pick);
  return {
    ready,
    canSpeak: () => !!voice,
    say(text) {
      if (!voice || !text) return false;
      synth.cancel();
      const u = new Utterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = RATE;
      synth.speak(u);
      return true;
    },
    cancel: () => { if (synth) synth.cancel(); },
  };
}
