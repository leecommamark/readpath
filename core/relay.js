// relay.js — feedback and reports sent straight from the app, by Web3Forms
// (brief 7.19, Phase 1).
//
// Pure: no DOM, no storage, and no fetch of its own (fetchFn is passed in, as
// for bundle.js). emailOf turns a feedback doc (feedback.js feedbackDoc, or
// a one-report doc of the same shape) into the email's three fields; send
// posts them; budget and spend keep the hourly cap in readpath.meta.

export const RELAY_URL = 'https://api.web3forms.com/submit';

// Public by design (Web3Forms FAQ: "Access key is public"): it can only send
// to the address of the account that made it. No other credential ever goes
// in the app.
export const WEB3FORMS_KEY = '9c1b46aa-e5c5-4654-9e4f-5c112c1af703';

export const BEGIN = '-----BEGIN READPATH JSON-----';
export const END = '-----END READPATH JSON-----';

// At most this many sends per phone per hour (brief 7.19, P4).
export const CAP = 20;
const HOUR = 3600000;

// A report email: a doc carrying exactly one report and no note.
const isReport = doc => (doc.reports || []).length === 1 && !String(doc.note || '').trim();

// An item id as the subject says it: 'r:清:cing1' -> '清 cing1', 's:青' -> '青'.
const itemSaid = item => {
  const [, ...rest] = String(item || '').split(':');
  return rest.length ? rest.join(' ') : String(item || '');
};

// emailOf(doc, {name}) -> {subject, from_name, message}
export function emailOf(doc, {name} = {}) {
  const who = String(name ?? '').trim();
  const tag = `(${who || 'no name'})`;
  const reps = doc.reports || [];
  const single = isReport(doc);
  const subject = single
    ? ['Read Path report:', itemSaid(reps[0].item), reps[0].kind, tag].filter(Boolean).join(' ')
    : `Read Path feedback ${tag}`;

  const lines = [];
  for (const r of reps) {
    lines.push(`${r.date} · ${r.kind} · ${r.item || ''}`.trimEnd());
    if (r.note) lines.push(`Note: ${r.note}`);
    if (r.prompt) lines.push(`Prompt: ${r.prompt}`);
    if ((r.choices || []).length) lines.push(`Choices: ${r.choices.join(' / ')}`);
    if (r.answer != null) lines.push(`Answer: ${r.answer}`);
    if (r.given != null) lines.push(`Given: ${r.given}`);
    if (r.where) lines.push(`Filed from: ${r.where}`);
    lines.push('');
  }
  if (!single) lines.push(doc.note || '(no note)', '');
  const d = doc.device || {};
  lines.push(`App ${doc.build} · Content ${doc.content}`,
             `${d.browser || d.ua || ''} · ${d.screen || ''}${d.standalone ? ' · installed' : ''}`,
             '', BEGIN, JSON.stringify(doc, null, 1), END);
  return {subject, from_name: who || 'Read Path', message: lines.join('\n')};
}

// jsonBlocks(text) -> object[]: every JSON object between BEGIN and END.
export function jsonBlocks(text) {
  const out = [];
  let at = 0;
  for (;;) {
    const a = text.indexOf(BEGIN, at);
    if (a < 0) break;
    const b = text.indexOf(END, a + BEGIN.length);
    if (b < 0) break;
    out.push(JSON.parse(text.slice(a + BEGIN.length, b).trim()));   // JSON allows CRLF between tokens
    at = b + END.length;
  }
  return out;
}

// send(payload, fetchFn) -> {ok: true} | {ok: false, retry, why}. Never
// throws. Only HTTP 200 with success: true counts; a network error or a 5xx
// is worth retrying, anything else is not.
export async function send({subject, from_name, message}, fetchFn) {
  let res;
  try {
    res = await fetchFn(RELAY_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({access_key: WEB3FORMS_KEY, botcheck: false, subject, from_name, message}),
    });
  } catch (e) {
    return {ok: false, retry: true, why: String(e?.message || e)};
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const said = body && typeof body.message === 'string' ? body.message : '';
  if (res.status >= 500) return {ok: false, retry: true, why: said || `HTTP ${res.status}`};
  if (res.status === 200 && body && body.success === true) return {ok: true};
  return {ok: false, retry: false, why: said || `HTTP ${res.status}`};
}

const recent = (meta, now) => (meta.relaySends || []).filter(t => t >= now - HOUR);

// budget(meta, now) -> {left, meta}: sends older than an hour dropped.
export function budget(meta, now) {
  const relaySends = recent(meta, now);
  return {left: Math.max(0, CAP - relaySends.length), meta: {...meta, relaySends}};
}

// spend(meta, now) -> meta with this send counted.
export function spend(meta, now) {
  const m = budget(meta, now).meta;
  return {...m, relaySends: [...m.relaySends, now]};
}
