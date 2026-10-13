// Journal de travail : chrono, ajout rapide, totaux du mois.
import {
  html, useState, useEffect, useMemo, isoDate, startOfMonth, startOfWeek, addDays,
  fmtMinutes, fmtMonth, fmtShort,
} from '../lib.js';
import { Icon, Empty, PageHead, attempt } from '../ui.js';
import { addLog, deleteLog, saveSettings } from '../store.js';

// Chrono : l'heure de départ est stockée dans les réglages → tu peux le lancer sur
// ton téléphone et l'arrêter sur ton ordi.
function Timer({ settings }) {
  const t = settings.timer;
  const cats = settings.categories;
  const [cat, setCat] = useState(t?.category || cats[0]?.name);
  const [subject, setSubject] = useState(t?.subject || '');
  const [, tick] = useState(0);
  useEffect(() => { if (!t) return; const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, [t]);

  const elapsed = t ? Math.floor((Date.now() - new Date(t.start)) / 1000) : 0;
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const start = () => attempt(() => saveSettings({ timer: { start: new Date().toISOString(), category: cat, subject } }));
  const stop = async () => {
    const minutes = Math.round(elapsed / 60);
    if (minutes >= 1) await attempt(() => addLog({ category: t.category, subject: t.subject || null, minutes, day: isoDate(new Date(t.start)), note: null }), `${fmtMinutes(minutes)} enregistrées`);
    await attempt(() => saveSettings({ timer: null }));
  };

  return html`
    <section class=${`card timer ${t ? 'running' : ''}`}>
      <div class="timer-row">
        <div class="grow">
          <p class="label">${t ? `${t.category}${t.subject ? ` · ${t.subject}` : ''}` : 'Chrono'}</p>
          <p class="timer-time">${hh}:${mm}<small>:${ss}</small></p>
        </div>
        ${t
          ? html`<button class="round-btn stop" onClick=${stop} aria-label="Arrêter et enregistrer"><${Icon} name="stop" size=${22} /></button>`
          : html`<button class="round-btn" onClick=${start} aria-label="Démarrer"><${Icon} name="play" size=${22} /></button>`}
      </div>
      ${!t && html`
        <div class="grid2">
          <select value=${cat} onChange=${(e) => setCat(e.target.value)} aria-label="Catégorie">
            ${cats.map((c) => html`<option value=${c.name} selected=${c.name === cat}>${c.name}</option>`)}
          </select>
          <input value=${subject} onInput=${(e) => setSubject(e.target.value)} placeholder="Sujet (optionnel)" list="subjects" />
        </div>`}
      ${t && html`<button class="link small" onClick=${() => confirm('Annuler le chrono sans enregistrer ?') && saveSettings({ timer: null })}>Annuler</button>`}
    </section>`;
}

function QuickAdd({ settings, subjects }) {
  const [f, setF] = useState({ category: settings.categories[0]?.name, subject: '', h: '1', m: '0', day: isoDate(new Date()), note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const minutes = Number(f.h) * 60 + Number(f.m);
    if (minutes <= 0) return;
    if (await attempt(() => addLog({ category: f.category, subject: f.subject || null, minutes, day: f.day, note: f.note || null }), 'Session ajoutée')) setF({ ...f, subject: '', note: '' });
  };
  return html`
    <section class="card">
      <div class="card-head"><h2>Ajouter une session</h2></div>
      <form onSubmit=${submit}>
        <div class="chips">
          ${settings.categories.map((c) => html`
            <button type="button" class=${`chip ${f.category === c.name ? 'on' : ''}`} onClick=${() => setF({ ...f, category: c.name })}>
              <i style=${`background:${c.color}`}></i>${c.name}</button>`)}
        </div>
        <div class="grid3">
          <label class="field"><span class="label">Heures</span>
            <select value=${f.h} onChange=${set('h')}>${[...Array(13)].map((_, i) => html`<option value=${i} selected=${String(i) === String(f.h)}>${i} h</option>`)}</select></label>
          <label class="field"><span class="label">Minutes</span>
            <select value=${f.m} onChange=${set('m')}>${[0, 15, 30, 45].map((m) => html`<option value=${m} selected=${String(m) === String(f.m)}>${m} min</option>`)}</select></label>
          <label class="field"><span class="label">Date</span><input type="date" value=${f.day} onInput=${set('day')} required /></label>
        </div>
        <div class="grid2">
          <input value=${f.subject} onInput=${set('subject')} placeholder="Sujet (ex. : Corporate Finance)" list="subjects" aria-label="Sujet" />
          <input value=${f.note} onInput=${set('note')} placeholder="Note (optionnel)" aria-label="Note" />
        </div>
        <datalist id="subjects">${subjects.map((s) => html`<option value=${s} />`)}</datalist>
        <button class="btn primary full" type="submit">Ajouter</button>
      </form>
    </section>`;
}

export function Journal({ store }) {
  const { logs, settings, events } = store;
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const from = isoDate(month), to = isoDate(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const inMonth = logs.filter((l) => l.day >= from && l.day < to);
  const total = inMonth.reduce((a, l) => a + l.minutes, 0);
  const colorOf = (name) => settings.categories.find((c) => c.name === name)?.color || '#94a3b8';

  const byCat = useMemo(() => {
    const m = {};
    for (const l of inMonth) m[l.category] = (m[l.category] || 0) + l.minutes;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [logs, month]);

  // Totaux par semaine (lundi → dimanche) pour le mois affiché
  const weeks = useMemo(() => {
    const out = [];
    for (let w = startOfWeek(month); w < new Date(to); w = addDays(w, 7)) {
      const a = isoDate(w), b = isoDate(addDays(w, 7));
      out.push({ label: fmtShort(w), minutes: inMonth.filter((l) => l.day >= a && l.day < b).reduce((s, l) => s + l.minutes, 0) });
    }
    return out;
  }, [logs, month]);
  const maxWeek = Math.max(60, ...weeks.map((w) => w.minutes));

  const subjects = useMemo(() => [...new Set([
    ...events.filter((e) => e.kind === 'cours').map((e) => e.title),
    ...logs.map((l) => l.subject).filter(Boolean),
  ])], [events, logs]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const l of inMonth) { if (!m.has(l.day)) m.set(l.day, []); m.get(l.day).push(l); }
    return [...m.entries()];
  }, [logs, month]);

  return html`
    <${PageHead} title="Journal" sub="Note ce que tu fais, vois où part ton temps" />
    <div class="cols">
      <div>
        <${Timer} settings=${settings} />
        <${QuickAdd} settings=${settings} subjects=${subjects} />
      </div>
      <div>
        <section class="card">
          <div class="card-head">
            <button class="icon-btn" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mois précédent"><${Icon} name="left" /></button>
            <h2 class="cap">${fmtMonth(month)}</h2>
            <button class="icon-btn" onClick=${() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mois suivant"><${Icon} name="right" /></button>
          </div>
          <p class="big center">${fmtMinutes(total)}</p>
          ${byCat.length ? html`
            <ul class="bars">
              ${byCat.map(([name, min]) => html`
                <li>
                  <span class="bar-label"><i style=${`background:${colorOf(name)}`}></i>${name}</span>
                  <span class="bar"><span style=${`width:${(min / byCat[0][1]) * 100}%;background:${colorOf(name)}`}></span></span>
                  <b>${fmtMinutes(min)}</b>
                </li>`)}
            </ul>
            <p class="label mt">Par semaine</p>
            <div class="weekbars">
              ${weeks.map((w) => html`
                <div class="wb" title=${fmtMinutes(w.minutes)}>
                  <span class="wb-val">${w.minutes ? Math.round(w.minutes / 60) + 'h' : ''}</span>
                  <span class="wb-bar"><span style=${`height:${(w.minutes / maxWeek) * 100}%`}></span></span>
                  <span class="wb-label">${w.label.split(' ').slice(1).join(' ')}</span>
                </div>`)}
            </div>` : html`<${Empty}>Aucune session ce mois-ci.</${Empty}>`}
        </section>

        ${byDay.length > 0 && html`
          <section class="card">
            <div class="card-head"><h2>Détail</h2></div>
            ${byDay.map(([day, list]) => html`
              <div class="logday">
                <p class="label cap">${fmtShort(day + 'T12:00')}</p>
                <ul class="logs">
                  ${list.map((l) => html`
                    <li key=${l.id}>
                      <i style=${`background:${colorOf(l.category)}`}></i>
                      <div class="grow"><b>${l.category}</b>${l.subject && html` · ${l.subject}`}${l.note && html`<span class="muted small"> — ${l.note}</span>`}</div>
                      <span class="mono">${fmtMinutes(l.minutes)}</span>
                      <button class="icon-btn small" aria-label="Supprimer" onClick=${() => confirm('Supprimer cette session ?') && attempt(() => deleteLog(l.id))}><${Icon} name="trash" size=${16} /></button>
                    </li>`)}
                </ul>
              </div>`)}
          </section>`}
      </div>
    </div>`;
}
