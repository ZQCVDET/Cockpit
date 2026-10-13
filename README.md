# Cockpit

Mon tableau de bord perso pour le Q1 : cours, séances à rattraper, temps libre, journal de travail et newsletters.
C'est une app web installable (PWA) qui fonctionne sur iPhone, iPad et ordinateur.

👉 **Pour la mettre en ligne : [docs/GUIDE.md](docs/GUIDE.md)**

## Ce que fait l'app

| Écran | À quoi ça sert |
|---|---|
| **Accueil** | Temps libre restant cette semaine, séances à rattraper, heures travaillées, compte à rebours avant les examens, newsletters non lues, programme du jour |
| **Agenda** | Semaine par semaine. Les cours arrivent tout seuls depuis ton lien iCal ; tu ajoutes réunions, job, club, loisirs (piano, sport…), perso (avec répétition hebdo possible). Les blocs proposés par le planning apparaissent en pointillés |
| **Cours** | Pointage en lot : coche les séances terminées → *J'y étais* (→ **Complétés**) ou *Pas assisté* (→ **À rattraper**, puis *Rattrapé* une fois fait). Filtre par cours, onglet **Par cours** avec les stats |
| **Tâches** | To-do list avec 4 niveaux d'urgence, deadline et temps estimé. Le **planning automatique** place chaque tâche dans tes créneaux libres (deadline la plus proche d'abord) et alerte quand ça ne rentre pas. Il garde une **pause après chaque cours** et le **trajet** domicile ↔ campus (réglables). Touche un bloc pour le **déplacer** (📌) ou dire « **pas dispo** ». Import Notion (automatique ou CSV) |
| **Journal** | Chrono (lancé sur le téléphone, arrêté sur l'ordi, ça marche) ou ajout manuel. Totaux du mois par catégorie et par semaine |
| **News** | Les e-mails de ton libellé Gmail « Newsletters », lisibles dans l'app |
| **Réglages** | Prénom, journée type, engagements fixes, catégories, date des examens, sauvegarde |

### Le calcul du temps libre

```
capacité     = (fin de journée − début de journée) × 7        ex. (23 h − 8 h) × 7 = 105 h
temps libre  = capacité − tout ce qui est dans l'agenda − engagements fixes (club hors réunions, repas, trajets…)
```
« Restant cette semaine » fait le même calcul, mais seulement à partir de maintenant jusqu'à dimanche soir.

## Comment ça marche (version simple)

```
 iPhone / iPad / Mac                     Cloud (gratuit, toujours allumé)
┌──────────────────────┐   lit/écrit   ┌──────────────────────────────┐
│  App Cockpit          │ ───────────▶ │  Supabase (base de données)   │
│  (fichiers sur        │ ◀─────────── │  events · work_logs ·          │
│   GitHub Pages)       │              │  newsletters · settings        │
└──────────────────────┘              └──────────────▲───────────────┘
                                                      │ toutes les heures
                                       ┌──────────────┴───────────────┐
                                       │  Google Apps Script           │
                                       │  lien iCal ─▶ cours            │
                                       │  Gmail « Newsletters » ─▶ news │
                                       └──────────────────────────────┘
```

- **L'app** n'est qu'un ensemble de fichiers (HTML, CSS, JavaScript). GitHub les distribue ; ton navigateur les exécute.
- **Supabase** stocke les données. Chaque ligne est liée à ton compte, et des règles de sécurité (RLS) empêchent quiconque d'autre de les lire.
- **Apps Script** est un petit programme hébergé par Google qui se réveille toutes les heures.
- Hors connexion, l'app s'ouvre quand même et affiche les dernières données chargées.

## Les fichiers

```
index.html              la page unique de l'app
config.js               ← tes 2 valeurs Supabase (URL + clé publique)
manifest.webmanifest    nom, icône, couleurs pour l'installation sur l'écran d'accueil
sw.js                   "service worker" : garde l'app en cache pour l'ouvrir sans réseau
css/style.css           tout le design (couleurs, mode sombre, mise en page mobile/ordi)
js/app.js               connexion + navigation entre les écrans
js/store.js             l'état de l'app (données chargées) et les actions (ajouter, modifier…)
js/db.js                parle à Supabase (ou au stockage local en mode démo)
js/lib.js               outils : dates, couleurs, calcul du temps libre
js/planner.js           le planning automatique des tâches (créneaux libres, priorités, alertes)
js/csv.js               import d'un export CSV de Notion
js/ui.js                petits composants (icônes, panneau du bas, notifications)
js/demo.js              données d'exemple du mode démo
js/views/*.js           un fichier par écran
supabase/schema.sql     création des tables + règles de sécurité
apps-script/Sync.gs     le robot de synchronisation (horaire + Gmail)
```

Technologies : [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm) (une version légère de React, sans étape de compilation), [supabase-js](https://supabase.com/docs/reference/javascript). Aucune installation n'est nécessaire.

## Tester en local (facultatif)

```bash
python3 .claude/serve.py
```
Puis ouvre http://localhost:8765. Si `config.js` est vide, l'app démarre en **mode démo** avec des données d'exemple.
