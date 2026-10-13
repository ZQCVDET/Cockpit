# Mettre Cockpit en ligne (≈ 45 min, une seule fois)

À la fin, tu auras :
- une app à l'adresse `https://TON-PSEUDO.github.io/cockpit/`, installée sur ton iPhone, ton iPad et ton ordi ;
- tes données synchronisées entre les 3 appareils ;
- ton horaire et tes newsletters importés automatiquement toutes les heures, ordi éteint.

Coût : **0 €**. Tu utilises 3 services gratuits :

| Service | Rôle | Analogie |
|---|---|---|
| **GitHub Pages** | héberge les fichiers de l'app | le magasin où on vient chercher l'app |
| **Supabase** | base de données + connexion | le classeur Excel dans le cloud, protégé par ton mot de passe |
| **Google Apps Script** | robot qui tourne toutes les heures | le stagiaire qui recopie ton horaire et tes newsletters dans le classeur |

> 💡 Les menus de ces sites changent parfois de nom. Si un bouton n'est pas exactement là où je le dis, cherche un libellé proche ou envoie-moi une capture d'écran.

---

## Étape 1 : Créer la base de données (Supabase)

1. Va sur **supabase.com** → **Start your project** → inscris-toi (avec ton compte GitHub, c'est le plus simple, ou par e-mail).
2. **New project** :
   - Name : `cockpit`
   - Database Password : clique sur **Generate**. Tu n'en auras pas besoin ensuite, mais garde-le quelque part.
   - Region : **Central EU (Frankfurt)** (le plus proche de Bruxelles)
   - Clique sur **Create new project**, puis attends ~2 minutes.
3. Dans le menu de gauche : **SQL Editor** → **New query**.
4. Ouvre le fichier [`supabase/schema.sql`](../supabase/schema.sql), copie **tout** son contenu, colle-le dans l'éditeur, puis clique sur **Run**.
   → Le message attendu est « Success. No rows returned ». Tes 4 tables sont créées (tu peux les voir dans **Table Editor**).
5. Menu **Authentication** → **Sign In / Providers** (ou *Providers → Email*) :
   - vérifie que **Email** est activé ;
   - désactive **Confirm email** pour l'instant (sinon il faut cliquer sur un lien reçu par mail) → **Save**.
6. Menu **Project Settings** (roue dentée) → **API Keys** (ou **Data API**). Note dans un coin :
   - **Project URL** : `https://xxxxxxxx.supabase.co`
   - la clé **publishable** (`sb_publishable_…`) ou, sur l'ancien écran, la clé **anon public** (`eyJ…`) → c'est la clé **publique**
   - la clé **secret** (`sb_secret_…`) ou **service_role** (`eyJ…`) → c'est la clé **secrète**. ⚠️ Ne la mets JAMAIS dans l'app ni sur GitHub. Elle servira seulement à l'étape 4.

## Étape 2 : Mettre l'app en ligne (GitHub Pages)

1. Va sur **github.com** → **Sign up** (choisis bien ton pseudo : il sera dans l'adresse de l'app).
2. En haut à droite **+** → **New repository** :
   - Repository name : `cockpit`
   - **Public**. C'est obligatoire pour GitHub Pages gratuit. Le *code* sera visible, mais **pas tes données** : elles sont dans Supabase, protégées par ton mot de passe.
   - Clique sur **Create repository**.
3. Sur la page qui s'affiche, clique sur le lien **uploading an existing file**.
4. Avec **Chrome**, glisse-dépose dans la fenêtre **le contenu** du dossier Cockpit : `index.html`, `config.js`, `manifest.webmanifest`, `sw.js`, `README.md` et les dossiers `css`, `js`, `icons`, `supabase`, `apps-script`, `docs`.
   → Clique sur **Commit changes** en bas.
   ⚠️ N'envoie **pas** le dossier `Tâches` (tes exports Notion) : le dépôt est public, et ces fichiers contiennent les noms des membres du club et l'organisation interne. Ils servent uniquement à l'import, directement dans l'app.
5. Toujours dans le dépôt, ouvre le fichier **config.js** → clique sur l'icône ✏️ (Edit) → colle ta **Project URL** et ta clé **publique** entre les guillemets :
   ```js
   export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_xxx';
   ```
   → **Commit changes**.
6. Onglet **Settings** du dépôt → **Pages** (menu de gauche) :
   - Source : **Deploy from a branch**
   - Branch : **main**, dossier **/ (root)** → **Save**.
   - Attends 1 à 2 minutes, puis rafraîchis : l'adresse `https://TON-PSEUDO.github.io/cockpit/` apparaît en haut.

## Étape 3 : Créer ton compte et verrouiller la porte

1. Ouvre `https://TON-PSEUDO.github.io/cockpit/` → **Première fois ? Créer le compte** → ton e-mail + un mot de passe (8 caractères minimum) → **Créer le compte**.
2. Connecte-toi. L'app est vide : c'est normal, l'horaire arrive à l'étape 4.
3. **Important (sécurité)** : retourne dans Supabase → **Authentication** → **Sign In / Providers** → désactive **Allow new users to sign up** → **Save**.
   → Plus personne d'autre ne peut créer de compte sur ton app.
4. Toujours dans **Authentication** → **Users** : copie ton **User UID** (une suite du type `3f2a…-…`). Tu en as besoin juste après.
5. **Authentication** → **URL Configuration** → **Site URL** : colle l'adresse de ton app → **Save**.

## Étape 4 : Le robot de synchronisation (Google Apps Script)

### 4a. Préparer Gmail
1. Dans Gmail, crée un libellé **Newsletters** (menu de gauche → **+** à côté de « Libellés »).
2. Pour chaque newsletter : ouvre un de ses e-mails → **⋮** → **Filtrer les messages similaires** → **Créer un filtre** → coche **Appliquer le libellé : Newsletters** (et éventuellement **Ignorer la boîte de réception**) → **Créer un filtre**.

### 4b. Installer le script
1. Va sur **script.google.com** → **Nouveau projet**. Renomme-le « Cockpit sync » (clic sur « Projet sans titre »).
2. Efface le contenu de `Code.gs`, puis colle **tout** le fichier [`apps-script/Sync.gs`](../apps-script/Sync.gs). Clique sur 💾.
3. ⚙️ **Paramètres du projet** (menu de gauche) → tout en bas, **Propriétés du script** → **Ajouter une propriété du script**. Ajoute ces 5 propriétés :

   | Propriété | Valeur |
   |---|---|
   | `SUPABASE_URL` | ta Project URL |
   | `SUPABASE_SECRET_KEY` | ta clé **secrète** Supabase |
   | `USER_ID` | ton User UID (étape 3.4) |
   | `ICS_URL` | le lien iCal de ton horaire |
   | `GMAIL_LABEL` | `Newsletters` |

   → **Enregistrer les propriétés du script**. (Pour Notion, voir l'étape 4c plus bas.)
4. Retourne dans l'**Éditeur** (`< >`). En haut, dans la liste des fonctions, choisis **setup** → **▶ Exécuter**.
5. Google demande une autorisation : **Examiner les autorisations** → ton compte → « Google n'a pas validé cette application » → **Paramètres avancés** → **Accéder à Cockpit sync (non sécurisé)** → **Autoriser**.
   → C'est normal : c'est *ton propre* script, Google ne l'a simplement pas vérifié. Il demande l'accès à Gmail (lecture du libellé) et à Internet (télécharger l'horaire, écrire dans Supabase).
6. Le journal d'exécution doit afficher quelque chose comme « 312 séances synchronisées » et « 8 nouvelle(s) newsletter(s) ».
7. Rafraîchis l'app : tes cours et tes newsletters sont là. 🎉 Le script tourne désormais **toutes les heures**, tout seul.

### 4c. (Optionnel) Brancher tes deadlines Notion

Deux façons de faire, selon tes droits sur l'espace Notion du club :

**A. Synchronisation automatique.** Il faut pouvoir créer une « intégration » dans l'espace *Campus Recruitment*. Notion le réserve en général aux **propriétaires de l'espace** : demande à un admin du club si tu n'as pas ce droit.
1. Connecté à Notion avec ton **compte ULB**, va sur **notion.so/profile/integrations** → **Nouvelle intégration**.
   - Nom : `Cockpit` · Espace : **Campus Recruitment** · Type : **Interne** → **Enregistrer**.
   - Onglet **Capacités** : coche **Lire le contenu**. Coche aussi **Lire les infos des utilisateurs, e-mails compris** si tu veux filtrer « mes tâches ».
   - Copie le **Secret interne** (il commence par `ntn_…`).
2. Ouvre ta base de deadlines dans Notion → **⋯** (en haut à droite) → **Connexions** → ajoute **Cockpit**.
3. Dans Apps Script → **Propriétés du script**, ajoute :

   | Propriété | Valeur |
   |---|---|
   | `NOTION_TOKEN` | le secret `ntn_…` |
   | `NOTION_DATABASE_ID` | le lien de la base (le script y trouve tout seul le code à 32 caractères) |
   | `NOTION_ASSIGNEE` | *(optionnel)* ton prénom/nom ou ton e-mail ULB, pour ne garder que **tes** tâches |
   | `NOTION_CATEGORY` | *(optionnel)* catégorie des tâches importées (par défaut `SCR (club)`) |

4. Relance **setup** une fois. Ensuite, les tâches Notion arrivent dans **Tâches** toutes les heures. Le titre, la deadline et l'état « fait » suivent Notion. **Ton estimation de temps et ton urgence restent celles que tu as choisies dans Cockpit.**

**B. Import manuel (CSV), sans aucun droit particulier.** Dans Notion, ouvre la base → **⋯** → **Exporter** → format **CSV**. Ensuite, dans Cockpit → **Tâches** → lien « importe le fichier » en bas. Les doublons et les tâches déjà terminées sont ignorés : tu peux refaire l'import chaque semaine.

> Les tâches venant de Notion n'ont pas d'estimation de temps. Ouvre-les et choisis une durée : c'est ce qui leur donne une place dans le planning automatique.

> Le lien iCal vient de Google Agenda ? Ouvre les paramètres de l'agenda → **Intégrer l'agenda** → **Adresse secrète au format iCal**.

## Étape 5 : Installer l'app sur tes appareils

- **iPhone / iPad** : ouvre l'adresse dans **Safari** → bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → **Ajouter**. Connecte-toi une fois, c'est mémorisé.
- **Mac / PC** : dans **Chrome**, clique sur l'icône « Installer » à droite de la barre d'adresse (ou ⋮ → **Caster, enregistrer et partager** → **Installer la page en tant qu'application**). Avec Safari sur Mac : **Fichier** → **Ajouter au Dock**.

---

## En cas de souci

| Problème | Solution |
|---|---|
| Page blanche ou erreur 404 | Attends 2 minutes après un commit. Vérifie que `index.html` est bien à la racine du dépôt, pas dans un sous-dossier. |
| « Invalid API key » | La clé dans `config.js` est mal copiée (espace en trop ?) ou tu as mis la clé secrète au lieu de la publique. |
| Le script affiche « Supabase 401 » | `SUPABASE_SECRET_KEY` est incorrecte. |
| Le script affiche « Calendrier inaccessible » | Le lien iCal est faux ou expiré. Teste-le dans ton navigateur : il doit télécharger un fichier `.ics`. |
| Les cours ont de drôles de noms | Envoie-moi 2-3 exemples de noms tels qu'ils apparaissent : j'ajouterai un nettoyage automatique. |
| Supabase « paused » | Le projet gratuit se met en pause après 7 jours *sans aucune activité*. Le script qui tourne toutes les heures l'en empêche. Si ça arrive quand même : bouton **Restore** dans Supabase. |

## Faire évoluer l'app

Quand tu veux une nouvelle fonctionnalité, demande-la-moi. Je modifie les fichiers, puis tu les remplaces sur GitHub (**Add file** → **Upload files** → glisse les fichiers modifiés → **Commit**). Le site se met à jour en ~1 minute. Sur ton téléphone, ferme et rouvre l'app (parfois deux fois) pour voir la nouvelle version.
