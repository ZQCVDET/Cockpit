// Planning automatique : répartit le temps de tes tâches dans tes créneaux libres.
//
// Le principe, en 4 étapes :
//  1. On cherche tes créneaux libres pour les 4 prochaines semaines : ta journée "utile"
//     (Réglages) moins tout ce qui est dans l'agenda, en gardant du temps pour souffler :
//     une marge avant chaque cours/réunion, une pause après, et le trajet domicile ↔ campus
//     avant la 1re et après la dernière activité de la journée. Les créneaux que tu as
//     marqués "pas dispo" et les blocs que tu as placés toi-même sont aussi retirés.
//  2. On trie les tâches : deadline la plus proche d'abord. Une tâche sans deadline reçoit
//     une deadline "implicite" selon son urgence (Urgent = 2 jours, Important = 1 semaine…).
//  3. On remplit les créneaux dans cet ordre, par blocs (max 2 h par défaut, 15 min de pause),
//     sans dépasser ton maximum d'heures de travail perso par jour.
//  4. Si une tâche ne rentre pas avant sa deadline → alerte « il manque X h ».

import { useMemo, addDays, startOfDay, isoDate, DAY, ON_SITE, counts } from './lib.js';

export const PRIORITIES = {
  urgent:  { label: 'Urgent',              color: 'var(--c-red)',    days: 2,  rank: 0 },
  haute:   { label: 'Important',           color: 'var(--c-amber)',  days: 7,  rank: 1 },
  normale: { label: 'Normal',              color: 'var(--c-blue)',   days: 14, rank: 2 },
  basse:   { label: 'Quand j\'ai le temps', color: 'var(--c-gray)',  days: 30, rank: 3 },
};

export const isDone = (t) => t.status === 'done' || t.external_done;
export const remaining = (t) => Math.max(0, (t.estimate_minutes || 0) - (t.progress_minutes || 0));
export const dueEnd = (t) => (t.due_date ? new Date(`${t.due_date}T23:59:59`) : null);
export const daysLeft = (t, now = new Date()) => (t.due_date ? Math.round((startOfDay(new Date(`${t.due_date}T12:00`)) - startOfDay(now)) / DAY) : null);

const MIN = 60000;
const HORIZON_DAYS = 28;
const PAUSE = 15; // minutes entre deux blocs de travail

// Les moments où tu n'es PAS disponible pour travailler : [[début, fin], …] en millisecondes
export function busyTimes(events, settings, extra = []) {
  const before = (settings.planBefore ?? settings.planBuffer ?? 15) * MIN;
  const after = (settings.planAfter ?? 45) * MIN;
  const commute = (settings.planCommute ?? 30) * MIN;
  const busy = [];
  const onSiteByDay = {};
  for (const e of events) {
    if (!counts(e)) continue;               // agenda à la carte : seulement si tu y vas
    const s = new Date(e.starts_at).getTime(), t = new Date(e.ends_at).getTime();
    busy.push([s - before, t + after]);
    if (ON_SITE.includes(e.kind)) (onSiteByDay[isoDate(e.starts_at)] ||= []).push([s, t]);
  }
  // Trajet : aller avant la 1re activité sur place du jour, retour après la dernière
  if (commute) {
    for (const list of Object.values(onSiteByDay)) {
      const first = Math.min(...list.map((x) => x[0]));
      const last = Math.max(...list.map((x) => x[1]));
      busy.push([first - before - commute, first]);
      busy.push([last, last + after + commute]);
    }
  }
  for (const b of settings.planBlocks || []) busy.push([new Date(b.start).getTime(), new Date(b.end).getTime()]);
  busy.push(...extra);
  return busy.sort((a, b) => a[0] - b[0]);
}

// 1. Créneaux libres : [{ start, end, day }]
export function freeSlots(events, settings, from = new Date(), days = HORIZON_DAYS, extra = []) {
  const minLen = 30 * MIN;
  const busy = busyTimes(events, settings, extra);
  const now = Math.ceil(from.getTime() / (15 * MIN)) * 15 * MIN; // arrondi au quart d'heure suivant
  const slots = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(startOfDay(from), i);
    const a0 = new Date(d); a0.setHours(settings.dayStart, 0, 0, 0);
    const b0 = new Date(d); b0.setHours(settings.dayEnd, 0, 0, 0);
    let cur = Math.max(a0.getTime(), now);
    const end = b0.getTime();
    for (const [s, e] of busy) {
      if (e <= cur || s >= end) continue;
      if (s - cur >= minLen) slots.push({ start: cur, end: s, day: isoDate(d) });
      cur = Math.max(cur, e);
    }
    if (end - cur >= minLen) slots.push({ start: cur, end, day: isoDate(d) });
  }
  return slots;
}

// 2 + 3 + 4. Le planning
export function plan(tasks, events, settings, now = new Date()) {
  const cap = (settings.planMaxPerDay ?? 4) * 60;     // minutes de travail perso max par jour
  const blockMax = settings.planBlockMax ?? 120;       // minutes max d'affilée
  const used = {};                                     // minutes déjà planifiées par jour
  const blocks = [];
  const open = tasks.filter((t) => !isDone(t));
  const byId = Object.fromEntries(open.map((t) => [t.id, t]));

  // Les blocs que tu as placés toi-même passent en premier et ne bougent pas
  const pinnedMin = {};
  const pinBusy = [];
  (settings.planPins || []).forEach((p, index) => {
    const t = byId[p.taskId];
    const start = new Date(p.start), end = new Date(start.getTime() + p.minutes * MIN);
    if (!t || end <= now) return;
    blocks.push({ task: t, start, end, minutes: p.minutes, day: isoDate(start), pinned: true, pinIndex: index });
    used[isoDate(start)] = (used[isoDate(start)] || 0) + p.minutes;
    pinnedMin[t.id] = (pinnedMin[t.id] || 0) + p.minutes;
    pinBusy.push([start.getTime(), end.getTime() + PAUSE * MIN]);
  });

  const slots = freeSlots(events, settings, now, HORIZON_DAYS, pinBusy).map((s) => ({ ...s, cursor: s.start }));
  const effDue = (t) => dueEnd(t)?.getTime() ?? now.getTime() + PRIORITIES[t.priority || 'normale'].days * DAY;
  const todo = open.filter((t) => remaining(t) > 0)
    .sort((a, b) => effDue(a) - effDue(b) || PRIORITIES[a.priority || 'normale'].rank - PRIORITIES[b.priority || 'normale'].rank);

  const info = {};
  for (const t of todo) {
    let need = Math.max(0, remaining(t) - (pinnedMin[t.id] || 0));
    const limit = dueEnd(t)?.getTime() ?? Infinity;
    for (const s of slots) {
      if (need <= 0) break;
      while (need > 0) {
        const room = (Math.min(s.end, limit) - s.cursor) / MIN;
        const capLeft = cap - (used[s.day] || 0);
        const len = Math.min(need, blockMax, room, capLeft);
        if (len < Math.min(30, need)) break;            // pas de bloc ridicule (sauf la fin d'une tâche)
        blocks.push({ task: t, start: new Date(s.cursor), end: new Date(s.cursor + len * MIN), minutes: len, day: s.day });
        s.cursor += (len + PAUSE) * MIN;
        used[s.day] = (used[s.day] || 0) + len;
        need -= len;
      }
    }
    const mine = blocks.filter((b) => b.task === t).sort((a, b) => a.start - b.start);
    info[t.id] = {
      first: mine[0]?.start ?? null,
      finish: mine.length ? mine[mine.length - 1].end : null,
      missing: need,                                     // minutes qui ne rentrent pas avant la deadline / l'horizon
      late: !!t.due_date && need > 0,
      latestStart: t.due_date ? latestStart(t, events, settings, now) : null,
    };
  }
  blocks.sort((a, b) => a.start - b.start);
  return {
    blocks,
    info,
    late: todo.filter((t) => info[t.id].late),
    unestimated: open.filter((t) => !t.estimate_minutes),
    freeByDay: slots.reduce((m, s) => { m[s.day] = (m[s.day] || 0) + (s.end - s.start) / MIN; return m; }, {}),
    usedByDay: used,
  };
}

// « À commencer au plus tard le… » : en partant de la deadline et en remontant le temps,
// quand faut-il commencer si on ne faisait QUE cette tâche ?
function latestStart(t, events, settings, now) {
  const cap = (settings.planMaxPerDay ?? 4) * 60;
  const due = dueEnd(t).getTime();
  const days = Math.max(1, Math.ceil((due - now.getTime()) / DAY) + 1);
  const slots = freeSlots(events, settings, now, days).filter((s) => s.start < due).reverse();
  let need = remaining(t);
  const used = {};
  for (const s of slots) {
    const end = Math.min(s.end, due);
    const take = Math.min((end - s.start) / MIN, cap - (used[s.day] || 0), need);
    if (take <= 0) continue;
    used[s.day] = (used[s.day] || 0) + take;
    need -= take;
    if (need <= 0) return new Date(end - take * MIN);
  }
  return null; // impossible même en s'y mettant maintenant
}

// Utilisable dans n'importe quel écran
export const usePlan = (store) => useMemo(
  () => plan(store.tasks, store.events, store.settings),
  [store.tasks, store.events, store.settings],
);

// Nettoie les blocs déplacés / créneaux bloqués qui sont déjà passés
export const prune = (settings, now = new Date()) => ({
  planPins: (settings.planPins || []).filter((p) => new Date(p.start).getTime() + p.minutes * MIN > now),
  planBlocks: (settings.planBlocks || []).filter((b) => new Date(b.end) > now),
});
