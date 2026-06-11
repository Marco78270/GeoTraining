# GeoTrainer Atlas

Application React pour créer un atlas privé d'indices visuels et s'entraîner à
GeoGuessr. Les utilisateurs peuvent organiser leurs indices par collection,
catégorie, pays et région, puis partager une collection avec d'autres comptes.

## Première release

- inscription et connexion par email/mot de passe avec Supabase Auth ;
- collections privées, catégories et invitations avec rôle éditeur ;
- carte mondiale interactive inspirée de la maquette GeoTrainer Atlas ;
- catalogue de 174 pays et 2 872 divisions administratives de premier niveau ;
- filtres par catégorie, continent et difficulté ;
- éditeur en cinq étapes pour importer de 1 à 6 images privées ;
- couverture d'un indice par pays entier ou par régions sélectionnées ;
- images JPEG, PNG et WebP limitées à 10 Mo chacune ;
- règles RLS Supabase pour isoler les collections et les fichiers privés.

L'Atlas utilise encore des contenus de démonstration pour les panneaux de détail
et les statistiques. Les collections, catégories, comptes et nouveaux indices
sont déjà reliés à Supabase.

## Technologies

- React 19, TypeScript et Vite ;
- MapLibre GL pour la carte ;
- Supabase Auth, Postgres, Storage et Realtime ;
- TanStack Query ;
- Vitest, Testing Library et Playwright.

## Prérequis

- Node.js 20.19 ou plus récent ;
- npm 11 ;
- Docker Desktop pour lancer Supabase en local ;
- Supabase CLI, déjà disponible dans les dépendances du projet.

## Installation

```bash
git clone https://github.com/Marco78270/GeoTraining.git
cd GeoTraining
npm install
```

Copier `.env.example` vers `.env.local`, puis renseigner les valeurs Supabase :

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
```

## Lancement local

1. Démarrer Docker Desktop.
2. Lancer Supabase et récupérer la clé `anon` affichée :

```bash
npx supabase start
```

3. Appliquer les migrations :

```bash
npx supabase db reset
```

4. Démarrer l'application :

```bash
npm run dev
```

L'aperçu est disponible sur [http://localhost:5173](http://localhost:5173).
Après connexion, l'Atlas se trouve sur
[http://localhost:5173/atlas](http://localhost:5173/atlas).

## Routes principales

- `/login` : connexion ;
- `/register` : création de compte ;
- `/atlas` : carte interactive ;
- `/collections` : collections, catégories et partage ;
- `/clues/new` : import d'un nouvel indice ;
- `/invitations/:token` : acceptation d'une invitation.

## Données géographiques

Les frontières nationales proviennent de Natural Earth 5.1.1. Les divisions
ADM1 proviennent de geoBoundaries gbOpen, version épinglée dans
`scripts/geography/sources.json`. Les fichiers sont normalisés, simplifiés pour
le web et vérifiés par checksum.

168 pays de la carte disposent d'un catalogue ADM1. geoBoundaries ne fournit
pas cette donnée pour l'Antarctique, le Sahara occidental, les îles Falkland,
la Nouvelle-Calédonie, Porto Rico et les Terres australes et antarctiques
françaises ; l'éditeur conserve alors le mode `Pays entier`.

Commandes de maintenance :

```bash
npm run geography:sync
npm run geography:generate
npm run geography:verify
npm run test:geography
```

`geography:sync` télécharge les sources épinglées et met à jour leurs checksums.
Les fichiers sources placés dans `scripts/geography/cache` ne sont pas suivis
par Git. Les GeoJSON web générés dans `public/geography` sont versionnés.

## Vérification

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Les tests SQL Supabase se trouvent dans `supabase/tests` et nécessitent Docker :

```bash
npx supabase db reset
npx supabase test db
```

## Licence des données

- Natural Earth : domaine public ;
- geoBoundaries gbOpen : CC BY 4.0,
  [www.geoboundaries.org](https://www.geoboundaries.org/).
