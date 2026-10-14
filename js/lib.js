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
  going:     { label: 'J\'y vais',  cls: 'tag-green' },   // événement "à la carte" / séance à choix retenue
  skip:      { label: 'Je n\'y vais pas', cls: 'tag-soft' },
};
// Statuts qui veulent dire "cette séance fait partie de mon planning"
export const CHOSEN = ['going', 'present', 'rate', 'rattrape'];

// Est-ce que l'événement compte (temps libre, planning, cours) ?
//  - agenda à la carte : seulement si "J'y vais"
//  - cours à choix (plusieurs groupes / profs) : seulement ton groupe habituel ou celui choisi cette semaine
export const counts = (e) => (!e.optional || e.status === 'going') && (!e._choice || e._counted);

// Une séance passée pas encore pointée → "à pointer" (pour une séance à choix : seulement celle retenue)
export const isPast = (e, now = new Date()) => new Date(e.ends_at) < now;
export const toPoint = (e, now = new Date()) =>
  e.kind === 'cours' && isPast(e, now) && (e._choice ? e._counted && (!e.status || e.status === 'going') : !e.status);

// ── Cours à choix (même cours proposé par plusieurs assistants / profs, à des horaires différents) ──
export const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Nom du cours sans le groupe / l'assistant : "Econometrics – Exercices (Gr. B – Dupont)" → "Econometrics – Exercices"
export const courseName = (title) => title
  .replace(/\s*[([].*?[)\]]\s*/g, ' ')
  .replace(/\b(gr(ou)?p?e?|grp|gr)\.?\s*[a-z0-9]{1,3}\b/gi, ' ')
  .replace(/\s*[-–—:|]\s*$/, '')
  .replace(/\s+/g, ' ').trim();
// Une "série" = un groupe précis : même titre complet, même jour de la semaine, même heure
export const seriesOf = (e) => { const d = new Date(e.starts_at); return `${plain(e._rawTitle || e.title)}|${d.getDay()}|${d.getHours()}:${d.getMinutes()}`; };

// Marque les séances des cours à choix (Réglages → Cours à choix) :
//  e._choice  = "cours|semaine" : les alternatives d'une même semaine
//  e._default = c'est ton groupe habituel (compté automatiquement chaque semaine)
//  e._counted = la séance fait partie de ton planning (groupe habituel, ou « J'y vais » cette semaine)
//  e._decided = la semaine est réglée (une séance retenue, ou tu as dit « Je n'y vais pas »)
export function markChoices(events, settings) {
  const courses = settings.choiceCourses || {};          // { cours: série habituelle ('' = pas encore choisie) }
  const groups = {};
  for (const e of events) {
    delete e._choice; delete e._counted; delete e._decided; delete e._default; delete e._course; delete e._courseKey; delete e._series;
    if (e.kind !== 'cours') continue;
    const raw = e._rawTitle || e.title;                     // l'intitulé d'origine (avant renommage)
    const key = plain(courseName(raw));
    if (!(key in courses)) continue;
    Object.assign(e, { _course: e._alias || courseName(raw), _courseKey: key, _series: seriesOf(e) });
    e._default = courses[key] === e._series;
    e._choice = `${key}|${isoDate(startOfWeek(e.starts_at))}`;
    (groups[e._choice] ||= []).push(e);
  }
  for (const list of Object.values(groups)) {
    // Si tu vas exceptionnellement à un autre groupe cette semaine, ton groupe habituel ne compte pas
    const override = list.some((e) => !e._default && CHOSEN.includes(e.status));
    list.forEach((e) => { e._counted = CHOSEN.includes(e.status) || (e._default && e.status !== 'skip' && !override); });
    const decided = list.some((e) => e._counted || e.status === 'skip');
    const alternatives = new Set(list.map((e) => e._series)).size;
    list.forEach((e) => { e._decided = decided; e._alternatives = alternatives; });
  }
  return events;
}
// Tous les cours (nom sans groupe/prof) présents dans l'agenda, pour la liste des Réglages
export const courseList = (events) => {
  const m = new Map();
  for (const e of events) if (e.kind === 'cours') { const raw = e._rawTitle || e.title; m.set(plain(courseName(raw)), e._alias || courseName(raw)); }
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
};

// ── Renommage des cours ─────────────────────────────────────
// Règle : si l'intitulé de l'horaire contient "match" (ex. le code GEST-S403), on affiche "name".
// Le type de séance (TP, Exercices, Théorie…) est conservé pour ne pas mélanger TP et théorie.
const SESSION_TYPES = [
  [/\bexam/i, 'Examen'], [/\b(tp|travaux pratiques)\b/i, 'TP'], [/\bexercices?\b|\bex\.?\s/i, 'Exercices'],
  [/\bth[eé]orie\b|\bcours magistral\b|\bcm\b/i, 'Théorie'], [/\bs[eé]minaire\b/i, 'Séminaire'], [/\blabo/i, 'Labo'],
];
export function applyAliases(events, rules) {
  const list = (rules || []).filter((r) => r.match && r.name).map((r) => ({ m: plain(r.match.trim()), name: r.name.trim() }));
  for (const e of events) {
    const raw = e._alias && e.title === e._alias ? e._rawTitle : e.title;
    const rule = ['cours', 'examen'].includes(e.kind) && list.find((r) => plain(raw).includes(r.m));
    if (!rule) { e.title = raw; delete e._alias; delete e._rawTitle; continue; }
    const type = SESSION_TYPES.find(([re]) => re.test(raw.replace(/\(.*?\)/g, ' ')))?.[1];
    e._rawTitle = raw;
    e._alias = type ? `${rule.name} – ${type}` : rule.name;
    e.title = e._alias;
  }
  return events;
}
// Ce qui distingue les groupes d'un même cours : le contenu entre parenthèses de l'intitulé d'origine
export const groupInfo = (e) => (e._rawTitle || '').match(/\(([^)]*)\)/)?.[1] || '';

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
  choiceCourses: {},    // cours à choix : { cours: groupe habituel } (voir Réglages)
  courseAliases: [      // noms affichés pour les cours (voir Réglages → Noms des cours)
    { match: 'GEST-S403', name: 'Advanced Marketing Management (GEST-S403)' },
    { match: 'GEST-S407', name: 'Operations management (GEST-S407)' },
    { match: 'GEST-S408', name: 'Advanced Finance (GEST-S408)' },
    { match: 'GEST-S409', name: 'Advanced accounting (GEST-S409)' },
    { match: 'GEST-S414', name: 'Banking and asset management (GEST-S414)' },
    { match: 'GEST-S482', name: 'The digital firm (GEST-S482)' },
  ],
  planDefaultEstimate: 60, // planning auto : durée supposée d'une tâche pas encore estimée (minutes)
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
  const inWeek = events.filter((e) => counts(e) && new Date(e.starts_at) < weekEnd && new Date(e.ends_at) > weekStart);

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
