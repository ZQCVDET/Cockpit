// Petits composants d'interface réutilisés partout.
import { html, useEffect } from './lib.js';

// Icônes (traits simples, style "Lucide")
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  book: 'M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20',
  clock: 'M12 7v5l3 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  news: 'M4 4h13a2 2 0 0 1 2 2v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM19 8h2v11a2 2 0 0 1-2 2M8 8h7M8 12h7M8 16h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  x: 'M18 6 6 18M6 6l12 12',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  check: 'M20 6 9 17l-5-5',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  pin: 'M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};
export const Icon = ({ name, size = 20 }) => html`
  <svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d=${PATHS[name]} />
  </svg>`;

// Panneau qui monte du bas de l'écran (formulaires, détails)
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, []);
  return html`
    <div class="sheet-backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label=${title}>
        <div class="sheet-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${onClose} aria-label="Fermer"><${Icon} name="x" /></button>
        </div>
        <div class="sheet-body">${children}</div>
      </div>
    </div>`;
}

export const Empty = ({ children }) => html`<p class="empty">${children}</p>`;

export const PageHead = ({ title, sub, children }) => html`
  <header class="page-head">
    <div><h1>${title}</h1>${sub && html`<p class="muted">${sub}</p>`}</div>
    <div class="page-actions">${children}</div>
  </header>`;

// Barre de progression empilée : [{ value, color, label }]
export const StackBar = ({ parts, total }) => html`
  <div class="stackbar" role="img" aria-label=${parts.map((p) => `${p.label} ${Math.round(p.value)} h`).join(', ')}>
    ${parts.filter((p) => p.value > 0).map((p) => html`
      <span style=${`width:${(p.value / total) * 100}%;background:${p.color}`} title=${p.label}></span>`)}
  </div>`;

// Petit message temporaire en bas de l'écran
let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), Math.max(2600, msg.length * 60));
}

// Exécute une action et affiche l'erreur éventuelle
export async function attempt(fn, ok) {
  try { await fn(); if (ok) toast(ok); return true; } catch (e) { console.error(e); toast('Erreur : ' + (e.message || e)); return false; }
}
