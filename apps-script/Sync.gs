/**
 * ─────────────────────────────────────────────────────────────
 *  Cockpit : synchronisation automatique (Google Apps Script)
 *
 *  Ce script tourne gratuitement sur les serveurs de Google, toutes
 *  les heures, même quand ton ordi est éteint. Il :
 *    1. télécharge ton horaire de cours (lien iCal) → table "events"
 *    2. lit les e-mails du libellé Gmail "Newsletters" → table "newsletters"
 *    3. (optionnel) lit ta base de deadlines Notion → table "tasks"
 *  et envoie le tout dans ta base Supabase.
 *
 *  Installation : voir docs/GUIDE.md, étape 4.
 *  Les réglages (clés, liens) sont dans : ⚙️ Paramètres du projet →
 *  Propriétés du script. Ils ne sont PAS dans ce code.
 * ─────────────────────────────────────────────────────────────
 */

const DEFAULT_TZ = 'Europe/Brussels';
const DAYS_BACK = 150;     // on importe l'horaire à partir d'il y a ~5 mois…
const DAYS_AHEAD = 240;    // …jusqu'à ~8 mois dans le futur
const NEWS_DAYS = 30;      // newsletters des 30 derniers jours
const NEWS_KEEP_DAYS = 60; // on efface celles de plus de 60 jours

/** À lancer UNE fois à la main : crée le déclencheur horaire et fait une 1re synchro. */
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  syncAll();
}

/** Lancé automatiquement toutes les heures. */
function syncAll() {
  const p = props_();
  if (p.ICS_URL) syncCalendar();
  if (p.GMAIL_LABEL) syncNewsletters();
  if (p.NOTION_TOKEN && p.NOTION_DATABASE_ID) syncNotion();
}

// ── 1. Horaire de cours ─────────────────────────────────────
function syncCalendar() {
  const p = props_();
  const runStart = new Date().toISOString();
  const res = UrlFetchApp.fetch(p.ICS_URL.replace(/^webcal:/i, 'https:'), { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('Calendrier inaccessible (' + res.getResponseCode() + ')');

  const from = new Date(Date.now() - DAYS_BACK * 864e5);
  const to = new Date(Date.now() + DAYS_AHEAD * 864e5);
  const events = expandIcs(res.getContentText(), from, to, appsScriptTz_);
  if (!events.length) { console.log('Aucun événement trouvé dans le calendrier, rien n\'est modifié.'); return; }

  const rows = events.map((e) => ({
    user_id: p.USER_ID,
    uid: e.uid,
    source: 'ics',
    kind: /exam/i.test(e.title) ? 'examen' : 'cours',
    title: e.title,
    location: e.location || null,
    starts_at: e.start.toISOString(),
    ends_at: e.end.toISOString(),
    synced_at: runStart,
  }));
  // "merge-duplicates" = met à jour l'heure/le lieu SANS toucher à tes statuts (raté/rattrapé) ni à tes notes
  for (let i = 0; i < rows.length; i += 200) {
    supabase_('post', 'events?on_conflict=user_id,uid', rows.slice(i, i + 200), 'resolution=merge-duplicates,return=minimal');
  }
  // Supprime les séances qui ont disparu du calendrier (cours annulés/déplacés)
  supabase_('delete', 'events?user_id=eq.' + p.USER_ID + '&source=eq.ics&synced_at=lt.' + encodeURIComponent(runStart) +
    '&starts_at=gte.' + encodeURIComponent(from.toISOString()));
  console.log(rows.length + ' séances synchronisées.');
}

// ── 2. Newsletters Gmail ────────────────────────────────────
function syncNewsletters() {
  const p = props_();
  const since = new Date(Date.now() - NEWS_DAYS * 864e5);
  const known = JSON.parse(supabase_('get', 'newsletters?select=message_id&user_id=eq.' + p.USER_ID +
    '&received_at=gte.' + encodeURIComponent(since.toISOString())))
    .reduce((s, r) => { s[r.message_id] = true; return s; }, {});

  const threads = GmailApp.search('label:"' + p.GMAIL_LABEL + '" newer_than:' + NEWS_DAYS + 'd', 0, 100);
  const rows = [];
  threads.forEach((t) => t.getMessages().forEach((m) => {
    if (known[m.getId()] || m.getDate() < since) return;
    rows.push({
      user_id: p.USER_ID,
      message_id: m.getId(),
      thread_id: t.getId(),
      sender: m.getFrom().replace(/\s*<.*>$/, '').replace(/^"|"$/g, '') || m.getFrom(),
      subject: m.getSubject(),
      snippet: m.getPlainBody().replace(/https?:\/\/\S+/g, '').replace(/[\s‌ ]+/g, ' ').trim().slice(0, 400),
      body_html: m.getBody().slice(0, 400000),
      received_at: m.getDate().toISOString(),
    });
  }));
  for (let i = 0; i < rows.length; i += 10) {
    supabase_('post', 'newsletters?on_conflict=user_id,message_id', rows.slice(i, i + 10), 'resolution=ignore-duplicates,return=minimal');
  }
  const old = new Date(Date.now() - NEWS_KEEP_DAYS * 864e5).toISOString();
  supabase_('delete', 'newsletters?user_id=eq.' + p.USER_ID + '&received_at=lt.' + encodeURIComponent(old));
  console.log(rows.length + ' nouvelle(s) newsletter(s).');
}

// ── 3. Deadlines Notion ─────────────────────────────────────
// Propriétés du script : NOTION_TOKEN (secret de l'intégration), NOTION_DATABASE_ID
// (le long code dans le lien de la base), et en option :
//   NOTION_ASSIGNEE  = ton nom ou ton e-mail → ne garde que les tâches qui te sont assignées
//   NOTION_CATEGORY  = catégorie donnée aux nouvelles tâches (défaut : "SCR (club)")
function syncNotion() {
  const p = props_();
  const dbId = p.NOTION_DATABASE_ID.replace(/-/g, '').match(/[0-9a-f]{32}/i)[0];
  const pages = [];
  let cursor;
  do {
    const res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + dbId + '/query', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + p.NOTION_TOKEN.trim(), 'Notion-Version': '2022-06-28' },
      payload: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    if (res.getResponseCode() !== 200) throw new Error('Notion ' + res.getResponseCode() + ' : ' + res.getContentText());
    const body = JSON.parse(res.getContentText());
    pages.push.apply(pages, body.results);
    cursor = body.has_more ? body.next_cursor : null;
  } while (cursor);

  const rows = [];
  pages.forEach((pg) => {
    const t = notionTask_(pg, p.NOTION_ASSIGNEE);
    if (t) rows.push(t);
  });

  // Tâches déjà connues : on met à jour titre / deadline / "fait" SANS toucher à ton estimation ni à ton urgence
  const known = JSON.parse(supabase_('get', 'tasks?select=external_id&user_id=eq.' + p.USER_ID + '&source=eq.notion&external_id=not.is.null'))
    .reduce((s, r) => { s[r.external_id] = true; return s; }, {});
  const base = (t) => ({ user_id: p.USER_ID, source: 'notion', external_id: t.id, external_url: t.url, title: t.title, due_date: t.due, external_done: t.done });
  const updates = rows.filter((t) => known[t.id]).map(base);
  const inserts = rows.filter((t) => !known[t.id]).map((t) => Object.assign(base(t), {
    priority: t.priority || 'normale', category: p.NOTION_CATEGORY || 'SCR (club)',
  }));
  for (let i = 0; i < updates.length; i += 100) supabase_('post', 'tasks?on_conflict=user_id,external_id', updates.slice(i, i + 100), 'resolution=merge-duplicates,return=minimal');
  for (let i = 0; i < inserts.length; i += 100) supabase_('post', 'tasks', inserts.slice(i, i + 100), 'return=minimal');
  console.log(inserts.length + ' nouvelle(s) tâche(s) Notion, ' + updates.length + ' mise(s) à jour.');
}

// Transforme une page Notion en tâche (repère tout seul les colonnes titre / date / statut / urgence)
function notionTask_(pg, assignee) {
  const props = pg.properties || {};
  const names = Object.keys(props);
  const byType = (type, re) => names.filter((n) => props[n].type === type).sort((a, b) => (re && re.test(b) ? 1 : 0) - (re && re.test(a) ? 1 : 0))[0];
  const titleProp = byType('title');
  const title = titleProp ? props[titleProp].title.map((x) => x.plain_text).join('').trim() : '';
  if (!title) return null;

  if (assignee) {
    const who = assignee.toLowerCase();
    const people = names.filter((n) => props[n].type === 'people').reduce((a, n) => a.concat(props[n].people), []);
    const mine = people.some((u) => ((u.name || '') + ' ' + ((u.person && u.person.email) || '')).toLowerCase().indexOf(who) >= 0);
    if (!mine) return null;
  }

  const dateProp = byType('date', /[ée]ch[ée]ance|deadline|due|date/i);
  const d = dateProp && props[dateProp].date;
  const due = d ? String(d.end || d.start).slice(0, 10) : null;

  const DONE = /done|termin|fait|complet|finished|archiv|cancel|annul|abandon/i;
  const statusProp = byType('status') || byType('select', /statut|status|[ée]tat/i);
  const statusName = statusProp && props[statusProp][props[statusProp].type] && props[statusProp][props[statusProp].type].name;
  const checkProp = byType('checkbox', /fait|done|termin/i);
  const done = (statusName ? DONE.test(statusName) : false) || (checkProp ? props[checkProp].checkbox === true : false);

  const prioProp = names.filter((n) => props[n].type === 'select' && /priorit|urgence|priority/i.test(n))[0];
  const prioName = prioProp && props[prioProp].select ? props[prioProp].select.name : '';
  const priority = /urgent|critique|asap/i.test(prioName) ? 'urgent' : /haut|high|important/i.test(prioName) ? 'haute'
    : /bas|low|faible/i.test(prioName) ? 'basse' : null;

  return { id: pg.id, url: pg.url, title: title, due: due, done: done, priority: priority };
}

// ── Outils ──────────────────────────────────────────────────
function props_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'USER_ID'].forEach((k) => {
    if (!p[k]) throw new Error('Propriété du script manquante : ' + k + ' (voir le guide)');
  });
  return p;
}

function supabase_(method, path, payload, prefer) {
  const p = props_();
  const key = p.SUPABASE_SECRET_KEY.trim();
  const headers = { apikey: key };
  if (key.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key; // ancienne clé "service_role"
  if (prefer) headers.Prefer = prefer;
  const opts = { method: method, headers: headers, muteHttpExceptions: true, contentType: 'application/json' };
  if (payload) opts.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(p.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, opts);
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + res.getResponseCode() + ' : ' + res.getContentText());
  return res.getContentText();
}

// Conversion "heure locale dans un fuseau" ↔ Date, avec les outils Google
const appsScriptTz_ = {
  parse: (ymdhms, tz) => Utilities.parseDate(ymdhms, tz, "yyyyMMdd'T'HHmmss"),
  format: (date, tz) => Utilities.formatDate(date, tz, "yyyyMMdd'T'HHmmss"),
};

// ─────────────────────────────────────────────────────────────
//  Lecture d'un fichier iCal (.ics), avec les répétitions (RRULE)
//  Fonction "pure" : testable en dehors de Google (tz = outils de fuseau).
// ─────────────────────────────────────────────────────────────
function expandIcs(text, from, to, tz) {
  const WINDOWS_TZ = { 'Romance Standard Time': 'Europe/Brussels', 'W. Europe Standard Time': 'Europe/Berlin', 'GMT Standard Time': 'Europe/London', 'UTC': 'UTC' };
  const zone = (id) => {
    if (!id) return DEFAULT_TZ;
    id = id.replace(/^"|"$/g, '');
    if (WINDOWS_TZ[id]) return WINDOWS_TZ[id];
    return /^[A-Za-z]+\/[A-Za-z_\-]+/.test(id) ? id : DEFAULT_TZ; // fuseau inconnu → Bruxelles
  };
  const unescape = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
  // Une date iCal → { date, zone } ; null pour les journées entières (ignorées)
  const parseDate = (value, params) => {
    if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) return null;
    const v = value.replace(/Z$/, '');
    const z = /Z$/.test(value) ? 'UTC' : zone(params.TZID);
    return { date: tz.parse(v.length === 13 ? v + '00' : v, z), zone: z };
  };

  // 1. Découpe en événements
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const raw = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: {}, params: {} }; continue; }
    if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const name = m[1], value = m[3], params = {};
    m[2].split(';').slice(1).forEach((kv) => { const i = kv.indexOf('='); params[kv.slice(0, i)] = kv.slice(i + 1); });
    if (name === 'EXDATE') value.split(',').forEach((v) => { const d = parseDate(v, params); if (d) cur.exdates[d.date.getTime()] = true; });
    else { cur[name] = value; cur.params[name] = params; }
  }

  // 2. Séances modifiées individuellement (RECURRENCE-ID) : remplacent l'occurrence d'origine
  const overridden = {};
  raw.forEach((e) => {
    if (e['RECURRENCE-ID']) {
      const d = parseDate(e['RECURRENCE-ID'], e.params['RECURRENCE-ID']);
      if (d) overridden[e.UID + '|' + d.date.getTime()] = true;
    }
  });

  // 3. Développe les répétitions
  const out = [];
  raw.forEach((e) => {
    if (!e.DTSTART || e.STATUS === 'CANCELLED') return;
    const start = parseDate(e.DTSTART, e.params.DTSTART);
    if (!start) return;
    if (!e.UID) e.UID = (e.SUMMARY || '') + '@' + start.date.toISOString();
    const end = e.DTEND ? parseDate(e.DTEND, e.params.DTEND) : null;
    const duration = end ? end.date - start.date : 3600e3;
    const base = { title: unescape(e.SUMMARY || 'Sans titre'), location: e.LOCATION ? unescape(e.LOCATION) : '' };
    const push = (s, uid) => {
      if (s < to && s.getTime() + duration > from.getTime()) out.push(Object.assign({ uid: uid, start: s, end: new Date(s.getTime() + duration) }, base));
    };

    if (e['RECURRENCE-ID']) {
      // même identifiant que la séance d'origine → ton statut (raté/rattrapé) est conservé si elle est déplacée
      const orig = parseDate(e['RECURRENCE-ID'], e.params['RECURRENCE-ID']);
      push(start.date, e.UID + '_' + (orig ? orig.date : start.date).toISOString());
      return;
    }
    if (!e.RRULE) { push(start.date, e.UID); return; }

    const r = {};
    e.RRULE.split(';').forEach((kv) => { const i = kv.indexOf('='); r[kv.slice(0, i)] = kv.slice(i + 1); });
    const interval = Number(r.INTERVAL || 1);
    const count = r.COUNT ? Number(r.COUNT) : Infinity;
    const until = r.UNTIL ? (parseDate(r.UNTIL.length === 8 ? r.UNTIL + 'T235959' : r.UNTIL, {}) || {}).date : null;
    const local = tz.format(start.date, start.zone);           // "20260914T100000"
    const time = local.slice(9);
    const y = +local.slice(0, 4), mo = +local.slice(4, 6) - 1, d = +local.slice(6, 8);
    const day0 = Date.UTC(y, mo, d);                            // jour de départ (calendrier)
    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const occurrence = (dayUtc) => {
      const x = new Date(dayUtc);
      const ymd = x.getUTCFullYear() + String(x.getUTCMonth() + 1).padStart(2, '0') + String(x.getUTCDate()).padStart(2, '0');
      return tz.parse(ymd + 'T' + time, start.zone);           // même heure locale, même en changement d'heure
    };

    let n = 0;
    const take = (dayUtc) => {
      const s = occurrence(dayUtc);
      if (s < start.date) return true;
      if ((until && s > until) || n >= count) return false;
      n++;
      if (!e.exdates[s.getTime()] && !overridden[e.UID + '|' + s.getTime()]) push(s, e.UID + '_' + s.toISOString());
      return s < to;
    };

    if (r.FREQ === 'DAILY') {
      for (let k = 0; k < 1000; k++) if (!take(day0 + k * interval * 864e5)) break;
    } else if (r.FREQ === 'WEEKLY') {
      const byday = (r.BYDAY ? r.BYDAY.split(',') : [DAYS[new Date(day0).getUTCDay()]]).map((x) => DAYS.indexOf(x.slice(-2))).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const monday0 = day0 - ((new Date(day0).getUTCDay() + 6) % 7) * 864e5;
      outer: for (let w = 0; w < 200; w++) {
        for (const wd of byday) {
          if (!take(monday0 + (w * interval * 7 + (wd + 6) % 7) * 864e5)) break outer;
        }
      }
    } else {
      push(start.date, e.UID); // répétitions mensuelles/annuelles : rare pour des cours, on garde la 1re
    }
  });
  return out;
}
