// Couche "données" : l'app ne parle qu'à cet objet `db`.
// - Mode Supabase : les données sont dans le cloud, synchronisées entre appareils.
// - Mode démo : si config.js est vide, tout est stocké dans le navigateur (localStorage).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { uid } from './lib.js';
import { demoData } from './demo.js';

const CACHE = 'cockpit-cache-v1:';
const cache = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(CACHE + k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(CACHE + k, JSON.stringify(v)); } catch { /* plein ou bloqué */ } },
};

// ── Supabase ────────────────────────────────────────────────
function supabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const check = ({ data, error }) => { if (error) throw error; return data; };

  // Session enregistrée par Supabase dans le navigateur (clé "sb-<projet>-auth-token")
  const storedUser = () => {
    try {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      return key ? JSON.parse(localStorage.getItem(key))?.user ?? null : null;
    } catch { return null; }
  };
  // Demande au navigateur de ne pas effacer les données de Cockpit (session, cache) quand il fait du ménage
  try { navigator.storage?.persist?.(); } catch { /* pas supporté */ }

  // Lien "mot de passe oublié" reçu par e-mail → l'app doit proposer un nouveau mot de passe
  let recovery = /type=recovery/.test(location.hash);
  const recoveryListeners = new Set();
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; recoveryListeners.forEach((fn) => fn()); }
  });

  return {
    mode: 'supabase',
    async resetPassword(email) {
      check(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },
    async updatePassword(password) { check(await sb.auth.updateUser({ password })); },
    onRecovery(fn) { if (recovery) fn(); recoveryListeners.add(fn); return () => recoveryListeners.delete(fn); },
    // Rester connecté : la session est gardée sur l'appareil et renouvelée automatiquement.
    // Hors connexion, le renouvellement échoue : on garde alors la session enregistrée au lieu de
    // te renvoyer à l'écran de connexion (les données affichées sont la dernière version en cache).
    async user() {
      let session = null;
      try { session = (await sb.auth.getSession()).data.session; } catch { /* hors connexion */ }
      if (session) return session.user;
      return storedUser();
    },
    async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password) { check(await sb.auth.signUp({ email, password })); },
    async signOut() { await sb.auth.signOut(); localStorage.clear(); },

    // Lecture avec repli sur le cache si on est hors connexion
    async select(table, { columns = '*', order = 'created_at', asc = true, limit, since } = {}) {
      const key = `${table}:${columns}`;
      try {
        let q = sb.from(table).select(columns).order(order, { ascending: asc });
        if (since) q = q.gte(since.column, since.value);
        if (limit) q = q.limit(limit);
        const rows = check(await q);
        cache.set(key, rows);
        return rows;
      } catch (err) {
        const cached = cache.get(key);
        if (cached) return cached;
        throw err;
      }
    },
    async getOne(table, id, columns = '*') {
      return check(await sb.from(table).select(columns).eq('id', id).single());
    },
    async insert(table, rows) {
      return check(await sb.from(table).insert(rows).select());
    },
    async update(table, id, patch) {
      return check(await sb.from(table).update(patch).eq('id', id).select().single());
    },
    async updateMany(table, ids, patch) {
      for (let i = 0; i < ids.length; i += 100) check(await sb.from(table).update(patch).in('id', ids.slice(i, i + 100)));
    },
    async remove(table, id) { check(await sb.from(table).delete().eq('id', id)); },

    async getSettings() {
      try {
        const row = check(await sb.from('settings').select('data').maybeSingle());
        cache.set('settings', row?.data ?? {});
        return row?.data ?? {};
      } catch (err) {
        const c = cache.get('settings'); if (c) return c; throw err;
      }
    },
    async saveSettings(data) {
      cache.set('settings', data);
      const user_id = (await sb.auth.getSession()).data.session?.user?.id;
      check(await sb.from('settings').upsert({ user_id, data, updated_at: new Date().toISOString() }));
    },
  };
}

// ── Mode démo (localStorage) ────────────────────────────────
function demoBackend() {
  const KEY = 'cockpit-demo-v7';
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  if (!state) state = demoData();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };
  save();

  return {
    mode: 'demo',
    async user() { return { email: 'demo@cockpit' }; },
    async signIn() {}, async signUp() {}, async resetPassword() {}, async updatePassword() {},
    onRecovery() { return () => {}; },
    async signOut() { localStorage.removeItem(KEY); location.reload(); },

    async select(table, { columns = '*', order = 'created_at', asc = true, limit, since } = {}) {
      let rows = [...(state[table] || [])];
      rows = rows.filter(Boolean);
      if (since) rows = rows.filter((r) => r[since.column] >= since.value);
      rows.sort((a, b) => (a[order] > b[order] ? 1 : -1) * (asc ? 1 : -1));
      if (limit) rows = rows.slice(0, limit);
      if (columns !== '*') {
        const keep = columns.split(',').map((c) => c.trim());
        rows = rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])));
      }
      return rows;
    },
    async getOne(table, id) { return state[table].find((r) => r.id === id); },
    async insert(table, rows) {
      const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      (state[table] ||= []).push(...list); save(); return list;
    },
    async update(table, id, patch) {
      const r = state[table].find((x) => x.id === id); Object.assign(r, patch); save(); return { ...r };
    },
    async updateMany(table, ids, patch) {
      const set = new Set(ids); state[table].forEach((r) => set.has(r.id) && Object.assign(r, patch)); save();
    },
    async remove(table, id) { state[table] = state[table].filter((x) => x.id !== id); save(); },
    async getSettings() { return state.settings || {}; },
    async saveSettings(data) { state.settings = data; save(); },
  };
}

// Ajoute ?demo à l'adresse pour essayer l'app avec des données d'exemple (sans toucher à tes vraies données)
const forceDemo = new URLSearchParams(location.search).has('demo');
export const db = SUPABASE_URL && SUPABASE_ANON_KEY && !forceDemo ? supabaseBackend() : demoBackend();
