# GeoTrainer Atlas - Spécification de conception

## Objectif

Créer une application web collaborative d'entraînement à GeoGuessr. Les utilisateurs importent leurs propres indices visuels, les classent par pays et division administrative, les explorent sur une carte mondiale, puis s'entraînent à reconnaître un pays ou une région.

## Périmètre de la première version

- Compte par email et mot de passe.
- Collections privées appartenant à un utilisateur.
- Invitation de collaborateurs avec droit de modification.
- Catégories personnalisables ; un indice appartient à une seule catégorie.
- Import d'images par les utilisateurs uniquement.
- Association d'un indice à un pays entier ou à certaines divisions administratives officielles.
- Carte mondiale interactive avec navigation pays puis régions.
- Entraînement mondial par pays.
- Entraînement ciblé sur les régions d'un pays.
- Historique simple des sessions et taux de réussite.

La première version n'inclut pas de bibliothèque publique d'indices, de connexion sociale, de catégories multiples par indice, ni de collaboration en lecture seule.

## Architecture

Le frontend est une application React TypeScript. Supabase fournit PostgreSQL, l'authentification email/mot de passe, le stockage privé des images et les mises à jour de données nécessaires à la collaboration.

Les appels Supabase sont regroupés dans des modules de services typés. Les composants d'interface ne manipulent pas directement les requêtes SQL ni les chemins de stockage.

La carte utilise des données GeoJSON pour les pays et leurs divisions administratives de premier niveau. Les identifiants géographiques sont stables et partagés entre la carte, les formulaires et les données d'entraînement.

## Modèle de données

### Profils

Un profil complète l'utilisateur Supabase avec son nom affiché et ses préférences.

### Collections

Une collection possède un propriétaire, un nom, une description et des dates de création et modification. Elle est privée par défaut.

### Collaborateurs

Une adhésion relie une collection à un utilisateur avec le rôle `owner` ou `editor`. Le propriétaire peut inviter et retirer des éditeurs. Les éditeurs peuvent modifier les catégories et indices, mais pas supprimer la collection ni transférer sa propriété.

### Invitations

Une invitation contient la collection, l'adresse email invitée, un jeton non prédictible, une expiration et un état. Une invitation acceptée crée une adhésion `editor`.

### Catégories

Une catégorie appartient à une collection et contient un nom, une icône et une couleur. Chaque indice référence exactement une catégorie.

### Référentiel géographique

Les pays utilisent un code ISO stable. Chaque division administrative appartient à un pays et possède un identifiant stable, un nom et sa géométrie cartographique.

### Indices

Un indice contient :

- la collection et la catégorie ;
- le pays ;
- le mode de couverture `whole_country` ou `selected_regions` ;
- une ou plusieurs images privées ;
- des caractéristiques et notes GeoGuessr ;
- l'auteur et les dates de modification.

Lorsque le pays entier est sélectionné, toutes ses régions sont considérées couvertes sans créer une ligne par région. En mode `selected_regions`, les associations explicites sont enregistrées dans une table de liaison.

### Sessions d'entraînement

Une session enregistre son mode, ses filtres, son score, son nombre de questions et ses dates. Chaque réponse conserve l'indice présenté, la réponse choisie, la réponse correcte et son résultat.

## Autorisations

Les politiques Row Level Security de Supabase appliquent les règles suivantes :

- seuls le propriétaire et les éditeurs voient une collection et ses images ;
- seuls les membres peuvent créer ou modifier catégories et indices ;
- seul le propriétaire gère les invitations et supprime la collection ;
- un utilisateur ne voit que ses propres sessions d'entraînement ;
- les images restent dans un bucket privé et sont affichées par URL signée temporaire.

Les contrôles d'interface améliorent l'expérience, mais les règles RLS restent la source d'autorité.

## Navigation

La navigation supérieure contient :

- Atlas ;
- Entraînement ;
- Collections ;
- Statistiques ;
- compte et déconnexion.

La collection active est conservée entre les sessions et détermine les catégories, indices et statistiques visibles.

## Écran Atlas

La composition reprend la variante A validée :

- colonne gauche permanente ;
- carte centrale ;
- panneau pays ou région à droite ;
- navigation supérieure sombre.

### Colonne gauche

Elle contient la recherche, le sélecteur de collection, les catégories, les filtres de couverture ou difficulté et le bouton `Ajouter un indice`.

Une seule catégorie est active à la fois. Son changement actualise immédiatement la carte et la galerie.

### Carte

La vue mondiale colore les pays selon leur couverture dans la catégorie active. Cliquer sur un pays le sélectionne et ouvre sa fiche.

Le zoom sur un pays affiche ses divisions administratives officielles. Les régions couvertes sont distinguées visuellement et deviennent sélectionnables.

Les contrôles comprennent zoom, recentrage et plein écran. La navigation clavier et les libellés accessibles sont prévus pour les actions essentielles.

### Panneau de détail

Le panneau affiche :

- le pays ou la région sélectionnée ;
- la catégorie active ;
- la galerie des images accessibles ;
- les caractéristiques et notes ;
- les régions couvertes ;
- les actions de modification ;
- un bouton lançant un entraînement préfiltré.

## Ajout et modification d'un indice

Un dialogue guidé comporte cinq étapes :

1. import et aperçu des images ;
2. choix d'une catégorie unique ;
3. choix d'un pays ;
4. pays entier ou sélection de régions ;
5. caractéristiques, notes et confirmation.

Cocher le pays entier sélectionne logiquement toutes ses régions et désactive leur sélection individuelle. Revenir au mode régional permet de choisir les divisions une par une.

Le formulaire valide le type et la taille des fichiers, la présence d'une catégorie, d'un pays et, en mode régional, d'au moins une région. Les informations saisies restent présentes après une erreur réseau afin de permettre une nouvelle tentative.

## Collections et partage

L'écran Collections permet de créer, renommer et ouvrir une collection. Le propriétaire peut inviter un éditeur par email.

Le destinataire accepte l'invitation après connexion ou création de compte avec la même adresse. Les invitations expirées ou déjà utilisées affichent un message spécifique. Les modifications deviennent visibles aux autres membres sans recharger entièrement l'application.

## Entraînement

### Mode Monde

L'utilisateur choisit une collection, une catégorie et éventuellement des filtres. Une image aléatoire est affichée et la réponse se fait en sélectionnant un pays sur la carte.

### Mode Pays

L'utilisateur choisit un pays. Les questions utilisent les indices régionaux de ce pays et la réponse se fait parmi ses divisions administratives.

### Correction

Après chaque réponse, l'application affiche :

- la bonne réponse et la réponse choisie ;
- leur mise en évidence sur la carte ;
- les notes de l'indice ;
- le score et la progression de la session.

Une session ne démarre que si le filtre choisi contient suffisamment d'indices répondables. Les indices sans région précise ne sont pas utilisés dans le mode régional.

## États et erreurs

Chaque vue prévoit des états de chargement, vide, erreur et accès refusé. Les principaux cas spécifiques sont :

- collection sans indice ;
- catégorie sans couverture ;
- pays sans indice régional ;
- fichier invalide ou trop volumineux ;
- invitation expirée ;
- perte de connexion pendant un enregistrement.

Les opérations destructives demandent confirmation. Les erreurs techniques sont journalisées sans exposer d'informations sensibles.

## Design visuel

Le design reprend la référence fournie :

- fond bleu nuit presque noir ;
- panneaux légèrement plus clairs avec bordures discrètes ;
- accent cyan pour la navigation et les sélections ;
- vert, orange et rouge réservés aux niveaux, résultats et états ;
- coins modérément arrondis ;
- forte priorité visuelle donnée à la carte et aux images.

Sur mobile et tablette, la carte reste prioritaire. Les filtres et la fiche de détail deviennent des panneaux coulissants, sans supprimer de fonctionnalité.

## Vérification

Les tests unitaires couvrent les règles de sélection pays-régions, les filtres d'entraînement et les permissions présentées par l'interface.

Les tests d'intégration couvrent l'authentification, la création d'une collection, l'invitation d'un éditeur, l'import d'un indice et le chargement des images privées.

Les parcours navigateur couvrent :

- ajout d'un indice pour un pays entier ;
- ajout d'un indice pour plusieurs régions ;
- exploration de la carte par catégorie ;
- entraînement mondial ;
- entraînement régional ;
- modification collaborative.

Les politiques RLS font l'objet de tests séparés vérifiant les accès du propriétaire, de l'éditeur et d'un utilisateur extérieur.

## Critères d'acceptation

- Un nouvel utilisateur peut créer une collection privée et une catégorie.
- Il peut importer un indice et l'associer à un pays entier ou à des régions précises.
- La carte reflète la couverture de la catégorie active.
- Un éditeur invité peut voir et modifier les indices de la collection.
- Un utilisateur extérieur ne peut ni lire la collection ni accéder à ses images.
- L'entraînement Monde demande un pays et calcule le résultat.
- L'entraînement Pays demande une région et exclut les indices non régionaux.
- L'interface reste utilisable sur ordinateur, tablette et mobile.
