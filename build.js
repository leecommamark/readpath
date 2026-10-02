// build.js — which build of the app this is (patch plan 7B, Phase 2).
//
// 'dev' as it is served from readpath/app/: no service worker registers.
// readpath/tools/build_dist.py stamps a published build's 16 hex digits
// here, and the same into sw.js.
export const BUILD = '443f8342c7442523';
