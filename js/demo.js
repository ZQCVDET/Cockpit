// Données d'exemple pour le mode démo (avant de connecter Supabase).
import { addDays, startOfWeek, isoDate, uid } from './lib.js';

const COURSES = [
  // [nom, jour (0 = lundi), heure début, durée en h]
  ['Corporate Finance', 0, 10, 2],
  ['Operations Management', 0, 14, 2],
  ['Business Analytics', 1, 8, 3],
  ['Strategic Management', 2, 10, 2],
  ['Econometrics', 3, 14, 2],
  ['Corporate Finance – TP', 3, 16, 2],
  ['Business Analytics – TP', 4, 10, 2],
];

export function demoData() {
  const now = new Date();
  const thisWeek = startOfWeek(now);
  const events = [];
  const at = (day, h) => { const d = new Date(day); d.setHours(Math.floor(h), (h % 1) * 60, 0, 0); return d.toISOString(); };

  // Cours des 5 dernières semaines + 3 prochaines
  for (let w = -5; w <= 3; w++) {
    const monday = addDays(thisWeek, w * 7);
    for (const [title, day, h, dur] of COURSES) {
      const d = addDays(monday, day);
      events.push({ id: uid(), source: 'ics', kind: 'cours', title, location: 'Solbosch – H', starts_at: at(d, h), ends_at: at(d, h + dur), status: null, notes: null });
    }
    // Réunion SCR le mercredi soir, job le samedi
    const wed = addDays(monday, 2), sat = addDays(monday, 5);
    events.push({ id: uid(), source: 'manual', kind: 'reunion', title: 'Réunion SCR', starts_at: at(wed, 18), ends_at: at(wed, 19.5), status: null });
    if (w % 2 === 0) events.push({ id: uid(), source: 'manual', kind: 'job', title: 'Mise en Scène – livraisons', starts_at: at(sat, 9), ends_at: at(sat, 15), status: null });
    // Exercices d'Econometrics proposés en 3 groupes : un seul à choisir
    [['A – Dupont', 1, 14], ['B – Martin', 2, 16], ['C – Leroy', 3, 10]].forEach(([g, day, h], gi) => {
      const d = addDays(monday, day);
      events.push({ id: uid(), source: 'ics', kind: 'cours', title: `Econometrics – Exercices (Gr. ${g})`, location: 'Solbosch – S',
        starts_at: at(d, h), ends_at: at(d, h + 2), status: w < 0 && gi === 0 ? 'present' : null });
    });
    // Agenda public du Cercle (à la carte) : ne compte que si "J'y vais"
    const tue = addDays(monday, 1), thu = addDays(monday, 3);
    events.push({ id: uid(), source: 'ics', kind: 'loisir', optional: true, title: 'TD Cercle Solvay', location: 'Jefke', starts_at: at(thu, 22), ends_at: at(addDays(thu, 1), 3), status: w === 0 ? 'going' : null });
    events.push({ id: uid(), source: 'ics', kind: 'loisir', optional: true, title: 'Afterwork Cercle', starts_at: at(tue, 18), ends_at: at(tue, 20), status: null });
  }
  // Séances passées : pointées jusqu'à la semaine dernière, la semaine en cours reste "à pointer"
  const past = events.filter((e) => e.kind === 'cours' && !e.title.includes('Exercices') && new Date(e.ends_at) < now);
  past.forEach((e) => { if (new Date(e.starts_at) < thisWeek) e.status = 'present'; });
  const pointed = past.filter((e) => e.status);
  if (pointed.length > 8) { pointed[pointed.length - 3].status = 'rate'; pointed[pointed.length - 8].status = 'rate'; pointed[4].status = 'rattrape'; }

  // Journal de travail
  const logs = [];
  const cats = [['SCR (club)', 120, 'Préparation forum entreprises'], ['Étude / cours', 90, 'Corporate Finance'], ['GMAT', 45, 'Quant – problem solving'], ['Étude / cours', 150, 'Econometrics'], ['Mise en Scène', 360, ''], ['SCR (club)', 60, 'Mails partenaires']];
  for (let i = 0; i < 24; i++) {
    const [category, minutes, subject] = cats[i % cats.length];
    logs.push({ id: uid(), category, subject, minutes, day: isoDate(addDays(now, -Math.floor(i * 1.4))), note: '', created_at: new Date().toISOString() });
  }

  const newsletters = [
    ['L\'Écho – Le Briefing', 'Marchés : la BCE maintient ses taux', 'Ce matin : la BCE maintient ses taux directeurs, les marchés européens ouvrent en légère hausse. Aussi : résultats trimestriels des banques belges…'],
    ['Morning Brew', 'Big Tech earnings week', 'Good morning. It\'s earnings week for the largest tech companies — here\'s what analysts are watching…'],
    ['Solvay Campus Recruitment', 'Rappel : Career Day – inscriptions ouvertes', 'Les inscriptions pour le Career Day sont ouvertes. Plus de 40 entreprises seront présentes…'],
  ].map(([sender, subject, snippet], i) => ({
    id: uid(), message_id: `demo-${i}`, sender, subject, snippet,
    body_html: `<div style="font-family:system-ui;padding:16px;max-width:600px"><h2>${subject}</h2><p>${snippet}</p><p style="color:#888">(Exemple de newsletter — en mode réel, tes vraies newsletters Gmail apparaissent ici.)</p></div>`,
    received_at: addDays(now, -i).toISOString(), is_read: i > 1,
  }));

  const day = (n) => isoDate(addDays(now, n));
  const task = (title, category, priority, due, estimate, progress = 0, extra = {}) => ({
    id: uid(), title, category, priority, due_date: due, estimate_minutes: estimate, progress_minutes: progress,
    status: 'todo', source: 'manual', notes: null, created_at: new Date().toISOString(), ...extra,
  });
  const tasks = [
    task('Relancer les entreprises du Career Day', 'SCR (club)', 'urgent', day(2), 90),
    task('Dossier partenaires – Career Day', 'SCR (club)', 'haute', day(10), 360, 60),
    task('Slides travail de groupe – Strategic Management', 'Étude / cours', 'haute', day(6), 240),
    task('Réviser chap. 1-4 Corporate Finance', 'Étude / cours', 'normale', null, 300),
    task('GMAT – test diagnostic', 'GMAT', 'basse', null, 180),
    task('Briefing bénévoles du forum', 'SCR (club)', 'normale', day(12), null, 0, { source: 'notion' }),
    task('Envoyer mon CV mis à jour', 'Projet perso', 'normale', day(-3), 30, 30, { status: 'done', done_at: new Date().toISOString() }),
  ];

  return { events, work_logs: logs, newsletters, tasks, settings: { choiceCourses: { 'econometrics – exercices': '' } } };
}
