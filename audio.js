// audio.js — when the Cantonese voice plays (brief 7.31 A5-A7).
//
// One setting, readpath.settings.audio: 'off', 'tap' (a speaker beside a
// reading once it may be heard) or 'auto' (as tap, and a Meet and an answer
// each speak once when they appear). Absent is tap. Per day, Today's toggle
// beside Start: 'on' or 'quiet' (on a bus, in a library), on readpath.today
// so Keep going and Practise again follow it; a new day starts on. A run
// carries the day's choice from its start. Nothing about audio is scored or
// stored per item (A7). The voice itself is speech.js's.

import {KEYS} from './store.js';
import {todayLog} from './runner.js';

export const AUDIO_MODES = ['off', 'tap', 'auto'];

// The learner's choice, from readpath.settings: 'off' | 'tap' | 'auto'.
export function audioMode(settings) {
  return settings && AUDIO_MODES.includes(settings.audio) ? settings.audio : 'tap';
}

export function setAudio(store, mode) {
  if (!AUDIO_MODES.includes(mode)) throw new Error(`audio: no mode ${mode}`);
  store.save(KEYS.settings, {...store.load(KEYS.settings, {}), audio: mode});
}

// Today's choice: 'on' | 'quiet'.
export const dayAudio = (store, today) => (todayLog(store, today).audio === 'quiet' ? 'quiet' : 'on');

export function setDayAudio(store, today, value) {
  store.save(KEYS.today, {...todayLog(store, today), audio: value === 'quiet' ? 'quiet' : 'on'});
}

// What a screen does with audio: {speech, auto}. `speech` is null (no
// speaker anywhere) with the setting off, no Cantonese voice, or a run
// that is quiet; `auto` only in a run, with the setting auto.
export function audioFor({mode, speech, run = null}) {
  if (mode === 'off' || !speech || !speech.canSpeak()) return {speech: null, auto: false};
  if (run && run.audio === 'quiet') return {speech: null, auto: false};
  return {speech, auto: !!run && mode === 'auto'};
}
