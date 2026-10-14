// Réglages : prénom, journée type, engagements fixes, catégories du journal, examens.
import { html, useState } from '../lib.js';
import { Icon, PageHead, attempt, toast } from '../ui.js';
import { saveSettings, setChoiceCourse } from '../store.js';
import { courseList } from '../lib.js';
import { db } from '../db.js';

const fmtH = (m) => `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) : ''}`;
const fmtSeries = (e) => new Intl.DateTimeFormat('fr-BE', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(e.starts_at));

export function Settings({ store }) {
  const s = store.settings;
  const courses = courseList(store.events);
  const [f, setF] = useState({
    firstName: s.firstName, dayStart: s.dayStart, dayEnd: s.dayEnd, notionName: s.notionName || '',
    examStart: s.examStart, examLabel: s.examLabel,
    planMaxPerDay: s.planMaxPerDay, planBlockMax: s.planBlockMax,
    planBefore: s.planBefore ?? s.planBuffer ?? 15, planAfter: s.planAfter ?? 45, planCommute: s.planCommute ?? 30,
    fixed: s.fixed.map((x) => ({ ...x })), categories: s.categories.map((x) => ({ ...x })),
  });
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const setItem = (list, i, k) => (e) => {
    const copy = f[list].map((x) => ({ ...x }));
    copy[i][k] = k === 'hours' ? Number(e.target.value) : e.target.value;
    setF({ ...f, [list]: copy });
  };
  const removeItem = (list, i) => setF({ ...f, [list]: f[list].filter((_, j) => j !== i) });

  const save = (e) => {
    e.preventDefault();
    const clean = {
      ...f,
      fixed: f.fixed.filter((x) => x.label.trim()),
      categories: f.categories.filter((x) => x.name.trim()),
    };
    attempt(() => saveSettings(clean), 'Réglages enregistrés');
  };

  const exportData = async () => {
    const data = {
      exported_at: new Date().toISOString(),
      settings: store.settings, events: store.events, work_logs: store.logs,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `cockpit-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const [pw, setPw] = useState({ a: '', b: '' });
  const changePw = async (e) => {
    e.preventDefault();
    if (pw.a !== pw.b) return toast('Les deux mots de passe ne sont pas identiques');
    if (await attempt(() => db.updatePassword(pw.a), 'Mot de passe changé')) setPw({ a: '', b: '' });
  };

  const capacity = (f.dayEnd - f.dayStart) * 7;
  const fixedTotal = f.fixed.reduce((a, x) => a + (Number(x.hours) || 0), 0);

  return html`
    <${PageHead} title="Réglages" />
    <form onSubmit=${save}>
      <section class="card">
        <div class="card-head"><h2>Toi</h2></div>
        <div class="grid2">
          <label class="field"><span class="label">Prénom</span>
            <input value=${f.firstName} onInput=${set('firstName')} placeholder="Pour l'accueil" /></label>
          <label class="field"><span class="label">Nom Notion</span>
            <input value=${f.notionName} onInput=${set('notionName')} placeholder="Pour importer tes tâches" /></label>
        </div>
        <div class="grid2">
          <label class="field"><span class="label">Début examens</span><input type="date" value=${f.examStart} onInput=${set('examStart')} /></label>
          <label class="field"><span class="label">Nom</span><input value=${f.examLabel} onInput=${set('examLabel')} /></label>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Calcul du temps libre</h2></div>
        <p class="muted small">Ta journée « utile » (hors sommeil). Temps libre = capacité − agenda − engagements fixes.</p>
        <div class="grid2">
          <label class="field"><span class="label">Début de journée</span>
            <select value=${f.dayStart} onChange=${set('dayStart', true)}>${[5, 6, 7, 8, 9, 10].map((h) => html`<option value=${h} selected=${h === f.dayStart}>${h} h</option>`)}</select></label>
          <label class="field"><span class="label">Fin de journée</span>
            <select value=${f.dayEnd} onChange=${set('dayEnd', true)}>${[20, 21, 22, 23, 24].map((h) => html`<option value=${h} selected=${h === f.dayEnd}>${h} h</option>`)}</select></label>
        </div>
        <p class="label mt">Engagements hebdo non planifiés dans l'agenda</p>
        <p class="muted small">Ex. : le temps passé pour le club en dehors des réunions, les repas, les trajets…</p>
        ${f.fixed.map((x, i) => html`
          <div class="item-row">
            <input value=${x.label} onInput=${setItem('fixed', i, 'label')} aria-label="Libellé" />
            <input type="number" min="0" max="80" step="0.5" value=${x.hours} onInput=${setItem('fixed', i, 'hours')} aria-label="Heures par semaine" class="num" />
            <span class="muted small">h/sem</span>
            <button type="button" class="icon-btn small" onClick=${() => removeItem('fixed', i)} aria-label="Retirer"><${Icon} name="x" size=${16} /></button>
          </div>`)}
        <button type="button" class="link" onClick=${() => setF({ ...f, fixed: [...f.fixed, { label: '', hours: 1 }] })}><${Icon} name="plus" size=${16} /> Ajouter</button>
        <p class="muted small mt">Capacité : ${capacity} h/sem · fixes : ${fixedTotal} h · reste avant agenda : <b>${capacity - fixedTotal} h</b></p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Cours à choix</h2></div>
        <p class="muted small">Coche les cours (TP ou théorie) donnés par plusieurs assistants / profs à des horaires différents.
          Dans l'Agenda, touche ensuite une de leurs séances → « ★ En faire mon groupe habituel » : il comptera toutes les semaines.
          Les autres groupes ne comptent pas et ne vont jamais dans « à rattraper ».</p>
        ${courses.length ? html`
          <ul class="check-list">
            ${courses.map(([key, name]) => {
              const on = key in (s.choiceCourses || {});
              const usual = on && store.events.find((e) => e._courseKey === key && e._default);
              return html`
                <li><label class="check-label">
                  <input type="checkbox" class="check" checked=${on} onChange=${() => attempt(() => setChoiceCourse(key, !on))} />
                  <span>${name}${on && html`<small class="muted"> · ${usual ? `habituel : ${fmtSeries(usual)}` : 'groupe habituel pas encore choisi'}</small>`}</span>
                </label></li>`;
            })}
          </ul>` : html`<p class="muted small">Tes cours apparaîtront ici une fois ton horaire importé.</p>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>Planning automatique</h2></div>
        <p class="muted small">Comment l'app place tes tâches dans tes créneaux libres (onglet Tâches).</p>
        <div class="grid3">
          <label class="field"><span class="label">Max / jour</span>
            <select onChange=${set('planMaxPerDay', true)}>${[1, 2, 3, 4, 5, 6, 8].map((h) => html`<option value=${h} selected=${h === f.planMaxPerDay}>${h} h</option>`)}</select></label>
          <label class="field"><span class="label">Bloc max</span>
            <select onChange=${set('planBlockMax', true)}>${[45, 60, 90, 120, 180].map((m) => html`<option value=${m} selected=${m === f.planBlockMax}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`)}</select></label>
        </div>
        <p class="muted small">Max / jour : heures de travail perso proposées au maximum par jour. Bloc max : durée d'une session de travail avant une pause.</p>

        <p class="label mt">Tes pauses (le planning ne te met pas au travail pendant ce temps)</p>
        <div class="grid3">
          <label class="field"><span class="label">Avant un cours</span>
            <select onChange=${set('planBefore', true)}>${[0, 10, 15, 30, 45].map((m) => html`<option value=${m} selected=${m === f.planBefore}>${m} min</option>`)}</select></label>
          <label class="field"><span class="label">Après un cours</span>
            <select onChange=${set('planAfter', true)}>${[0, 15, 30, 45, 60, 90, 120].map((m) => html`<option value=${m} selected=${m === f.planAfter}>${m < 60 ? m + ' min' : fmtH(m)}</option>`)}</select></label>
          <label class="field"><span class="label">Trajet</span>
            <select onChange=${set('planCommute', true)}>${[0, 15, 30, 45, 60, 90].map((m) => html`<option value=${m} selected=${m === f.planCommute}>${m < 60 ? m + ' min' : fmtH(m)}</option>`)}</select></label>
        </div>
        <p class="muted small">Après un cours : discuter, souffler, manger… S'applique aussi aux réunions, au job et aux examens.
          Trajet : domicile ↔ campus, ajouté avant ta 1re activité sur place de la journée et après la dernière (pas pour les loisirs ni le perso).</p>
        ${((s.planPins || []).length > 0 || (s.planBlocks || []).length > 0) && html`
          <p class="muted small mt">${(s.planPins || []).length} bloc(s) déplacé(s) par toi · ${(s.planBlocks || []).length} créneau(x) marqué(s) « pas dispo ».
            <button type="button" class="link small" onClick=${() => confirm('Tout remettre en planning automatique ?') && attempt(() => saveSettings({ planPins: [], planBlocks: [] }), 'Planning remis en automatique')}>Tout remettre en automatique</button></p>`}
      </section>

      <section class="card">
        <div class="card-head"><h2>Catégories du journal</h2></div>
        ${f.categories.map((c, i) => html`
          <div class="item-row">
            <input type="color" value=${c.color} onInput=${setItem('categories', i, 'color')} aria-label="Couleur" class="color" />
            <input value=${c.name} onInput=${setItem('categories', i, 'name')} aria-label="Nom" />
            <button type="button" class="icon-btn small" onClick=${() => removeItem('categories', i)} aria-label="Retirer"><${Icon} name="x" size=${16} /></button>
          </div>`)}
        <button type="button" class="link" onClick=${() => setF({ ...f, categories: [...f.categories, { name: '', color: '#0ea5e9' }] })}><${Icon} name="plus" size=${16} /> Ajouter</button>
      </section>

      <div class="sticky-save"><button class="btn primary full" type="submit">Enregistrer</button></div>
    </form>

    <section class="card">
      <div class="card-head"><h2>Compte & données</h2></div>
      <p class="muted small">${db.mode === 'demo'
        ? 'Mode démo : les données restent sur cet appareil. Connecte Supabase (voir le guide) pour synchroniser téléphone, iPad et ordi.'
        : 'Connecté à Supabase : tes données sont synchronisées sur tous tes appareils.'}</p>
      ${db.mode !== 'demo' && html`
        <details class="pw">
          <summary class="link small">Changer mon mot de passe</summary>
          <form onSubmit=${changePw} class="mt-s">
            <div class="grid2">
              <input type="password" autocomplete="new-password" minlength="8" placeholder="Nouveau mot de passe" value=${pw.a} onInput=${(e) => setPw({ ...pw, a: e.target.value })} required aria-label="Nouveau mot de passe" />
              <input type="password" autocomplete="new-password" minlength="8" placeholder="Confirme-le" value=${pw.b} onInput=${(e) => setPw({ ...pw, b: e.target.value })} required aria-label="Confirme le mot de passe" />
            </div>
            <button class="btn" type="submit">Enregistrer le mot de passe</button>
          </form>
        </details>`}
      <div class="row-actions">
        <button class="btn ghost" onClick=${exportData}>Télécharger une sauvegarde</button>
        <button class="btn ghost danger" onClick=${() => confirm(db.mode === 'demo' ? 'Réinitialiser les données de démo ?' : 'Se déconnecter ?') && db.signOut().then(() => location.reload())}>
          ${db.mode === 'demo' ? 'Réinitialiser la démo' : 'Se déconnecter'}</button>
      </div>
    </section>`;
}
