// rng.js — a seeded random source (patch plan 3, Phase 1).
//
// Nothing in core/ calls Math.random (a test checks): every draw comes from
// an rng made here from a seed, so the same seed and the same day give
// byte-identical sessions. mulberry32 is small, fast and good enough for
// shuffling a session; it is not for anything that needs to be secret.

export function makeRng(seed) {
  if (!Number.isInteger(seed)) throw new Error(`seed must be an integer: ${seed}`);
  let a = seed >>> 0;
  const next = () => {                       // [0, 1)
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = n => {                         // 0 .. n-1
    if (!(n > 0)) throw new Error(`int(${n})`);
    return Math.floor(next() * n);
  };
  const pick = arr => {
    if (!arr.length) throw new Error('pick from an empty list');
    return arr[int(arr.length)];
  };
  const shuffle = arr => {                   // a new array; Fisher-Yates
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return {next, int, pick, shuffle};
}
