// État global de l'app : toutes les données chargées + les actions pour les modifier.
// Chaque écran lit l'état via useStore() et se met à jour automatiquement.

import { db } from './db.js';
import { useState, useEffect, DEFAULT_SETTINGS, addDays, markChoices } from './lib.js';

const state = {
  ready: false,
  error: null,
  events: [],
  logs: [],
  newsletters: [],
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
};
const listeners = new Set();
const emit = () => {
  markChoices(state.events, state.settings); // repère les cours à choix (plusieurs groupes / profs)
  listeners.forEach((fn) => fn({ ...state }));
};

export function useStore() {
  const [s, set] = useState({ ...state });
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
  return s;
}

const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);

// ── Chargement ──────────────────────────────────────────────
export async function loadAll() {
  try {
    // On charge l'agenda à partir de ~5 mois en arrière (couvre tout le quadrimestre)
    const since = addDays(new Date(), -150).toISOString();
    const [events, logs, newsletters, tasks, settings] = await Promise.all([
      db.select('events', { order: 'starts_at', since: { column: 'starts_at', value: since } }),
      db.select('work_logs', { order: 'day', asc: false }),
      db.select('newsletters', {
        columns: 'id,sender,subject,snippet,received_at,is_read,thread_id',
        order: 'received_at', asc: false, limit: 100,
      }),
      db.select('tasks', { order: 'created_at' }),
      db.getSettings(),
    ]);
    Object.assign(state, {
      events, logs, newsletters, tasks,
      settings: { ...DEFAULT_SETTINGS, ...settings },
      ready: true, error: null,
    });
  } catch (err) {
    console.error(err);
    state.error = err.message || String(err);
    state.ready = true;
  }
  emit();
}

// ── Agenda ──────────────────────────────────────────────────
export async function addEvents(rows) {
  const created = await db.insert('events', rows);
  state.events = [...state.events, ...created].sort(byStart); emit();
}
export async function updateEvent(id, patch) {
  const row = await db.update('events', id, patch);
  state.events = state.events.map((e) => (e.id === id ? { ...e, ...row } : e)); emit();
}
// Modifie plusieurs séances d'un coup (pointage en lot)
export async function updateEvents(ids, patch) {
  await db.updateMany('events', ids, patch);
  const set = new Set(ids);
  state.events = state.events.map((e) => (set.has(e.id) ? { ...e, ...patch } : e)); emit();
}
// Cours à choix, pour UNE semaine :
//  "J'y vais" → cette séance compte (les autres choix de la semaine sont annulés)
//  "Je n'y vais pas" → elle ne compte pas, et ne va jamais dans "à rattraper"
export async function chooseSession(e, going) {
  if (!going) return updateEvent(e.id, { status: 'skip' });
  const others = state.events.filter((x) => x._choice === e._choice && x.id !== e.id && (x.status === 'going' || x.status === 'skip'));
  if (others.length) await updateEvents(others.map((x) => x.id), { status: null });
  await updateEvent(e.id, { status: e._default ? null : 'going' }); // ton groupe habituel compte déjà tout seul
}
// Groupe habituel : compté automatiquement toutes les semaines
export async function setUsualGroup(e, on) {
  await saveSettings({ choiceCourses: { ...state.settings.choiceCourses, [e._courseKey]: on ? e._series : '' } });
}
export async function setChoiceCourse(key, on) {
  const c = { ...state.settings.choiceCourses };
  if (on) c[key] = c[key] || ''; else delete c[key];
  await saveSettings({ choiceCourses: c });
}
export async function deleteEvent(id) {
  await db.remove('events', id);
  state.events = state.events.filter((e) => e.id !== id); emit();
}

// ── Journal de travail ──────────────────────────────────────
export async function addLog(row) {
  const [created] = await db.insert('work_logs', row);
  state.logs = [created, ...state.logs].sort((a, b) => (a.day < b.day ? 1 : -1)); emit();
}
export async function deleteLog(id) {
  await db.remove('work_logs', id);
  state.logs = state.logs.filter((l) => l.id !== id); emit();
}

// ── Tâches ──────────────────────────────────────────────────
export async function addTask(row) {
  const [created] = await db.insert('tasks', row);
  state.tasks = [...state.tasks, created]; emit();
}
export async function updateTask(id, patch) {
  const row = await db.update('tasks', id, patch);
  state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, ...row } : t)); emit();
}
export async function deleteTask(id) {
  await db.remove('tasks', id);
  state.tasks = state.tasks.filter((t) => t.id !== id); emit();
}
// "J'ai avancé de X min" : met à jour la tâche ET ajoute la session au journal
export async function addProgress(task, minutes) {
  await updateTask(task.id, { progress_minutes: (task.progress_minutes || 0) + minutes });
  await addLog({ category: task.category, subject: task.title, minutes, day: new Date().toISOString().slice(0, 10), note: null });
}

// ── Newsletters ─────────────────────────────────────────────
export async function openNewsletter(id) {
  const full = await db.getOne('newsletters', id, 'id,body_html,is_read');
  if (!full.is_read) {
    await db.update('newsletters', id, { is_read: true });
    state.newsletters = state.newsletters.map((n) => (n.id === id ? { ...n, is_read: true } : n)); emit();
  }
  return full.body_html;
}
export async function setNewsletterRead(id, is_read) {
  await db.update('newsletters', id, { is_read });
  state.newsletters = state.newsletters.map((n) => (n.id === id ? { ...n, is_read } : n)); emit();
}

// ── Réglages ────────────────────────────────────────────────
export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch }; emit();
  await db.saveSettings(state.settings);
}

// Recharge quand on revient sur l'app (ex. modif faite depuis un autre appareil)
let last = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.ready && Date.now() - last > 30000) {
    last = Date.now(); loadAll();
  }
});
