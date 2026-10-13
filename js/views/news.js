// Newsletters : récupérées depuis ton libellé Gmail par le script Google (voir guide).
import { html, useState, useEffect, fmtShort, fmtTime, sameDay } from '../lib.js';
import { Icon, Empty, PageHead, attempt } from '../ui.js';
import { openNewsletter, setNewsletterRead } from '../store.js';

// Le contenu de la newsletter est affiché dans un cadre isolé : aucun script ne peut s'y exécuter.
function Reader({ n, onClose }) {
  const [body, setBody] = useState(null);
  useEffect(() => {
    openNewsletter(n.id).then((b) => setBody(b || `<p>${n.snippet || ''}</p>`)).catch((e) => setBody(`<p>Erreur : ${e.message}</p>`));
  }, [n.id]);
  const doc = body && `<!doctype html><meta charset="utf-8"><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:12px;font-family:-apple-system,system-ui,sans-serif;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}</style>${body}`;
  const gmail = n.thread_id ? `https://mail.google.com/mail/u/0/#all/${n.thread_id}` : null;

  return html`
    <div class="reader">
      <div class="reader-head">
        <button class="icon-btn" onClick=${onClose} aria-label="Retour"><${Icon} name="left" /></button>
        <div class="grow ellipsis">
          <b>${n.subject}</b>
          <span class="muted small">${n.sender} · ${fmtShort(n.received_at)}</span>
        </div>
        ${gmail && html`<a class="icon-btn" href=${gmail} target="_blank" rel="noopener" aria-label="Ouvrir dans Gmail"><${Icon} name="external" /></a>`}
      </div>
      ${body ? html`<iframe class="reader-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc=${doc} title=${n.subject}></iframe>`
             : html`<p class="muted center">Chargement…</p>`}
    </div>`;
}

export function News({ store }) {
  const [filter, setFilter] = useState('unread');
  const [open, setOpen] = useState(null);
  const all = store.newsletters;
  const list = filter === 'unread' ? all.filter((n) => !n.is_read) : all;
  const unread = all.filter((n) => !n.is_read).length;
  const now = new Date();

  if (open) return html`<${Reader} n=${open} onClose=${() => setOpen(null)} />`;

  return html`
    <${PageHead} title="Newsletters" sub=${unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est lu'}>
      <div class="seg compact">
        <button class=${filter === 'unread' ? 'on' : ''} onClick=${() => setFilter('unread')}>Non lues</button>
        <button class=${filter === 'all' ? 'on' : ''} onClick=${() => setFilter('all')}>Toutes</button>
      </div>
    </${PageHead}>
    <section class="card flush">
      ${list.length ? html`
        <ul class="news">
          ${list.map((n) => html`
            <li key=${n.id} class=${n.is_read ? 'read' : ''}>
              <button class="news-btn" onClick=${() => setOpen(n)}>
                <span class="news-top">
                  <b class="ellipsis">${n.sender}</b>
                  <span class="muted small">${sameDay(n.received_at, now) ? fmtTime(n.received_at) : fmtShort(n.received_at)}</span>
                </span>
                <span class="news-subject">${n.subject}</span>
                <span class="muted small clamp2">${n.snippet}</span>
              </button>
              <button class="icon-btn small" title=${n.is_read ? 'Marquer non lu' : 'Marquer lu'} aria-label=${n.is_read ? 'Marquer non lu' : 'Marquer lu'}
                onClick=${() => attempt(() => setNewsletterRead(n.id, !n.is_read))}>
                <span class=${`dot ${n.is_read ? '' : 'on'}`}></span>
              </button>
            </li>`)}
        </ul>` : html`<${Empty}>${filter === 'unread' ? 'Aucune newsletter non lue.' : 'Aucune newsletter. Elles arriveront via le script Gmail (voir le guide).'}</${Empty}>`}
    </section>`;
}
