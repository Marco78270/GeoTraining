# Défi quotidien sécurisé - Design

## Objectif

Transformer le défi quotidien existant en une compétition équitable et contrôlée côté serveur : tous les utilisateurs reçoivent les mêmes 10 questions, dans le même ordre, avec une seule tentative par jour.

Le défi reste accessible à tous. Les utilisateurs Premium obtiennent un résultat persistant, de l'XP et une place dans le classement quotidien. Les utilisateurs gratuits jouent le même défi, mais seul leur marqueur de participation est conservé.

## Portée

Cette évolution couvre :

- la génération et la persistance du défi quotidien ;
- la sélection d'une catégorie officielle éligible ;
- le verrouillage de 10 indices illustrés ;
- l'unicité de la tentative quotidienne ;
- la reprise d'une tentative commencée ;
- la validation des réponses côté serveur ;
- la séparation des comportements gratuit et Premium ;
- le bonus quotidien Premium ;
- le pop-up Premium après un défi gratuit ;
- le classement quotidien existant.

Cette évolution ne couvre pas :

- le mode Régions ;
- plusieurs défis dans une même journée ;
- des défis sur les collections privées ;
- le coach IA ;
- des récompenses autres que l'XP et le rang existants.

## Règles fonctionnelles

### Calendrier

- Le défi change à minuit dans le fuseau `Europe/Paris`.
- Sa clé publique est la date locale Paris au format `YYYY-MM-DD`.
- L'interface affiche le temps restant avant le prochain défi.
- Le serveur calcule la date du défi ; le navigateur ne peut pas choisir une date arbitraire pour lancer une tentative.

### Catégorie

- Un défi utilise une seule catégorie officielle.
- La catégorie change quotidiennement selon une rotation déterministe.
- Seules les catégories possédant au moins 10 indices publiés, actifs et illustrés sont éligibles.
- Une catégorie insuffisamment alimentée est ignorée au profit de la prochaine catégorie éligible.
- Si aucune catégorie n'est éligible, aucun défi n'est exposé et la carte est masquée. L'échec est journalisé côté serveur.

### Questions

- Chaque défi contient exactement 10 indices.
- Le mode est toujours `Pays` dans cette version.
- Les indices proviennent uniquement d'une collection officielle.
- Chaque indice doit posséder au moins une image lisible.
- Les 10 indices et leur ordre sont persistés et identiques pour tous les joueurs.
- Le navigateur ne réalise aucun tirage aléatoire pour un défi quotidien.

### Tentative unique

- Chaque utilisateur dispose d'une seule tentative par défi quotidien.
- La tentative est consommée dès son démarrage, pas uniquement à sa validation.
- Une contrainte unique en base protège la règle en cas de double clic ou de requêtes concurrentes.
- Une tentative commencée peut être reprise après rechargement ou fermeture du navigateur.
- Une tentative terminée ne peut pas être relancée, y compris par un utilisateur gratuit.

## Architecture de données

### `daily_challenges`

Une ligne représente le défi officiel d'une date Paris.

Champs principaux :

- `id uuid primary key` ;
- `challenge_date date unique not null` ;
- `collection_id uuid not null` ;
- `category_id uuid not null` ;
- `mode text not null check (mode = 'world')` ;
- `question_count integer not null check (question_count = 10)` ;
- `created_at timestamptz not null`.

### `daily_challenge_items`

Une ligne représente un indice verrouillé dans le défi.

Champs principaux :

- `challenge_id uuid not null` ;
- `position smallint not null check (position between 1 and 10)` ;
- `clue_id uuid not null` ;
- clé primaire `(challenge_id, position)` ;
- unicité `(challenge_id, clue_id)`.

### `daily_challenge_attempts`

Une ligne représente l'unique participation d'un utilisateur.

Champs principaux :

- `id uuid primary key` ;
- `challenge_id uuid not null` ;
- `user_id uuid not null` ;
- `is_premium boolean not null` fixé par le serveur au démarrage ;
- `started_at timestamptz not null` ;
- `completed_at timestamptz` ;
- `current_position smallint not null default 1` ;
- `correct_answers integer` ;
- `duration_ms bigint` ;
- `xp_delta integer` ;
- unicité `(challenge_id, user_id)`.

Pour un utilisateur gratuit, `correct_answers`, `duration_ms` et `xp_delta` restent à `null`. Le serveur peut utiliser les réponses pendant la session pour fournir les corrections immédiates, mais ne conserve pas le résultat final ni l'historique des réponses.

### `daily_attempt_steps`

Cette table conserve la progression nécessaire à la validation séquentielle et à la reprise d'une tentative commencée.

Champs principaux :

- `attempt_id uuid not null` ;
- `position smallint not null` ;
- `is_correct boolean not null` ;
- `answered_at timestamptz not null` ;
- clé primaire `(attempt_id, position)`.

Elle ne conserve pas la réponse choisie ni la correction détaillée. Pour un utilisateur gratuit, toutes les lignes sont supprimées dans la transaction qui termine la tentative. Pour un utilisateur Premium, les booléens de réussite sont conservés avec la tentative afin d'alimenter les statistiques personnelles, sans être exposés publiquement.

## API serveur

### Charger le défi du jour

Une RPC authentifiée retourne ou crée paresseusement le défi du jour.

La création :

1. calcule la date `Europe/Paris` ;
2. prend un verrou transactionnel lié à cette date ;
3. sélectionne la prochaine catégorie officielle éligible dans la rotation ;
4. sélectionne 10 indices illustrés de manière déterministe ;
5. insère le défi et ses éléments ;
6. retourne uniquement les métadonnées publiques nécessaires à l'écran de préparation.

Deux appels concurrents doivent produire une seule ligne de défi et le même ensemble d'indices.

### Démarrer ou reprendre

Une RPC authentifiée démarre la tentative du jour ou retourne la tentative inachevée existante.

- Si aucune tentative n'existe, elle crée la ligne avec l'état Premium calculé côté serveur.
- Si une tentative inachevée existe, elle retourne sa progression et les questions encore nécessaires.
- Si la tentative est terminée, elle refuse un nouveau lancement avec un code métier stable.
- La RPC ne fait confiance ni au statut Premium, ni à la catégorie, ni à la date envoyés par le client.

### Valider une réponse

Une RPC authentifiée valide une réponse pour la position courante.

- Elle vérifie la propriété de la tentative et son état.
- Elle refuse les positions sautées ou rejouées.
- Elle compare la réponse à la localisation réelle de l'indice.
- Elle retourne la correction nécessaire à l'interface après validation.
- Elle enregistre temporairement la position et le booléen `is_correct` afin de permettre une reprise fiable.
- Pour un compte gratuit, ces étapes sont supprimées à la fin du défi et ne constituent pas un historique persistant.

### Terminer la tentative

À la dixième réponse, le serveur termine la tentative.

Pour un utilisateur Premium :

- il calcule le score et le chrono côté serveur ;
- il applique la formule XP classée existante ;
- il ajoute un bonus de complétion quotidien de `+10 XP` ;
- il alimente le classement quotidien ;
- il retourne le total XP et le rang mis à jour.

Pour un utilisateur gratuit :

- il marque seulement la tentative comme terminée ;
- il ne persiste ni score, ni chrono, ni réponses, ni XP ;
- il retourne le résultat courant à l'interface pour affichage immédiat.

## Expérience utilisateur

### Carte du défi

La page `/training` affiche une carte dédiée lorsque le défi existe :

- date et catégorie du jour ;
- `10 questions` ;
- mode `Pays` ;
- compte à rebours jusqu'à minuit heure de Paris ;
- état `Disponible`, `En cours` ou `Terminé` ;
- bouton `Lancer le défi` ou `Reprendre le défi`.

Une tentative terminée ne présente plus de bouton de lancement.

### Pendant le défi

- La carte et la photo conservent la disposition du quiz actuel.
- La catégorie et le nom de l'indice ne révèlent jamais la réponse.
- Les couleurs de difficulté sont masquées avant validation.
- Une correction verte ou rouge apparaît après chaque réponse selon les règles actuelles.

### Fin Premium

La fin du défi affiche :

- score sur 10 ;
- chrono total ;
- XP de performance ;
- bonus quotidien `+10 XP` ;
- XP total, badge de rang et progression vers le prochain rang ;
- lien vers le classement du jour.

### Fin gratuite

Le résultat courant reste visible, puis un pop-up explique concrètement l'offre Premium :

- sauvegarde du résultat ;
- classement quotidien ;
- XP et système de rangs ;
- historique et statistiques Premium disponibles ;
- futur coach IA présenté comme une évolution, sans le vendre comme déjà disponible.

Actions :

- bouton principal `Passer Premium - 1,99 EUR / mois` vers `/pricing` ;
- bouton secondaire `Continuer gratuitement` qui ferme le pop-up ;
- fermer le pop-up ne masque pas le résultat du défi.

Le pop-up apparaît uniquement après la fin d'un défi gratuit.

## Classement quotidien

- Seules les tentatives Premium terminées apparaissent.
- Le classement utilise le score décroissant, puis le chrono total croissant.
- Une seule ligne existe par utilisateur grâce à la tentative unique.
- Les données publiques restent limitées au pseudo, avatar, score, chrono, rang et XP utile à l'affichage du badge.
- Les emails et réponses individuelles ne sont jamais exposés.

## Sécurité

- RLS est activée sur les nouvelles tables exposées.
- Les utilisateurs ne lisent que leur tentative.
- Les étapes temporaires ne sont accessibles qu'à travers les RPC de validation et de reprise.
- Les éléments du défi ne doivent pas exposer la correction avant validation.
- Les RPC privilégiées vérifient systématiquement `auth.uid()` et révoquent l'exécution à `PUBLIC` et `anon`.
- Le statut Premium provient de la fonction serveur existante, jamais du navigateur ou de `user_metadata`.
- Les fonctions `SECURITY DEFINER` utilisent un `search_path` vide, qualifient tous les objets et accordent explicitement l'exécution à `authenticated` uniquement.
- Les contraintes uniques constituent la protection finale contre les courses concurrentes.

## Gestion des erreurs

- Double lancement : retourner la tentative existante ou un code `daily_attempt_already_completed`.
- Changement de journée pendant une tentative : la tentative commencée reste rattachée à son défi et peut être terminée ; le nouveau défi n'est disponible qu'après sa fin.
- Indice retiré après génération : le défi conserve la référence mais la validation détecte l'indisponibilité et renvoie une erreur récupérable ; l'administration doit éviter la suppression physique des indices officiels utilisés.
- Absence de catégorie éligible : ne pas exposer de défi et journaliser l'événement.
- Erreur de synchronisation finale : conserver l'écran de résultat en mémoire et proposer `Réessayer la synchronisation`, sans autoriser une nouvelle tentative.

## Tests

### Base de données

- deux créations concurrentes produisent un défi unique ;
- la rotation ignore les catégories ayant moins de 10 indices illustrés ;
- les 10 indices sont uniques, ordonnés et identiques pour tous ;
- une seconde tentative est refusée ;
- une tentative inachevée est reprise ;
- un compte gratuit ne conserve aucun résultat ;
- les étapes temporaires d'un compte gratuit sont purgées à la terminaison ;
- un compte Premium reçoit la formule XP existante plus `+10 XP` ;
- seuls les Premium terminés apparaissent dans le classement ;
- les réponses ne sont pas lisibles avant validation ;
- le changement de date respecte `Europe/Paris` autour des changements d'heure.

### React

- carte Disponible, En cours et Terminé ;
- lancement et reprise ;
- absence de second bouton après terminaison ;
- fin Premium avec XP, rang et classement ;
- fin gratuite avec pop-up Premium ;
- fermeture du pop-up sans perte du résultat ;
- masquage complet de la carte lorsqu'aucun défi n'est exposé ;
- rendu mobile du défi et du pop-up.

## Migration depuis la V1

Les colonnes `challenge_type` et `challenge_key` des sessions existantes restent compatibles pour l'historique et le classement actuel. Les nouveaux défis utilisent les nouvelles tables et RPC. Les anciennes sessions quotidiennes ne sont pas converties en tentatives uniques ; elles restent consultables dans les statistiques existantes.

Une fois le nouveau flux actif, le tirage client dans `TrainingPage` est supprimé afin qu'il n'existe qu'une seule source de vérité.

## Critères d'acceptation

- tous les joueurs voient les mêmes 10 questions dans le même ordre ;
- le défi change à minuit heure de Paris ;
- seules les catégories officielles comportant au moins 10 indices illustrés participent à la rotation ;
- aucun utilisateur ne peut démarrer deux tentatives le même jour ;
- une tentative inachevée peut être reprise ;
- les comptes gratuits ne persistent aucun résultat ni XP ;
- les comptes Premium obtiennent score, chrono, classement, XP et bonus `+10 XP` ;
- le pop-up Premium apparaît uniquement après un défi gratuit ;
- le navigateur ne décide ni des questions, ni de la correction, ni du statut Premium.
