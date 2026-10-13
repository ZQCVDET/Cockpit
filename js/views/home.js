// Accueil : vue d'ensemble de la semaine.
import {
  html, useMemo, KINDS, weekBudget, toPoint, startOfWeek, startOfMonth, sameDay, fmtTime, fmtDay,
  fmtHours, fmtMinutes, isoDate, DAY, startOfDay,
} from '../lib.js';
import { StackBar, Icon } from '../ui.js';
import { EventList } from './agenda.js';
import { usePlan, isDone, PRIORITIES } from '../planner.js';

export function Home({ store, go }) {
  const { events, logs, newsletters, settings } = store;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const b = useMemo(() => weekBudget(events, settings, weekStart, now), [events, settings]);

  const today = events.filter((e) => sameDay(e.starts_at, now));
  const next = events.find((e) => new Date(e.starts_at) > now);
  const toCatchUp = events.filter((e) => e.kind === 'cours' && e.status === 'rate').length;
  const pending = events.filter((e) => toPoint(e, now)).length;
  const weekKey = isoDate(weekStart), monthKey = isoDate(startOfMonth(now));
  const weekMin = logs.filter((l) => l.day >= weekKey).reduce((a, l) => a + l.minutes, 0);
  const monthMin = logs.filter((l) => l.day >= monthKey).reduce((a, l) => a + l.minutes, 0);
  const unread = newsletters.filter((n) => !n.is_read).length;
  const daysToExam = Math.ceil((startOfDay(new Date(settings.examStart)) - startOfDay(now)) / DAY);

  const plan = usePlan(store);
  const todayKey = isoDate(now);
  const todayBlocks = plan.blocks.filter((bl) => bl.day === todayKey);
  const openTasks = store.tasks.filter((t) => !isDone(t)).length;

  const hour = now.getHours();
  const hello = hour < 6 ? 'Bonne nuit' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  const parts = [
    ...Object.entries(KINDS).map(([k, v]) => ({ label: v.label, value: b.byKind[k] || 0, color: v.color })),
    { label: 'Engagements fixes', value: b.fixed, color: 'var(--c-slate)' },
    { label: 'Libre', value: Math.max(0, b.free), color: 'var(--c-free)' },
  ];

  return html`
    <header class="page-head">
      <div>
        <p class="muted cap">${fmtDay(now)}</p>
        <h1>${hello}${settings.firstName ? `, ${settings.firstName}` : ''}</h1>
      </div>
    </header>

    ${settings.timer && html`
      <button class="card timer-chip" onClick=${() => go('journal')}>
        <span class="live-dot">●</span> Chrono en cours · ${settings.timer.category}${settings.timer.subject ? ` · ${settings.timer.subject}` : ''}
        <span class="muted">depuis ${fmtTime(settings.timer.start)}</span>
      </button>`}

    <section class="card hero">
      <div class="hero-top">
        <p class="label">Temps libre restant cette semaine</p>
        <p class="big">${fmtHours(b.freeLeft)}</p>
        <p class="muted small">${fmtHours(Math.max(0, b.free))} libres sur toute la semaine · capacité ${b.capacity} h</p>
      </div>
      <${StackBar} parts=${parts} total=${b.capacity} />
      <ul class="legend">
        ${parts.filter((p) => p.value > 0).map((p) => html`
          <li><i style=${`background:${p.color}`}></i>${p.label}<b>${fmtHours(p.value)}</b></li>`)}
      </ul>
      ${b.free < 0 && html`<p class="warn">Semaine surchargée : ${fmtHours(-b.free)} de plus que ton temps disponible.</p>`}
    </section>

    <div class="tiles">
      <button class="tile" onClick=${() => go('cours')}>
        <span class="label">À rattraper</span>
        <span class=${`tile-num ${toCatchUp ? 'red' : ''}`}>${toCatchUp}</span>
        <span class="muted">séance${toCatchUp > 1 ? 's' : ''}${pending ? ` · ${pending} à pointer` : ''}</span>
      </button>
      <button class="tile" onClick=${() => go('journal')}>
        <span class="label">Travaillé</span>
        <span class="tile-num">${fmtMinutes(weekMin)}</span>
        <span class="muted">cette semaine · ${fmtMinutes(monthMin)} ce mois</span>
      </button>
      <div class="tile">
        <span class="label">${settings.examLabel}</span>
        <span class="tile-num">${daysToExam > 0 ? `J−${daysToExam}` : '—'}</span>
        <span class="muted">${daysToExam > 0 ? `${Math.floor(daysToExam / 7)} semaines` : 'en cours ou passée'}</span>
      </div>
      <button class="tile" onClick=${() => go('news')}>
        <span class="label">Newsletters</span>
        <span class="tile-num">${unread}</span>
        <span class="muted">non lue${unread > 1 ? 's' : ''}</span>
      </button>
    </div>

    <section class="card">
      <div class="card-head">
        <h2>Aujourd'hui</h2>
        <button class="link" onClick=${() => go('agenda')}>Agenda <${Icon} name="right" size=${16} /></button>
      </div>
      ${today.length
        ? html`<${EventList} events=${today} />`
        : html`<p class="muted">Rien de prévu aujourd'hui.${next ? ` Prochain : ${next.title}, ${fmtDay(next.starts_at)} à ${fmtTime(next.starts_at)}.` : ''}</p>`}
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Ton planning de travail</h2>
        <button class="link" onClick=${() => go('taches')}>${openTasks} tâche${openTasks > 1 ? 's' : ''} <${Icon} name="right" size=${16} /></button>
      </div>
      ${plan.late.length > 0 && html`<p class="warn">⚠ ${plan.late.length} tâche${plan.late.length > 1 ? 's' : ''} ne rentre${plan.late.length > 1 ? 'nt' : ''} pas avant la deadline : ${plan.late.map((t) => t.title).join(', ')}.</p>`}
      ${todayBlocks.length
        ? html`<ul class="events mt-s">${todayBlocks.map((bl) => html`
            <li class="event plan"><div class="event-btn">
              <span class="event-time">${fmtTime(bl.start)}<small>${fmtTime(bl.end)}</small></span>
              <span class="event-bar" style=${`background:${PRIORITIES[bl.task.priority]?.color}`}></span>
              <span class="event-main"><span class="event-title">${bl.task.title}</span>
                <span class="event-meta">${fmtMinutes(bl.minutes)} · ${PRIORITIES[bl.task.priority]?.label}</span></span>
            </div></li>`)}</ul>`
        : html`<p class="muted">${openTasks ? 'Rien de planifié aujourd\'hui : profite ou avance sur une tâche « Quand j\'ai le temps ».' : 'Aucune tâche en cours. Ajoute tes deadlines dans Tâches.'}</p>`}
    </section>`;
}
