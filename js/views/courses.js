// Cours : pointe tes présences, suis ce qu'il reste à rattraper, vois ce qui est fait.
import {
  html, useState, useMemo, colorFor, fmtDay, fmtTime, hoursBetween, fmtHours, isoDate,
  isPast, toPoint, STATUS,
} from '../lib.js';
import { Icon, Empty, PageHead, attempt } from '../ui.js';
import { updateEvents } from '../store.js';
import { EventList } from './agenda.js';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Les boutons proposés quand des séances sont sélectionnées, selon l'onglet
const ACTIONS = {
  pointer: [
    { label: "J'y étais", icon: 'check', cls: 'primary', patch: { status: 'present' }, ok: (n) => `${plural(n, 'séance')} → Complétés` },
    { label: 'Pas assisté', icon: 'x', cls: 'danger-solid', patch: { status: 'rate' }, ok: (n) => `${plural(n, 'séance')} → À rattraper` },
  ],
  rattraper: [
    { label: 'Rattrapé', icon: 'check', cls: 'primary', patch: { status: 'rattrape' }, ok: (n) => `Bien joué ! ${plural(n, 'séance')} → Complétés` },
    { label: "J'y étais", cls: '', patch: { status: 'present' }, ok: (n) => `${plural(n, 'séance')} → Complétés` },
  ],
  faits: [
    { label: 'Remettre à pointer', cls: '', patch: { status: null }, ok: (n) => `${plural(n, 'séance')} → À pointer` },
  ],
};

const EMPTY = {
  pointer: 'Tout est pointé. Les séances terminées apparaîtront ici pour que tu indiques si tu y étais.',
  rattraper: 'Rien à rattraper, tu es à jour.',
  faits: 'Aucune séance complétée pour l\'instant.',
};

// Liste de séances avec cases à cocher + barre d'actions
function SessionPicker({ tab, sessions }) {
  const [selected, setSelected] = useState(new Set());
  const [course, setCourse] = useState('');

  const titles = [...new Set(sessions.map((e) => e.title))].sort();
  const shown = course ? sessions.filter((e) => e.title === course) : sessions;
  const allOn = shown.length > 0 && shown.every((e) => selected.has(e.id));

  const toggle = (id) => {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s);
  };
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(shown.map((e) => e.id)));
  const toggleDay = (list) => {
    const s = new Set(selected), on = list.every((e) => s.has(e.id));
    list.forEach((e) => (on ? s.delete(e.id) : s.add(e.id))); setSelected(s);
  };
  const run = async (a) => {
    const ids = [...selected];
    if (await attempt(() => updateEvents(ids, a.patch), a.ok(ids.length))) setSelected(new Set());
  };

  // Regroupe par jour (dans une journée : du matin au soir)
  const days = new Map();
  for (const e of shown) { const k = isoDate(e.starts_at); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
  days.forEach((list) => list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));

  if (!sessions.length) return html`<section class="card"><${Empty}>${EMPTY[tab]}</${Empty}></section>`;

  return html`
    ${titles.length > 1 && html`
      <div class="chips scroll" role="group" aria-label="Filtrer par cours">
        <button class=${`chip ${!course ? 'on' : ''}`} onClick=${() => setCourse('')}>Tous</button>
        ${titles.map((t) => html`
          <button class=${`chip ${course === t ? 'on' : ''}`} onClick=${() => setCourse(course === t ? '' : t)}>
            <i style=${`background:${colorFor(t)}`}></i>${t}</button>`)}
      </div>`}

    <section class="card flush">
      <div class="picker-head">
        <label class="check-label">
          <input type="checkbox" class="check" checked=${allOn} onChange=${toggleAll} />
          <span>${allOn ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
        </label>
        <span class="muted small">${plural(shown.length, 'séance')}</span>
      </div>
      ${[...days.values()].map((list) => html`
        <div class="picker-day">
          <button class="picker-day-head cap" onClick=${() => toggleDay(list)}>${fmtDay(list[0].starts_at)}</button>
          <ul class="picker">
            ${list.map((e) => html`
              <li key=${e.id} class=${selected.has(e.id) ? 'on' : ''}>
                <label>
                  <input type="checkbox" class="check" checked=${selected.has(e.id)} onChange=${() => toggle(e.id)}
                    aria-label=${`${e.title}, ${fmtDay(e.starts_at)} ${fmtTime(e.starts_at)}`} />
                  <span class="event-bar" style=${`background:${colorFor(e.title)}`}></span>
                  <span class="grow">
                    <b class="ellipsis">${e.title}</b>
                    <span class="muted small">${fmtTime(e.starts_at)}–${fmtTime(e.ends_at)}${e.notes ? ` · ${e.notes}` : ''}</span>
                  </span>
                  ${tab === 'faits' && html`<span class=${`tag ${STATUS[e.status].cls}`}>${STATUS[e.status].label}</span>`}
                </label>
              </li>`)}
          </ul>
        </div>`)}
    </section>

    ${selected.size > 0 && html`
      <div class="actionbar" role="toolbar" aria-label="Actions sur la sélection">
        <span class="actionbar-count">${selected.size} <span class="muted">sélectionnée${selected.size > 1 ? 's' : ''}</span></span>
        <div class="actionbar-btns">
          ${ACTIONS[tab].map((a) => html`
            <button class=${`btn ${a.cls}`} onClick=${() => run(a)}>${a.icon && html`<${Icon} name=${a.icon} size=${16} />`}${a.label}</button>`)}
        </div>
      </div>`}`;
}

// Un bloc par cours, avec les statistiques
function ByCourse({ sessions }) {
  const [open, setOpen] = useState(null);
  const now = new Date();
  const courses = useMemo(() => {
    const map = new Map();
    for (const e of sessions) { if (!map.has(e.title)) map.set(e.title, []); map.get(e.title).push(e); }
    return [...map.entries()].map(([title, list]) => {
      const count = (s) => list.filter((e) => e.status === s).length;
      const past = list.filter((e) => isPast(e, now)).length;
      return {
        title, list, color: colorFor(title), total: list.length, past,
        present: count('present'), missed: count('rate'), caught: count('rattrape'),
        pending: list.filter((e) => toPoint(e, now)).length,
        hours: list.reduce((a, e) => a + hoursBetween(e.starts_at, e.ends_at), 0),
      };
    }).sort((a, b) => b.missed - a.missed || a.title.localeCompare(b.title));
  }, [sessions]);

  if (!courses.length) return html`<section class="card"><${Empty}>Aucun cours pour l'instant. Ils apparaîtront automatiquement une fois ton calendrier connecté (voir le guide).</${Empty}></section>`;

  return html`
    <div class="course-grid">
      ${courses.map((c) => {
        const pct = (n) => `${c.past ? (n / c.past) * 100 : 0}%`;
        return html`
        <section class="card course" key=${c.title}>
          <button class="course-head" onClick=${() => setOpen(open === c.title ? null : c.title)} aria-expanded=${open === c.title}>
            <i style=${`background:${c.color}`}></i>
            <div class="grow">
              <h2>${c.title}</h2>
              <p class="muted small">${c.past}/${c.total} séances passées · ${fmtHours(c.hours)} au total</p>
            </div>
          </button>
          <div class="progress multi" title="Assisté · Rattrapé · Raté · À pointer">
            <span style=${`width:${pct(c.present)};background:${c.color}`}></span>
            <span style=${`width:${pct(c.caught)};background:var(--c-free)`}></span>
            <span style=${`width:${pct(c.missed)};background:var(--danger)`}></span>
          </div>
          <div class="course-stats">
            <span><b>${c.present}</b> assisté${c.present > 1 ? 's' : ''}</span>
            ${c.caught > 0 && html`<span class="green"><b>${c.caught}</b> rattrapé${c.caught > 1 ? 's' : ''}</span>`}
            ${c.missed > 0 && html`<span class="red"><b>${c.missed}</b> à rattraper</span>`}
            ${c.pending > 0 && html`<span class="muted"><b>${c.pending}</b> à pointer</span>`}
          </div>
          ${open === c.title && html`<div class="course-sessions"><${EventList} events=${c.list} showDate /></div>`}
        </section>`;
      })}
    </div>`;
}

export function Courses({ store }) {
  const now = new Date();
  const sessions = store.events.filter((e) => e.kind === 'cours');
  const lists = {
    pointer: sessions.filter((e) => toPoint(e, now)).reverse(),                       // plus récentes d'abord
    rattraper: sessions.filter((e) => e.status === 'rate'),                           // plus anciennes d'abord
    faits: sessions.filter((e) => e.status === 'present' || e.status === 'rattrape').reverse(),
  };
  const tabs = [
    { id: 'pointer', label: 'À pointer', n: lists.pointer.length },
    { id: 'rattraper', label: 'À rattraper', n: lists.rattraper.length, red: true },
    { id: 'faits', label: 'Complétés', n: lists.faits.length },
    { id: 'cours', label: 'Par cours' },
  ];
  const [tab, setTab] = useState(lists.pointer.length ? 'pointer' : 'rattraper');

  return html`
    <${PageHead} title="Cours" sub="Coche les séances, puis indique si tu y étais" />
    <div class="seg tabs" role="tablist">
      ${tabs.map((t) => html`
        <button role="tab" aria-selected=${tab === t.id} class=${tab === t.id ? 'on' : ''} onClick=${() => setTab(t.id)}>
          ${t.label}${t.n > 0 && html` <span class=${`count ${t.red ? 'red' : ''}`}>${t.n}</span>`}
        </button>`)}
    </div>
    ${tab === 'cours'
      ? html`<${ByCourse} sessions=${sessions} />`
      : html`<${SessionPicker} key=${tab} tab=${tab} sessions=${lists[tab]} />`}`;
}
