// about.js — About and licences (patch plan 7B, Phase 3).
//
// The name, the versions, what is (never) sent, the share-alike statement,
// and every credit in readpath/ATTRIBUTIONS.md, as export_about.py wrote it
// into content/about.json. Reached from Your progress on Today.

import {h, clear, put} from './dom.js';
import {NAME} from './welcome.js';

const CC4 = 'https://creativecommons.org/licenses/by-sa/4.0/';

function link(href, text) {
  const ext = /^https?:/.test(href);
  return h('a', {href, ...(ext ? {target: '_blank', rel: 'noopener'} : {})}, text);
}

// renderAbout(el, {about, build, version}, {onBack})   about: null while
// it loads, or {error}
export function renderAbout(el, m, cb) {
  const a = m.about;
  const credits = !a ? h('p', {class: 'note'}, 'Loading…')
    : a.error ? h('p', {class: 'note'}, `The credits couldn’t load (${a.error}).`)
    : a.sections.map(s => h('section', {class: 'block'},
        h('h2', {}, s.title),
        h('ul', {class: 'credits'}, ...s.rows.map(r => h('li', {},
          h('span', {}, r.credit), ' ',
          h('span', {class: 'sm'}, '· ',
            r.licence.href ? link(r.licence.href, r.licence.name) : r.licence.name,
            ...(r.licence.notices || []).map(n => [' · ', link(n, 'notice')])))))));
  put(clear(el),
    h('div', {class: 'top'},
      h('button', {type: 'button', class: 'link back-btn', onclick: cb.onBack}, '‹ Today'),
      h('span', {})),
    h('h1', {id: 'about-h'}, NAME),
    h('section', {class: 'block first'},
      h('p', {class: 'lead-note'}, 'Learn to read the Cantonese you already speak.'),
      h('p', {class: 'sm'}, `App ${m.build} · Content ${m.version}`)),
    h('section', {class: 'block'},
      h('h2', {}, 'Your data'),
      h('p', {}, 'Everything stays on this device. Nothing is sent except what you choose to send '
        + 'with Send feedback.'),
      h('p', {}, 'No analytics of any kind.')),
    h('section', {class: 'block'},
      h('h2', {}, 'The data'),
      h('p', {}, 'Read Path’s dictionaries, readings and word lists merge the sources below. '
        + 'They were changed (merged, cut and converted), and the merged tables, the files '
        + 'under content/ beside this page, are offered under ',
        link(CC4, 'CC BY-SA 4.0'), '.')),
    credits);
}
