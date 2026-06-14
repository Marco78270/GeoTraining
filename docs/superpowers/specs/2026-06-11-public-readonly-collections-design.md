# Collections Publiques En Lecture Seule Design

## Objectif

Ajouter un vrai concept de collection publique visible par tous les utilisateurs connectés, tout en conservant les collections privées existantes. La première collection publique livrée sera `Drapeaux des pays`, accessible en lecture seule pour les utilisateurs standards.

## Contexte

Aujourd'hui, le modèle repose sur `collections` + `collection_members` et toute visibilité est dérivée de l'appartenance à une collection. Cela fonctionne bien pour les collections privées collaboratives, mais empêche l'existence d'une base commune officielle visible par tous.

Le besoin produit est de proposer une collection de référence immédiatement exploitable pour l'entraînement, sans permettre aux utilisateurs standards de la modifier.

## Décisions retenues

### 1. Modèle de visibilité natif

Le schéma `collections` gagne un champ de visibilité avec deux états :

- `private`
- `public_readonly`

Ce choix évite d'introduire un cas spécial codé en dur pour une collection unique. Il permet d'ajouter plus tard d'autres collections publiques officielles sans refonte.

### 2. Collections publiques visibles, mais non éditables

Une collection `public_readonly` :

- est listée pour tous les utilisateurs connectés ;
- expose ses catégories, indices, régions et images en lecture ;
- ne peut pas être modifiée par les utilisateurs standards ;
- reste éditable uniquement par une identité d'administration/seed contrôlée côté base.

### 3. V1 contenu : un drapeau par pays, modèle extensible

La première collection publique contiendra :

- une collection `Drapeaux des pays` ;
- une catégorie `Drapeaux` ;
- un indice publié par pays.

La donnée seedée respectera la contrainte produit "un seul drapeau par pays" pour démarrer, mais le modèle applicatif et la base restent compatibles avec plusieurs indices par pays à l'avenir.

### 4. Livraison initiale par seed/migration

La création de la première collection publique et de son contenu se fera par migration/seed Supabase. Un écran d'administration pourra être ajouté plus tard, mais n'est pas requis pour livrer la V1.

## Changements techniques

### Base de données

Les migrations devront :

1. ajouter un enum de visibilité des collections ;
2. ajouter la colonne `visibility` à `public.collections` avec valeur par défaut `private` ;
3. adapter les fonctions et policies RLS qui testent aujourd'hui uniquement l'appartenance ;
4. insérer la collection publique `Drapeaux des pays` et sa catégorie `Drapeaux`.

### RLS

Les règles de lecture seront élargies :

- une collection privée reste lisible si l'utilisateur en est membre ;
- une collection publique en lecture seule devient lisible même sans membership.

Les tables concernées sont :

- `collections`
- `categories`
- `clues`
- `clue_regions`
- `clue_images`
- accès lecture au bucket `clue-images`

Les règles d'écriture restent inchangées pour les collections privées et demeurent verrouillées pour les collections publiques standard. Les écritures sur une collection publique devront rester limitées à l'identité système/administrative utilisée pour le seed et les futures opérations de maintenance.

### API collections

L'API front des collections devra :

- retourner aussi les collections publiques ;
- enrichir le résumé d'une collection avec sa `visibility` ;
- conserver la notion de `role` pour les collections privées ;
- exposer côté UI le fait qu'une collection soit publique et non éditable.

Le modèle devra éviter d'inventer un faux membership pour une collection publique. L'affichage pourra continuer à utiliser `role` pour les privées, avec une logique UI dédiée pour `visibility`.

### UI collections / atlas / indices

Le front devra :

- afficher les collections publiques dans le picker et dans `/collections` ;
- distinguer visuellement `publique` / `lecture seule` ;
- empêcher la création, édition et suppression de catégories/indices lorsqu'une collection publique est active pour un utilisateur standard ;
- continuer à permettre la consultation complète dans l'Atlas.

L'expérience attendue est qu'un utilisateur puisse sélectionner `Drapeaux des pays` comme n'importe quelle autre collection pour s'entraîner, sans confusion sur son caractère non modifiable.

## Données initiales

La V1 structurelle doit au minimum créer :

- la collection `Drapeaux des pays`
- la catégorie `Drapeaux`

Le peuplement complet des indices drapeaux doit être préparé pour être seedé de façon déterministe.

Deux modes sont possibles :

1. seed complet dès cette tranche si les assets sont prêts ;
2. seed structurel immédiatement, puis import du catalogue drapeaux dans une tranche suivante.

La présente conception reste compatible avec les deux, mais l'architecture doit être pensée pour un seed complet futur sans refonte.

## Gestion des images

Les images de drapeaux devront suivre les mêmes règles que les autres indices :

- objet stocké dans `clue-images`
- métadonnée `clue_images`
- indice publié uniquement si l'image existe

Le pipeline de seed devra donc respecter l'ordre déjà imposé par les triggers : stockage d'image, insertion de métadonnée, puis publication.

## Impact UX

### Page collections

La page collections doit pouvoir montrer à la fois :

- les collections privées possédées ou partagées ;
- les collections publiques officielles.

Une collection publique doit clairement être signalée comme non modifiable, afin d'éviter de proposer des actions impossibles.

### Atlas

L'Atlas doit fonctionner sans distinction de comportement sur la lecture :

- catégories visibles ;
- indices visibles ;
- panneau de détail visible ;
- futur entraînement exploitable.

### Création / édition

Si la collection active est publique :

- l'utilisateur standard ne voit pas ou ne peut pas déclencher `Ajouter un indice` ;
- les actions d'édition de collection/catégorie sont masquées ou désactivées.

## Tests

La livraison devra inclure :

- tests unitaires de l'API collections pour les résumés publics ;
- tests des composants de sélection/affichage de collections publiques ;
- tests de garde UI en lecture seule ;
- si possible, tests SQL/RLS couvrant la lecture publique et l'écriture refusée.

## Hors périmètre

Cette tranche n'inclut pas :

- un back-office complet de gestion des collections publiques ;
- la modération éditoriale ;
- l'entraînement drapeaux lui-même ;
- un workflow d'import massif administrable depuis le front.

## Résultat attendu

À l'issue de cette tranche, un utilisateur connecté pourra voir et sélectionner une collection publique officielle `Drapeaux des pays`, l'explorer dans l'Atlas, et comprendre qu'elle est en lecture seule. Le système restera compatible avec plusieurs collections publiques futures et avec un futur écran d'administration.
