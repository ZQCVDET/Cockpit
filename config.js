// ─────────────────────────────────────────────────────────────
//  Configuration de Cockpit
//  Colle ici les 2 valeurs trouvées dans Supabase :
//  Project Settings → API (ou "Data API" / "API Keys")
//
//  Laisse vide pour utiliser le MODE DÉMO (données stockées
//  uniquement sur l'appareil, pas de synchronisation).
//
//  La clé "anon" / "publishable" est faite pour être publique :
//  tes données sont protégées par les règles de sécurité (RLS)
//  définies dans supabase/schema.sql. Ne mets JAMAIS ici la clé
//  "service_role" / "secret".
// ─────────────────────────────────────────────────────────────
export const SUPABASE_URL = 'https://fjhkdrlhcjxyetbnxdwt.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_CSykOJ6Jbz7_hvXRCAewwA_1fc67KWn';
