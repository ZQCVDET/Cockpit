// Tâches : to-do list par urgence + planning automatique dans ton temps libre.
import {
  html, useState, fmtDay, fmtShort, fmtTime, fmtMinutes, isoDate, addDays, sameDay,
} from '../lib.js';
import { Icon, Sheet, Empty, PageHead, attempt, toast } from '../ui.js';
import { addTask, updateTask, deleteTask, addProgress, saveSettings } from '../store.js';
import { PRIORITIES, usePlan, isDone, remaining, daysLeft, prune } from '../planner.js';
import { importCsv } from '../csv.js';

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 600, 900, 1200];

const dueLabel = (t) => {
  const d = daysLeft(t);
  if (d === null) return null;
  if (d < 0) return { text: `en retard (${fmtShort(t.due_date + 'T12:00')})`, cls: 'red' };
  if (d === 0) return { text: 'aujourd\'hui', cls: 'red' };
  if (d === 1) return { text: 'demain', cls: 'red' };
  return { text: `J−${d} · ${fmtShort(t.due_date + 'T12:00')}`, cls: d <= 3 ? 'red' : d <= 7 ? 'amber' : '' };
};

// Formulaire tâche (création + modification)
function TaskSheet({ task, settings, onClose }) {
  const isNew = !task.id;
  const [f, setF] = useState({
    title: task.title || '', priority: task.priority || 'normale', due_date: task.due_date || '',
    estimate_minutes: task.estimate_minutes ?? 60, category: task.category || settings.categories[0]?.name,
    notes: task.notes || '',
  });
  const [prog, setProg] = useState(30);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const row = { ...f, title: f.title.trim(), due_date: f.due_date || null, estimate_minutes: Number(f.estimate_minutes) || null, notes: f.notes || null };
    const ok = await attempt(() => (isNew ? addTask(row) : updateTask(task.id, row)), isNew ? 'Tâche ajoutée au planning' : 'Enregistré');
    if (ok) onClose();
  };

  return html`
    <${Sheet} title=${isNew ? 'Nouvelle tâche' : 'Tâche'} onClose=${onClose}>
      <form onSubmit=${save}>
        <label class="field"><span class="label">Quoi ?</span>
          <input value=${f.title} onInput=${set('title')} placeholder="Ex. : Préparer la présentation du forum" required /></label>

        <div class="field"><span class="label">Urgence</span>
          <div class="chips">
            ${Object.entries(PRIORITIES).map(([k, p]) => html`
              <button type="button" class=${`chip ${f.priority === k ? 'on' : ''}`} onClick=${() => setF({ ...f, priority: k })}>
                <i style=${`background:${p.color}`}></i>${p.label}</button>`)}
          </div>
        </div>

        <div class="grid2">
          <label class="field"><span class="label">Deadline</span>
            <input type="date" value=${f.due_date} onInput=${set('due_date')} /></label>
          <label class="field"><span class="label">Temps estimé</span>
            <select value=${f.estimate_minutes} onChange=${set('estimate_minutes')}>
              <option value="" selected=${!f.estimate_minutes}>À estimer</option>
              ${ESTIMATES.map((m) => html`<option value=${m} selected=${Number(f.estimate_minutes) === m}>${fmtMinutes(m)}</option>`)}
            </select></label>
        </div>
        <label class="field"><span class="label">Catégorie</span>
          <select value=${f.category} onChange=${set('category')}>
            ${settings.categories.map((c) => html`<option value=${c.name} selected=${c.name === f.category}>${c.name}</option>`)}
          </select></label>
        <label class="field"><span class="label">Notes</span>
          <textarea rows="2" value=${f.notes} onInput=${set('notes')}></textarea></label>
        ${task.source === 'notion' && html`<p class="muted small">Importée de Notion${task.external_url ? html` · <a href=${task.external_url} target="_blank" rel="noopener">ouvrir</a>` : ''}. Le titre et la deadline se mettent à jour depuis Notion.</p>`}
        <button class="btn primary full" type="submit">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
      </form>

      ${!isNew && !isDone(task) && html`
        <div class="field mt">
          <span class="label">J'ai avancé dessus</span>
          <p class="muted small">${fmtMinutes(task.progress_minutes || 0)} faites${task.estimate_minutes ? ` sur ${fmtMinutes(task.estimate_minutes)}` : ''}. C'est aussi ajouté à ton journal.</p>
          <div class="item-row">
            <select value=${prog} onChange=${(e) => setProg(Number(e.target.value))} aria-label="Durée">
              ${[15, 30, 45, 60, 90, 120, 180, 240].map((m) => html`<option value=${m} selected=${m === prog}>${fmtMinutes(m)}</option>`)}
            </select>
            <button type="button" class="btn" onClick=${() => attempt(() => addProgress(task, prog), `${fmtMinutes(prog)} ajoutées`).then(onClose)}>Ajouter</button>
          </div>
        </div>`}

      ${!isNew && html`
        <div class="row-actions">
          <button class="btn ghost danger" onClick=${() => confirm('Supprimer cette tâche ?') && attempt(() => deleteTask(task.id), 'Supprimée').then(onClose)}>
            <${Icon} name="trash" size=${16} /> Supprimer</button>
          ${!isDone(task) && html`<button class="btn" onClick=${() => attempt(() => updateTask(task.id, { status: 'done', done_at: new Date().toISOString() }), 'Bravo, tâche terminée !').then(onClose)}>
            <${Icon} name="check" size=${16} /> Terminée</button>`}
        </div>`}
    </${Sheet}>`;
}

function TaskRow({ t, info, onOpen, store }) {
  const due = dueLabel(t);
  const done = isDone(t);
  const toggle = (e) => {
    e.stopPropagation();
    attempt(() => updateTask(t.id, done ? { status: 'todo', done_at: null } : { status: 'done', done_at: new Date().toISOString() }), done ? 'Remise à faire' : 'Bravo, tâche terminée !');
  };
  let planText = null;
  if (!done) {
    const guess = !t.estimate_minutes;
    if (guess && info?.first) planText = html`<span>Prévu ${fmtShort(info.first)} ${fmtTime(info.first)} <span class="amber">· durée supposée ${fmtMinutes(store.settings.planDefaultEstimate ?? 60)}, touche pour l'estimer</span></span>`;
    else if (guess && info?.late) planText = html`<span class="red">⚠ même avec ${fmtMinutes(store.settings.planDefaultEstimate ?? 60)}, ça ne rentre pas avant la deadline</span>`;
    else if (guess) planText = html`<span class="amber">⏱ à estimer</span>`;
    else if (remaining(t) === 0) planText = html`<span class="green">Temps prévu atteint : coche-la si elle est finie, ou augmente l'estimation</span>`;
    else if (info?.late) planText = html`<span class="red">⚠ il manque ${fmtMinutes(info.missing)} avant la deadline</span>`;
    else if (info?.first) planText = html`<span>Prévu ${fmtShort(info.first)} ${fmtTime(info.first)}${!sameDay(info.first, info.finish) ? ` → fini ${fmtShort(info.finish)}` : ''}${info.latestStart ? ` · à commencer au plus tard ${fmtShort(info.latestStart)}` : ''}</span>`;
    else if (remaining(t) > 0) planText = html`<span class="muted">pas encore de créneau dans les 4 semaines</span>`;
  }
  const pct = t.estimate_minutes ? Math.min(100, ((t.progress_minutes || 0) / t.estimate_minutes) * 100) : 0;
  return html`
    <li class=${`task ${done ? 'done' : ''}`}>
      <button class="task-check" onClick=${toggle} aria-label=${done ? 'Remettre à faire' : 'Marquer comme terminée'}
        style=${`--p:${PRIORITIES[t.priority]?.color}`}>${done && html`<${Icon} name="check" size=${14} />`}</button>
      <button class="task-main" onClick=${() => onOpen(t)}>
        <span class="task-title">${t.title}${t.source === 'notion' && html` <span class="tag tag-soft">Notion</span>`}</span>
        <span class="task-meta">
          ${due && html`<span class=${due.cls}>${due.text}</span>`}
          ${t.estimate_minutes && !done && html`<span>${fmtMinutes(remaining(t))} restantes</span>`}
          ${t.notes?.startsWith('Projet : ') ? html`<span>${t.notes.slice(9).split('\n')[0]}</span>` : t.category && html`<span>${t.category}</span>`}
        </span>
        ${planText && html`<span class="task-plan small">${planText}</span>`}
        ${pct > 0 && !done && html`<span class="progress thin"><span style=${`width:${pct}%;background:${PRIORITIES[t.priority]?.color}`}></span></span>`}
      </button>
    </li>`;
}

function TodoList({ store, plan, onOpen }) {
  const open = store.tasks.filter((t) => !isDone(t));
  if (!open.length) return html`<section class="card"><${Empty}>Rien à faire. Ajoute une tâche avec le bouton « Ajouter ».</${Empty}></section>`;
  return Object.entries(PRIORITIES).map(([k, p]) => {
    const list = open.filter((t) => (t.priority || 'normale') === k)
      .sort((a, b) => (a.due_date || '9999') .localeCompare(b.due_date || '9999'));
    if (!list.length) return null;
    return html`
      <section class="card flush">
        <div class="list-head"><i style=${`background:${p.color}`}></i>${p.label}<span class="count">${list.length}</span></div>
        <ul class="tasks">${list.map((t) => html`<${TaskRow} key=${t.id} store=${store} t=${t} info=${plan.info[t.id]} onOpen=${onOpen} />`)}</ul>
      </section>`;
  });
}

// Ce qu'on peut faire d'un bloc proposé : le marquer fait, le déplacer, ou dire "pas dispo"
function BlockSheet({ block, store, onOpenTask, onClose }) {
  const t = block.task;
  const st = store.settings;
  const [moving, setMoving] = useState(false);
  const [f, setF] = useState({ date: isoDate(block.start), time: fmtTime(block.start), minutes: block.minutes });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isThis = (p) => p.taskId === t.id && new Date(p.start).getTime() === block.start.getTime();

  const newStart = new Date(`${f.date}T${f.time}`);
  const newEnd = new Date(newStart.getTime() + Number(f.minutes) * 60000);
  const clash = moving && store.events.find((e) => new Date(e.starts_at) < newEnd && new Date(e.ends_at) > newStart);

  const move = async (e) => {
    e.preventDefault();
    const { planPins, planBlocks } = prune(st);
    const pins = planPins.filter((p) => !isThis(p));
    pins.push({ taskId: t.id, start: newStart.toISOString(), minutes: Number(f.minutes) });
    if (await attempt(() => saveSettings({ planPins: pins, planBlocks }), `Bloc placé ${fmtShort(newStart)} à ${fmtTime(newStart)}`)) onClose();
  };
  const unpin = async () => {
    const { planPins, planBlocks } = prune(st);
    if (await attempt(() => saveSettings({ planPins: planPins.filter((p) => !isThis(p)), planBlocks }), 'Rendu au planning automatique')) onClose();
  };
  const notFree = async (wholeDay) => {
    const { planPins, planBlocks } = prune(st);
    const end = new Date(block.start); end.setHours(st.dayEnd, 0, 0, 0);
    planBlocks.push({ start: block.start.toISOString(), end: (wholeDay ? end : block.end).toISOString() });
    const msg = wholeDay ? 'Plus rien de planifié ce jour-là après cette heure' : 'Créneau libéré : le bloc est replacé ailleurs';
    if (await attempt(() => saveSettings({ planPins: block.pinned ? planPins.filter((p) => !isThis(p)) : planPins, planBlocks }), msg)) onClose();
  };

  return html`
    <${Sheet} title=${t.title} onClose=${onClose}>
      <p class="muted">${fmtDay(block.start)} · ${fmtTime(block.start)}–${fmtTime(block.end)} (${fmtMinutes(block.minutes)})
        ${block.pinned ? ' · 📌 placé par toi' : ' · proposé automatiquement'}</p>

      ${!moving ? html`
        <div class="action-list">
          <button class="action" onClick=${() => attempt(() => addProgress(t, block.minutes), `${fmtMinutes(block.minutes)} ajoutées`).then(onClose)}>
            <${Icon} name="check" /><span><b>C'est fait</b><small>Ajoute ${fmtMinutes(block.minutes)} à la tâche et au journal</small></span></button>
          <button class="action" onClick=${() => setMoving(true)}>
            <${Icon} name="calendar" /><span><b>Déplacer</b><small>Choisis toi-même le jour et l'heure</small></span></button>
          <button class="action" onClick=${() => notFree(false)}>
            <${Icon} name="x" /><span><b>Pas dispo à ce moment-là</b><small>Le planning le replace ailleurs</small></span></button>
          <button class="action" onClick=${() => notFree(true)}>
            <${Icon} name="stop" /><span><b>Pas dispo jusqu'à la fin de la journée</b><small>Soirée off, sortie, repos…</small></span></button>
          ${block.pinned && html`<button class="action" onClick=${unpin}>
            <${Icon} name="left" /><span><b>Rendre au planning automatique</b><small>Annule ton déplacement</small></span></button>`}
          <button class="action" onClick=${() => { onClose(); onOpenTask(t); }}>
            <${Icon} name="tasks" /><span><b>Ouvrir la tâche</b><small>Estimation, deadline, urgence…</small></span></button>
        </div>` : html`
        <form onSubmit=${move}>
          <div class="grid3">
            <label class="field"><span class="label">Jour</span><input type="date" value=${f.date} onInput=${set('date')} required /></label>
            <label class="field"><span class="label">Heure</span><input type="time" value=${f.time} onInput=${set('time')} step="900" required /></label>
            <label class="field"><span class="label">Durée</span>
              <select onChange=${set('minutes')}>${[30, 45, 60, 90, 120, 150, 180, 240].map((m) => html`<option value=${m} selected=${m === Number(f.minutes)}>${fmtMinutes(m)}</option>`)}</select></label>
          </div>
          ${clash && html`<p class="warn">Attention : ça chevauche « ${clash.title} » (${fmtTime(clash.starts_at)}–${fmtTime(clash.ends_at)}).</p>`}
          <p class="muted small">Le bloc restera à cette heure (📌). Le reste de la tâche sera planifié automatiquement autour.</p>
          <div class="row-actions">
            <button type="button" class="btn ghost" onClick=${() => setMoving(false)}>Retour</button>
            <button class="btn primary" type="submit">Placer ici</button>
          </div>
        </form>`}
    </${Sheet}>`;
}

// Le planning proposé, jour par jour
export function PlanDays({ plan, store, days = 14, onOpen }) {
  const [block, setBlock] = useState(null);
  const today = new Date();
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i), key = isoDate(d);
    const blocks = plan.blocks.filter((b) => b.day === key);
    const free = Math.max(0, (plan.freeByDay[key] || 0) - (plan.usedByDay[key] || 0));
    out.push(html`
      <section class="card">
        <div class="card-head">
          <h2 class="cap">${i === 0 ? 'Aujourd\'hui' : i === 1 ? 'Demain' : fmtDay(d)}</h2>
          <span class="muted small">${fmtMinutes(plan.usedByDay[key] || 0)} planifiées · ${fmtMinutes(free)} encore libres</span>
        </div>
        ${blocks.length ? html`
          <ul class="events">
            ${blocks.map((b) => html`
              <li class="event plan">
                <button class="event-btn" onClick=${() => setBlock(b)}>
                  <span class="event-time">${fmtTime(b.start)}<small>${fmtTime(b.end)}</small></span>
                  <span class="event-bar" style=${`background:${PRIORITIES[b.task.priority]?.color}`}></span>
                  <span class="event-main">
                    <span class="event-title">${b.pinned ? '📌 ' : ''}${b.task.title}</span>
                    <span class="event-meta">${fmtMinutes(b.minutes)} · ${PRIORITIES[b.task.priority]?.label}${b.task.due_date ? ` · deadline ${fmtShort(b.task.due_date + 'T12:00')}` : ''}</span>
                  </span>
                  <span class="muted" aria-hidden="true">⋯</span>
                </button>
              </li>`)}
          </ul>` : html`<${Empty}>Rien de planifié.</${Empty}>`}
      </section>`);
  }
  return html`
    <p class="muted small hint">Touche un bloc pour le déplacer, le marquer fait ou dire que tu n'es pas dispo.</p>
    ${out}
    ${block && html`<${BlockSheet} block=${block} store=${store} onOpenTask=${onOpen} onClose=${() => setBlock(null)} />`}`;
}

export function Tasks({ store }) {
  const plan = usePlan(store);
  const [tab, setTab] = useState('todo');
  const [open, setOpen] = useState(null);
  const done = store.tasks.filter(isDone).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const totalLeft = store.tasks.filter((t) => !isDone(t)).reduce((a, t) => a + remaining(t), 0);

  const onImport = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const r = await importCsv(await file.text(), store);
      const skipped = [r.closed && `${r.closed} terminée(s)/annulée(s)`, r.others && `${r.others} d'autres personnes`, r.duplicates && `${r.duplicates} déjà présente(s)`].filter(Boolean).join(', ');
      toast(`${r.added} tâche(s) importée(s)${skipped ? ` · ignorées : ${skipped}` : ''}${r.added ? '. Estime leur durée pour les planifier.' : ''}`);
    } catch (err) { toast('Erreur : ' + err.message); }
  };

  return html`
    <${PageHead} title="Tâches" sub=${`${fmtMinutes(totalLeft)} de travail à placer · planning auto sur 4 semaines`}>
      <button class="btn primary" onClick=${() => setOpen({})}><${Icon} name="plus" size=${18} /> Ajouter</button>
    </${PageHead}>

    ${(plan.late.length > 0 || plan.unestimated.length > 0) && html`
      <section class=${`card alert ${plan.late.length ? '' : 'soft'}`}>
        ${plan.late.map((t) => html`
          <p><b class="red">⚠ ${t.title}</b> : il manque ${fmtMinutes(plan.info[t.id].missing)} avant le ${fmtShort(t.due_date + 'T12:00')}.
            ${plan.info[t.id].latestStart === null ? ' Libère du temps dans l\'agenda, baisse une autre tâche ou augmente ton max/jour.' : ''}</p>`)}
        ${plan.unestimated.length > 0 && html`<p class="amber">⏱ ${plan.unestimated.length} tâche${plan.unestimated.length > 1 ? 's' : ''} sans estimation : planifiée${plan.unestimated.length > 1 ? 's' : ''} avec ${fmtMinutes(store.settings.planDefaultEstimate ?? 60)} par défaut. Touche-les pour indiquer leur vraie durée.</p>`}
      </section>`}

    <div class="seg tabs" role="tablist">
      <button role="tab" aria-selected=${tab === 'todo'} class=${tab === 'todo' ? 'on' : ''} onClick=${() => setTab('todo')}>À faire</button>
      <button role="tab" aria-selected=${tab === 'plan'} class=${tab === 'plan' ? 'on' : ''} onClick=${() => setTab('plan')}>Planning</button>
      <button role="tab" aria-selected=${tab === 'done'} class=${tab === 'done' ? 'on' : ''} onClick=${() => setTab('done')}>Terminées ${done.length > 0 && html`<span class="count">${done.length}</span>`}</button>
    </div>

    ${tab === 'todo' && html`<${TodoList} store=${store} plan=${plan} onOpen=${setOpen} />`}
    ${tab === 'plan' && html`<${PlanDays} plan=${plan} store=${store} onOpen=${setOpen} />`}
    ${tab === 'done' && html`
      <section class="card flush">
        ${done.length ? html`<ul class="tasks">${done.map((t) => html`<${TaskRow} key=${t.id} store=${store} t=${t} onOpen=${setOpen} />`)}</ul>`
          : html`<div class="pad"><${Empty}>Aucune tâche terminée pour l'instant.</${Empty}></div>`}
      </section>`}

    ${tab === 'todo' && html`
      <p class="muted small center import">
        Tes deadlines sont dans Notion ? Exporte la base en CSV (⋯ → Exporter → CSV) puis${' '}
        <label class="link small">importe le fichier<input type="file" accept=".csv,text/csv" hidden onChange=${onImport} /></label>.
      </p>`}

    ${open && html`<${TaskSheet} task=${open} settings=${store.settings} onClose=${() => setOpen(null)} />`}`;
}
