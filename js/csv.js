// Import d'un export CSV de Notion (ou d'Excel / Google Sheets) dans les tâches.
// Colonnes reconnues automatiquement : titre ("Task name", "Nom", "Tâche"…), date ("Due", "Échéance"…),
// statut ("Status", "État"…), urgence ("Priority"…), personne assignée ("Assignee"…) et projet.
// Si une colonne "personne assignée" existe, seules TES tâches sont importées (ton nom : Réglages).
import { addTask, saveSettings } from './store.js';

const MONTHS = {
  jan: 1, janv: 1, janvier: 1, january: 1, feb: 2, fev: 2, fevr: 2, fevrier: 2, february: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aou: 8, aout: 8, august: 8, sep: 9, sept: 9, septembre: 9, september: 9, oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11, dec: 12, decembre: 12, december: 12,
};
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');

// Lit le CSV (gère les guillemets et les retours à la ligne dans les cellules)
function parse(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// "October 24, 2026", "24 octobre 2026", "2026-10-24", "24/10/2026", ou une plage "… → …" (on garde la fin)
export function parseDate(raw) {
  if (!raw) return null;
  const s = strip(raw.split('→').pop().trim());
  let m;
  if ((m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if ((m = s.match(/([a-z]+)\.? (\d{1,2}),? (\d{4})/)) && MONTHS[m[1]]) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`;
  if ((m = s.match(/(\d{1,2}) ([a-z]+)\.? (\d{4})/)) && MONTHS[m[2]]) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(m[1])}`;
  return null;
}

const PRIO = [[/urgent|critique|asap/, 'urgent'], [/haut|high|important/, 'haute'], [/bas|low|faible/, 'basse'], [/moy|medium|normal/, 'normale']];

export const CLOSED = /done|termin|fait|complet|finished|archiv|cancel|annul|abandon/;

// Renvoie { added, closed, others, duplicates }
export async function importCsv(text, store) {
  const [head, ...rows] = parse(text);
  const res = { added: 0, closed: 0, others: 0, duplicates: 0 };
  if (!head) return res;
  const h = head.map((x) => strip(x).trim());
  const find = (re) => h.findIndex((x) => re.test(x));
  let iTitle = find(/^(task name|nom de la tache|nom|name|titre|title|tache|task|taches|tasks)$/);
  if (iTitle < 0) iTitle = find(/name|nom|titre|title/);
  if (iTitle < 0) iTitle = 0;
  const iDate = find(/echeance|deadline|^due|date limite|^date/);
  const iStatus = find(/^(etat|statut|status)$/);
  const iPrio = find(/priorit|urgence|priority/);
  const iWho = find(/assign|responsable|personne|owner/);
  const iProject = find(/^(projet|project|evenement|event)s?$/);

  // Filtre "mes tâches" : on demande ton nom Notion la première fois
  let me = store.settings.notionName;
  if (iWho >= 0 && !me) {
    me = (prompt('Ce fichier contient les tâches de plusieurs personnes.\nTon nom tel qu\'il apparaît dans Notion ?') || '').trim();
    if (me) await saveSettings({ notionName: me });
  }

  const exists = new Set(store.tasks.map((t) => `${strip(t.title)}|${t.due_date || ''}`));
  for (const r of rows) {
    const title = (r[iTitle] || '').trim();
    if (!title) continue;
    if (iWho >= 0 && me && !strip(r[iWho] || '').includes(strip(me))) { res.others++; continue; }
    if (iStatus >= 0 && CLOSED.test(strip(r[iStatus] || ''))) { res.closed++; continue; }
    const due = iDate >= 0 ? parseDate(r[iDate]) : null;
    const key = `${strip(title)}|${due || ''}`;
    if (exists.has(key)) { res.duplicates++; continue; }
    const pr = iPrio >= 0 ? PRIO.find(([re]) => re.test(strip(r[iPrio] || '')))?.[1] : null;
    const project = iProject >= 0 ? (r[iProject] || '').replace(/\s*\(https?:[^)]*\)\s*/g, '').replace(/\s+/g, ' ').trim() : '';
    const link = iProject >= 0 ? (r[iProject] || '').match(/\((https?:[^)]*)\)/)?.[1] : null;
    await addTask({
      title, due_date: due, priority: pr || 'normale', estimate_minutes: null, source: 'notion',
      category: store.settings.categories[0]?.name || null,
      notes: project ? `Projet : ${project}` : null, external_url: link || null,
    });
    exists.add(key); res.added++;
  }
  return res;
}
