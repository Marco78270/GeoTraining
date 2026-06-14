# GeoTrainer Atlas

Application React pour créer un atlas privé d'indices visuels et s'entraîner à GeoGuessr. Les utilisateurs peuvent organiser leurs indices par collection, catégorie, pays et région, puis partager une collection avec d'autres comptes.

## Première release

- inscription et connexion par email/mot de passe avec Supabase Auth ;
- collections privées, catégories et invitations avec rôle éditeur ;
- collections publiques officielles en lecture seule ;
- carte mondiale interactive inspirée de la maquette GeoTrainer Atlas ;
- catalogue de 174 pays et 2 872 divisions administratives de premier niveau ;
- filtres par catégorie, continent et difficulté ;
- éditeur en cinq étapes pour importer de 1 à 6 images privées ;
- couverture d'un indice par pays entier ou par régions sélectionnées ;
- images JPEG, PNG et WebP limitées à 10 Mo chacune ;
- règles RLS Supabase pour isoler les collections privées et exposer les collections publiques publiées en lecture seule.

L'Atlas utilise encore des contenus de démonstration pour certains panneaux de détail et les statistiques. Les collections, catégories, comptes et nouveaux indices sont déjà reliés à Supabase.

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
- Supabase CLI.

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

L'aperçu est disponible sur [http://localhost:5173](http://localhost:5173). Après connexion, l'Atlas se trouve sur [http://localhost:5173/atlas](http://localhost:5173/atlas).

Pour un accès depuis un autre appareil du même réseau local, utilise [http://IP_DE_TON_PC:5173](http://IP_DE_TON_PC:5173). Le serveur Vite est configuré pour écouter sur `0.0.0.0`.

Pour vérifier le build de production localement :

```bash
npm run build
npx vite preview --host 0.0.0.0 --port 4173
```

## Docker

Le projet est dockerisable pour un déploiement HTTPS simple avec `Caddy` devant le front. L'application React reste servie par `nginx` en interne, et `Caddy` gère :

- la terminaison TLS ;
- la redirection automatique HTTP vers HTTPS ;
- le renouvellement automatique des certificats.

Préparer un fichier `.env` ou exporter ces variables avant le démarrage :

```env
APP_DOMAIN=geotrainer.duckdns.org
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Avec Compose :

```bash
docker compose up -d --build
```

Le site sera alors disponible sur :

- `https://$APP_DOMAIN`
- `http://$APP_DOMAIN` redirigé automatiquement vers HTTPS

Conditions nécessaires pour que le certificat soit émis :

- le sous-domaine DNS doit déjà pointer vers ton serveur ;
- les ports `80` et `443` doivent être ouverts et redirigés vers la machine Docker ;
- `APP_DOMAIN` doit contenir un vrai nom public, pas une IP.

Exemple DuckDNS :

```bash
APP_DOMAIN=geotrainer.duckdns.org
```

Notes :

- `Caddy` ne pourra pas obtenir de certificat public valide si `APP_DOMAIN` vaut seulement une IP ;
- pour un test purement local, garde `npm run dev` ou `vite preview` ;
- les variables `VITE_*` sont injectées au runtime dans `config.js`, ce qui évite de rebuilder l'image pour changer de projet Supabase ;
- `nginx` continue de supporter les routes SPA comme `/atlas`, `/collections` et `/training`.

### Déploiement DuckDNS

1. créer un sous-domaine sur [DuckDNS](https://www.duckdns.org/) ;
2. faire pointer ce sous-domaine vers ton IP publique ;
3. mettre `APP_DOMAIN` à cette valeur dans `.env` ;
4. ouvrir les ports `80` et `443` sur ta box et les rediriger vers ton serveur ;
5. lancer :

```bash
docker compose up -d --build
```

6. vérifier ensuite que le site répond bien sur `https://<ton-sous-domaine>.duckdns.org`.

Commande PowerShell de mise Ã  jour DuckDNS :

```powershell
$env:DUCKDNS_TOKEN="ton-token"
powershell -ExecutionPolicy Bypass -File .\scripts\deployment\update-duckdns.ps1 -Domain geotrainer
```

Pour cette instance, la valeur attendue est :

```env
APP_DOMAIN=geotrainer.duckdns.org
```

## Collection publique des drapeaux

La catégorie officielle `Drapeaux` de la `Collection officielle` peut etre alimentée automatiquement depuis FlagCDN / Flagpedia, avec stockage des images dans Supabase Storage et conservation de la source sur chaque indice.

Commande d'import :

```bash
npm run flags:import
```

Variables requises :

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Mode verification sans upload :

```bash
npm run flags:import -- --dry-run
```

## Collection publique des bollards

La catégorie officielle `Bollards` de la `Collection officielle` peut etre alimentee automatiquement depuis Geometas. L'import recupere les pays, les images, la description source et tente aussi de conserver un lien Google Maps quand il est present dans la fiche source.

Commande d'import :

```bash
npm run bollards:import
```

Variables requises :

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Mode verification sans upload :

```bash
npm run bollards:import -- --dry-run
```

## Collection publique des plaques

La categorie officielle `Plaques` de la `Collection officielle` utilise des datasets locaux versionnes dans :

- `scripts/official-plates/plates.v1.json`
- `scripts/official-plates/plates.europe.v1.json`
- `scripts/official-plates/plates.us-states.v1.json`

Le lot actuel couvre :

- les 12 plaques officielles historiques du projet ;
- une extension europeenne par pays quand une reference exploitable a ete retenue ;
- les 50 Etats americains via les regions `US-XX` (3 dans le dataset historique, 47 dans le dataset dedie).

Chaque entree pointe vers une image Wikimedia Commons choisie manuellement, puis l'import :

- telecharge le fichier depuis Wikimedia ;
- detecte le vrai format d'image ;
- envoie l'image dans le bucket `clue-images` ;
- met a jour `clue_images` et les metadonnees de provenance sur l'indice officiel.

Commande d'import :

```bash
npm run plates:import
```

Variables requises :

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PLATES_AUTHOR_ID=<optional-profile-uuid>
```

Mode verification sans upload :

```bash
npm run plates:import -- --dry-run
```

## Routes principales

- `/login` : connexion ;
- `/register` : création de compte ;
- `/atlas` : carte interactive ;
- `/collections` : collections, catégories et partage ;
- `/clues/new` : import d'un nouvel indice ;
- `/clues/:clueId/edit` : édition d'un indice ;
- `/invitations/:token` : acceptation d'une invitation.

## Configuration Auth Supabase

Pour que les emails de confirmation et de recuperation de mot de passe n'envoient pas vers `localhost`, il faut verifier la configuration Auth du projet Supabase :

1. ouvrir `Authentication` -> `URL Configuration` dans le dashboard Supabase ;
2. renseigner `Site URL` avec l'URL publique reelle de l'application, par exemple `https://atlas.ton-domaine.fr` ;
3. ajouter aussi cette URL dans `Redirect URLs`, ainsi que `http://localhost:5173` pour le developpement local ;
4. redemarrer le front si tu viens de changer d'URL d'hebergement.

Le front envoie maintenant explicitement les nouveaux inscrits vers `/login` sur l'origine courante du site, ce qui evite que les emails de verification repartent vers une ancienne URL locale.

## Collections publiques

- une `Collection officielle` est seedée par migration ;
- cette collection est visible par tous les utilisateurs connectés ;
- elle est en lecture seule côté application pour les utilisateurs standards ;
- la structure est prête pour accueillir d'autres collections publiques plus tard.

## Administration plateforme

- les rôles globaux sont stockés dans `public.user_roles` ;
- `admin` peut accéder à l'administration plateforme ;
- `super_admin` peut gérer les autres rôles globaux ;
- `marc.roger@outlook.fr` est seedé comme super-admin racine si le compte existe déjà dans `auth.users` ;
- ce rôle racine ne peut pas être retiré ou rétrogradé par les flux normaux de l'application et de la base.

Route applicative :

- `/admin` : administration minimale des rôles plateforme.

## Édition Atlas et zoom régional

- modification d'un indice depuis le panneau de détail Atlas ;
- conservation ou retrait individuel des images déjà enregistrées ;
- ajout de nouvelles images pendant l'édition ;
- lien Google Maps optionnel par indice ;
- zoom sur un pays avec couverture agrégée par régions selon les filtres actifs.

## Données géographiques

Les frontières nationales proviennent de Natural Earth 5.1.1. Les divisions ADM1 proviennent de geoBoundaries gbOpen, version épinglée dans `scripts/geography/sources.json`. Les fichiers sont normalisés, simplifiés pour le web et vérifiés par checksum.

168 pays de la carte disposent d'un catalogue ADM1. geoBoundaries ne fournit pas cette donnée pour l'Antarctique, le Sahara occidental, les îles Falkland, la Nouvelle-Calédonie, Porto Rico et les Terres australes et antarctiques françaises ; l'éditeur conserve alors le mode `Pays entier`.

Commandes de maintenance :

```bash
npm run geography:sync
npm run geography:generate
npm run geography:verify
npm run test:geography
```

`geography:sync` télécharge les sources épinglées et met à jour leurs checksums. Les fichiers sources placés dans `scripts/geography/cache` ne sont pas suivis par Git. Les GeoJSON web générés dans `public/geography` sont versionnés.

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
- geoBoundaries gbOpen : CC BY 4.0, [www.geoboundaries.org](https://www.geoboundaries.org/).
