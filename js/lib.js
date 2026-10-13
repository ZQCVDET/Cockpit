// Boîte à outils partagée : Preact (l'affichage), dates, couleurs, calcul du temps libre.

// Preact + htm : une mini-version de React qui fonctionne sans étape de compilation.
// `html` permet d'écrire l'interface directement en JavaScript : html`<div>Bonjour</div>`.
export {
  html, render, useState, useEffect, useMemo, useRef, useCallback,
} from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';

// ── Types d'événements de l'agenda ──────────────────────────
export const KINDS = {
  cours:   { label: 'Cours',        color: 'var(--c-blue)' },
  reunion: { label: 'Réunion',      color: 'var(--c-violet)' },
  club:    { label: 'Club (SCR)',   color: 'var(--c-amber)' },
  job:     { label: 'Job',          color: 'var(--c-cyan)' },
  examen:  { label: 'Examen',       color: 'var(--c-red)' },
  loisir:  { label: 'Loisirs',      color: 'var(--c-pink)' },   // piano, sport…
  perso:   { label: 'Perso',        color: 'var(--c-gray)' },
};

// Statut d'une séance de cours. `null` = pas encore pointée.
export const STATUS = {
  present:   { label: 'Assisté',   cls: 'tag-soft' },
  rate:      { label: 'Raté',      cls: 'tag-red' },
  rattrape:  { label: 'Rattrapé',  cls: 'tag-green' },
};
// Une séance passée sans statut est "à pointer"
export const isPast = (e, now = new Date()) => new Date(e.ends_at) < now;
export const toPoint = (e, now = new Date()) => e.kind === 'cours' && !e.status && isPast(e, now);

// ── Réglages par défaut ─────────────────────────────────────
export const DEFAULT_SETTINGS = {
  firstName: '',
  dayStart: 8,          // heure de début de journée "utile"
  dayEnd: 23,           // heure de fin de journée "utile"
  fixed: [              // engagements hebdo non planifiés dans l'agenda (estimation)
    { label: 'Solvay Campus Recruitment', hours: 12 },
    { label: 'Repas & trajets', hours: 14 },
  ],
  categories: [
    { name: 'SCR (club)',     color: '#d97706' },
    { name: 'Étude / cours',  color: '#2563eb' },
    { name: 'GMAT',           color: '#7c3aed' },
    { name: 'Mise en Scène',  color: '#059669' },
    { name: 'Projet perso',   color: '#64748b' },
    { name: 'Piano / loisirs', color: '#db2777' },
  ],
  examStart: '2027-01-04',
  examLabel: 'Session de janvier',
  timer: null,          // chrono en cours : { start, category, subject }
  // Planning automatique
  planMaxPerDay: 4,     // heures de travail perso max par jour
  planBlockMax: 120,    // durée max d'un bloc (minutes)
  planBefore: 15,       // marge avant un cours / une réunion (minutes)
  planAfter: 45,        // pause après un cours / une réunion : discuter, souffler… (minutes)
  planCommute: 30,      // trajet domicile ↔ campus, avant la 1re et après la dernière activité du jour (minutes)
  planPins: [],         // blocs que tu as déplacés toi-même : [{ taskId, start, minutes }]
  planBlocks: [],       // créneaux marqués "pas dispo" : [{ start, end }]
};
// Types d'événements qui demandent un trajet (sur place). Les loisirs et le perso n'en ont pas.
export const ON_SITE = ['cours', 'reunion', 'club', 'examen', 'job'];

// ── Dates ───────────────────────────────────────────────────
export const DAY = 86400000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d) => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 6) % 7)); }; // lundi
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const isoDate = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;

const fr = (opts) => new Intl.DateTimeFormat('fr-BE', opts);
export const fmtTime = (d) => fr({ hour: '2-digit', minute: '2-digit' }).format(new Date(d));
export const fmtDay = (d) => fr({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
export const fmtShort = (d) => fr({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
export const fmtMonth = (d) => fr({ month: 'long', year: 'numeric' }).format(new Date(d));

// 90 → "1 h 30" ; 0.5 h → "30 min"
export const fmtMinutes = (m) => {
  m = Math.round(m);
  const h = Math.floor(Math.abs(m) / 60), r = Math.abs(m) % 60, s = m < 0 ? '−' : '';
  if (!h) return `${s}${r} min`;
  return r ? `${s}${h} h ${String(r).padStart(2, '0')}` : `${s}${h} h`;
};
export const fmtHours = (h) => {
  const v = Math.round(h * 2) / 2; // arrondi à la demi-heure
  return `${String(v).replace('.', ',')} h`;
};

// Couleur stable pour un nom de cours (même nom → même couleur)
const PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626', '#4f46e5', '#65a30d', '#c026d3'];
export const colorFor = (name = '') => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// ── Calcul du temps libre de la semaine ─────────────────────
// capacité = (fin − début de journée) × 7
// libre    = capacité − événements de l'agenda − engagements fixes estimés
export function weekBudget(events, settings, weekStart, now = new Date()) {
  const perDay = Math.max(0, settings.dayEnd - settings.dayStart);
  const capacity = perDay * 7;
  const weekEnd = addDays(weekStart, 7);
  const inWeek = events.filter((e) => new Date(e.starts_at) < weekEnd && new Date(e.ends_at) > weekStart);

  const byKind = {};
  for (const e of inWeek) byKind[e.kind] = (byKind[e.kind] || 0) + hoursBetween(e.starts_at, e.ends_at);
  const scheduled = Object.values(byKind).reduce((a, b) => a + b, 0);
  const fixed = (settings.fixed || []).reduce((a, f) => a + (Number(f.hours) || 0), 0);

  // Ce qu'il reste à partir de maintenant (dans les plages "utiles" de chaque jour)
  let windowLeft = 0, eventsLeft = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const from = new Date(d); from.setHours(settings.dayStart, 0, 0, 0);
    const to = new Date(d); to.setHours(settings.dayEnd, 0, 0, 0);
    const a = Math.max(from, now), b = to.getTime();
    if (b <= a) continue;
    windowLeft += (b - a) / 3600000;
    for (const e of inWeek) {
      const s = Math.max(new Date(e.starts_at), a), t = Math.min(new Date(e.ends_at), b);
      if (t > s) eventsLeft += (t - s) / 3600000;
    }
  }
  const fixedLeft = capacity ? fixed * (windowLeft / capacity) : 0;

  return {
    capacity, byKind, scheduled, fixed,
    free: capacity - scheduled - fixed,
    freeLeft: Math.max(0, windowLeft - eventsLeft - fixedLeft),
  };
}

// Petit identifiant unique (mode démo)
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
