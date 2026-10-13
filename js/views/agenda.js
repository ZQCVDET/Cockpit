// Agenda : semaine par semaine, ajout d'événements, statut des séances de cours.
import {
  html, useState, KINDS, STATUS, startOfWeek, addDays, sameDay, fmtTime, fmtDay, fmtShort,
  isoDate, hoursBetween, fmtHours, colorFor,
} from '../lib.js';
import { Icon, Sheet, Empty, PageHead, attempt } from '../ui.js';
import { addEvents, updateEvent, deleteEvent } from '../store.js';
import { usePlan, PRIORITIES } from '../planner.js';

// Une ligne d'événement
export function EventRow({ e, now = new Date(), onOpen, showDate }) {
  const past = new Date(e.ends_at) < now;
  const live = new Date(e.starts_at) <= now && !past;
  const color = e.kind === 'cours' ? colorFor(e.title) : KINDS[e.kind]?.color;
  return html`
    <li class=${`event ${past ? 'past' : ''} ${live ? 'live' : ''}`}>
      <button class="event-btn" onClick=${() => onOpen && onOpen(e)} disabled=${!onOpen}>
        <span class="event-time">${showDate && html`<small class="cap">${fmtShort(e.starts_at)}</small>`}${fmtTime(e.starts_at)}<small>${fmtTime(e.ends_at)}</small></span>
        <span class="event-bar" style=${`background:${color}`}></span>
        <span class="event-main">
          <span class="event-title">${e.title}</span>
          <span class="event-meta">
            ${KINDS[e.kind]?.label}${e.location ? ` · ${e.location}` : ''}
            ${live && html` · <b class="live-dot">en cours</b>`}
          </span>
        </span>
        ${e.status === 'present' && html`<span class="tick" title="Assisté"><${Icon} name="check" size=${16} /></span>`}
        ${e.status && e.status !== 'present' && html`<span class=${`tag ${STATUS[e.status].cls}`}>${STATUS[e.status].label}</span>`}
      </button>
    </li>`;
}

// Liste + panneau de détail (réutilisée sur l'accueil)
export function EventList({ events, showDate }) {
  const [open, setOpen] = useState(null);
  return html`
    <ul class="events">${events.map((e) => html`<${EventRow} key=${e.id} e=${e} onOpen=${setOpen} showDate=${showDate} />`)}</ul>
    ${open && html`<${EventSheet} e=${open} onClose=${() => setOpen(null)} />`}`;
}

// Détail d'un événement
function EventSheet({ e, onClose }) {
  const [notes, setNotes] = useState(e.notes || '');
  const isCourse = e.kind === 'cours';
  const past = new Date(e.starts_at) < new Date();
  // Toucher le statut déjà actif l'enlève (la séance redevient "à pointer")
  const setStatus = (status) => attempt(() => updateEvent(e.id, { status: e.status === status ? null : status }), 'Enregistré').then(onClose);

  return html`
    <${Sheet} title=${e.title} onClose=${onClose}>
      <p class="muted">${fmtDay(e.starts_at)} · ${fmtTime(e.starts_at)}–${fmtTime(e.ends_at)} (${fmtHours(hoursBetween(e.starts_at, e.ends_at))})</p>
      ${e.location && html`<p class="muted with-icon"><${Icon} name="pin" size=${14} /> ${e.location}</p>`}

      ${isCourse && html`
        <div class="field">
          <span class="label">Présence</span>
          <p class="muted small">${past && !e.status ? 'Pas encore pointée.' : !past ? 'Tu peux déjà marquer une séance que tu sais que tu vas rater.' : 'Touche à nouveau le statut actif pour l\'effacer.'}</p>
          <div class="seg">
            <button class=${e.status === 'present' ? 'on' : ''} onClick=${() => setStatus('present')}>J'y étais</button>
            <button class=${e.status === 'rate' ? 'on red' : ''} onClick=${() => setStatus('rate')}>Raté</button>
            <button class=${e.status === 'rattrape' ? 'on green' : ''} onClick=${() => setStatus('rattrape')}>Rattrapé</button>
          </div>
        </div>`}

      <label class="field">
        <span class="label">Notes</span>
        <textarea rows="3" value=${notes} onInput=${(ev) => setNotes(ev.target.value)}
          placeholder=${isCourse ? 'Ex. : demander les slides à Julie, chapitre 4' : ''}></textarea>
      </label>
      <div class="row-actions">
        ${e.source === 'manual' && html`
          <button class="btn ghost danger" onClick=${() => confirm('Supprimer cet événement ?') && attempt(() => deleteEvent(e.id), 'Supprimé').then(onClose)}>
            <${Icon} name="trash" size=${16} /> Supprimer
          </button>`}
        <button class="btn primary" onClick=${() => attempt(() => updateEvent(e.id, { notes }), 'Enregistré').then(onClose)}>Enregistrer</button>
      </div>
      ${e.source === 'ics' && html`<p class="muted small">Importé depuis ton calendrier de cours : l'horaire se met à jour automatiquement.</p>`}
    </${Sheet}>`;
}

// Formulaire d'ajout
function AddEventSheet({ day, onClose }) {
  const [f, setF] = useState({ title: '', kind: 'reunion', date: isoDate(day), start: '18:00', end: '19:00', location: '', repeat: 1 });
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });

  const submit = async (ev) => {
    ev.preventDefault();
    const rows = [];
    for (let w = 0; w < Number(f.repeat); w++) {
      const d = addDays(new Date(`${f.date}T00:00`), w * 7);
      const s = new Date(`${isoDate(d)}T${f.start}`), t = new Date(`${isoDate(d)}T${f.end}`);
      if (t <= s) t.setDate(t.getDate() + 1); // finit après minuit
      rows.push({ title: f.title.trim() || KINDS[f.kind].label, kind: f.kind, location: f.location || null, starts_at: s.toISOString(), ends_at: t.toISOString(), source: 'manual' });
    }
    if (await attempt(() => addEvents(rows), rows.length > 1 ? `${rows.length} événements ajoutés` : 'Ajouté')) onClose();
  };

  return html`
    <${Sheet} title="Nouvel événement" onClose=${onClose}>
      <form onSubmit=${submit}>
        <label class="field"><span class="label">Titre</span>
          <input value=${f.title} onInput=${set('title')} placeholder="Ex. : Réunion pôle Events" /></label>
        <div class="field"><span class="label">Type</span>
          <div class="chips">
            ${Object.entries(KINDS).map(([k, v]) => html`
              <button type="button" class=${`chip ${f.kind === k ? 'on' : ''}`} onClick=${() => setF({ ...f, kind: k })}>
                <i style=${`background:${v.color}`}></i>${v.label}</button>`)}
          </div>
        </div>
        <div class="grid3">
          <label class="field"><span class="label">Date</span><input type="date" value=${f.date} onInput=${set('date')} required /></label>
          <label class="field"><span class="label">Début</span><input type="time" value=${f.start} onInput=${set('start')} required /></label>
          <label class="field"><span class="label">Fin</span><input type="time" value=${f.end} onInput=${set('end')} required /></label>
        </div>
        <div class="grid2">
          <label class="field"><span class="label">Lieu</span><input value=${f.location} onInput=${set('location')} placeholder="Optionnel" /></label>
          <label class="field"><span class="label">Répéter chaque semaine</span>
            <select value=${f.repeat} onChange=${set('repeat')}>
              ${[1, 2, 4, 6, 8, 10, 12, 15].map((n) => html`<option value=${n} selected=${String(n) === String(f.repeat)}>${n === 1 ? 'Non' : `${n} semaines`}</option>`)}
            </select></label>
        </div>
        <button class="btn primary full" type="submit">Ajouter</button>
      </form>
    </${Sheet}>`;
}

export function Agenda({ store }) {
  const [week, setWeek] = useState(startOfWeek(new Date()));
  const [adding, setAdding] = useState(null);
  const days = [...Array(7)].map((_, i) => addDays(week, i));
  const inWeek = store.events.filter((e) => new Date(e.starts_at) >= week && new Date(e.starts_at) < addDays(week, 7));
  const plan = usePlan(store);
  const total = (k) => inWeek.filter((e) => e.kind === k).reduce((a, e) => a + hoursBetween(e.starts_at, e.ends_at), 0);
  const isThisWeek = sameDay(week, startOfWeek(new Date()));

  return html`
    <${PageHead} title="Agenda" sub=${`Semaine du ${fmtShort(week)}`}>
      <button class="btn primary" onClick=${() => setAdding(new Date())}><${Icon} name="plus" size=${18} /> Ajouter</button>
    </${PageHead}>

    <div class="weeknav">
      <button class="icon-btn" onClick=${() => setWeek(addDays(week, -7))} aria-label="Semaine précédente"><${Icon} name="left" /></button>
      <button class=${`btn ghost small ${isThisWeek ? 'hidden' : ''}`} onClick=${() => setWeek(startOfWeek(new Date()))}>Cette semaine</button>
      <div class="week-sum">
        ${['cours', 'reunion', 'club', 'job'].map((k) => total(k) > 0 && html`
          <span><i style=${`background:${KINDS[k].color}`}></i>${KINDS[k].label} ${fmtHours(total(k))}</span>`)}
      </div>
      <button class="icon-btn" onClick=${() => setWeek(addDays(week, 7))} aria-label="Semaine suivante"><${Icon} name="right" /></button>
    </div>

    <div class="days">
      ${days.map((d) => {
        const list = inWeek.filter((e) => sameDay(e.starts_at, d));
        const today = sameDay(d, new Date());
        return html`
          <section class=${`card day ${today ? 'today' : ''}`}>
            <div class="card-head">
              <h2 class="cap">${fmtDay(d)}${today && html` <span class="tag tag-accent">Aujourd'hui</span>`}</h2>
              <button class="icon-btn" onClick=${() => setAdding(d)} aria-label="Ajouter ce jour-là"><${Icon} name="plus" size=${18} /></button>
            </div>
            ${list.length ? html`<${EventList} events=${list} />` : null}
            ${plan.blocks.filter((b) => b.day === isoDate(d)).map((b) => html`
              <a class="event plan suggestion" href="#taches" title="Bloc proposé par le planning automatique">
                <span class="event-time">${fmtTime(b.start)}<small>${fmtTime(b.end)}</small></span>
                <span class="event-bar" style=${`background:${PRIORITIES[b.task.priority]?.color}`}></span>
                <span class="event-main"><span class="event-title">${b.task.title}</span>
                  <span class="event-meta">${b.pinned ? '📌 Placé par toi' : 'Suggestion'} · ${fmtHours(b.minutes / 60)}</span></span>
              </a>`)}
            ${!list.length && !plan.blocks.some((b) => b.day === isoDate(d)) && html`<${Empty}>Libre</${Empty}>`}
          </section>`;
      })}
    </div>
    ${adding && html`<${AddEventSheet} day=${adding} onClose=${() => setAdding(null)} />`}`;
}
