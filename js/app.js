// Point d'entrée : connexion, navigation entre les écrans, mise en page.
import { html, render, useState, useEffect } from './lib.js';
import { db } from './db.js';
import { useStore, loadAll } from './store.js';
import { Icon, attempt } from './ui.js';
import { Home } from './views/home.js';
import { Agenda } from './views/agenda.js';
import { Courses } from './views/courses.js';
import { Journal } from './views/journal.js';
import { News } from './views/news.js';
import { Settings } from './views/settings.js';
import { Tasks } from './views/tasks.js';

const TABS = [
  { id: 'accueil', label: 'Accueil', icon: 'home', view: Home },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', view: Agenda },
  { id: 'cours', label: 'Cours', icon: 'book', view: Courses },
  { id: 'taches', label: 'Tâches', icon: 'tasks', view: Tasks },
  { id: 'journal', label: 'Journal', icon: 'clock', view: Journal },
  { id: 'news', label: 'News', icon: 'news', view: News },
  { id: 'reglages', label: 'Réglages', icon: 'settings', view: Settings, hideOnMobile: true },
];

// L'écran affiché est dans l'adresse (#agenda, #cours…) : le bouton "retour" fonctionne.
const currentTab = () => location.hash.slice(1) || 'accueil';

function Login() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const ok = await attempt(() => (mode === 'in' ? db.signIn(email, pw) : db.signUp(email, pw)),
      mode === 'up' ? 'Compte créé. Vérifie tes e-mails si une confirmation est demandée.' : null);
    setBusy(false);
    if (ok) location.reload();
  };
  return html`
    <main class="login">
      <form class="card" onSubmit=${submit}>
        <div class="logo">C</div>
        <h1>Cockpit</h1>
        <p class="muted">${mode === 'in' ? 'Connecte-toi pour retrouver tes données.' : 'Crée ton compte (une seule fois).'}</p>
        <label class="field"><span class="label">E-mail</span><input type="email" autocomplete="email" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></label>
        <label class="field"><span class="label">Mot de passe</span><input type="password" autocomplete=${mode === 'in' ? 'current-password' : 'new-password'} minlength="8" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>
        <button class="btn primary full" disabled=${busy}>${busy ? '…' : mode === 'in' ? 'Se connecter' : 'Créer le compte'}</button>
        <button type="button" class="link small center" onClick=${() => setMode(mode === 'in' ? 'up' : 'in')}>
          ${mode === 'in' ? 'Première fois ? Créer le compte' : 'J\'ai déjà un compte'}</button>
      </form>
    </main>`;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState(currentTab());
  const store = useStore();

  useEffect(() => {
    db.user().then((u) => { setUser(u); if (u) loadAll(); });
    const onHash = () => { setTab(currentTab()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (user === undefined) return html`<div class="splash"><div class="logo">C</div></div>`;
  if (!user) return html`<${Login} />`;
  if (!store.ready) return html`<div class="splash"><div class="logo pulse">C</div></div>`;

  const go = (id) => { location.hash = id; };
  const active = TABS.find((t) => t.id === tab) || TABS[0];
  const View = active.view;

  return html`
    <div class="layout">
      <nav class="sidebar" aria-label="Navigation">
        <div class="brand"><div class="logo sm">C</div><b>Cockpit</b></div>
        ${TABS.map((t) => html`
          <a href=${'#' + t.id} class=${`nav-item ${t.id === active.id ? 'on' : ''}`} aria-current=${t.id === active.id ? 'page' : null}>
            <${Icon} name=${t.icon} /><span>${t.label}</span>
          </a>`)}
        ${db.mode === 'demo' && html`<p class="demo-note">Mode démo</p>`}
      </nav>

      <main class="content">
        <a href="#reglages" class="icon-btn mobile-settings" aria-label="Réglages"><${Icon} name="settings" /></a>
        ${db.mode === 'demo' && html`<div class="banner">Mode démo : données d'exemple, stockées sur cet appareil uniquement.</div>`}
        ${store.error && html`<div class="banner error">Impossible de charger les données (${store.error}). Vérifie ta connexion.</div>`}
        <${View} store=${store} go=${go} key=${active.id} />
      </main>

      <nav class="tabbar" aria-label="Navigation">
        ${TABS.filter((t) => !t.hideOnMobile).map((t) => html`
          <a href=${'#' + t.id} class=${t.id === active.id ? 'on' : ''} aria-current=${t.id === active.id ? 'page' : null}>
            <${Icon} name=${t.icon} size=${22} /><span>${t.label}</span>
          </a>`)}
      </nav>
    </div>`;
}

render(html`<${App} />`, document.getElementById('app'));

// Service worker : permet l'installation sur l'écran d'accueil et l'ouverture hors connexion
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}
