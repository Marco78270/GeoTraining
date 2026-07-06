# Defi quotidien global et classement unifie

Date : 2026-07-06

## Objectif

Faire du defi quotidien le seul mode competitif de GeoTrainer Atlas : dix questions identiques pour tous, melangeant les categories officielles, avec un classement du jour et un classement general cumule. Les entrainements officiels restent disponibles pour progresser en XP sans alimenter un classement par categorie.

## Decisions validees

- Le classement par categorie disparait de l'interface.
- Les entrainements sur les collections officielles continuent d'attribuer de l'XP.
- Seul le defi quotidien alimente les classements.
- Le defi quotidien contient exactement dix questions issues de plusieurs categories officielles.
- Tous les joueurs recoivent les memes questions, dans le meme ordre, pour une date donnee.
- Une seule tentative quotidienne est autorisee par utilisateur.
- Le classement propose deux vues : aujourd'hui et general cumule.
- Le classement du jour est trie par precision, puis par chrono.
- Le classement general est trie par points cumules.
- Les joueurs gratuits peuvent terminer le defi, mais leur resultat n'est ni classe ni credite en XP.
- Les joueurs premium conservent l'attribution XP serveur existante.

## Architecture retenue

La source de verite competitive est `daily_challenge_attempts`, reliee a `daily_challenges`. Les anciennes sessions `training_sessions` ne doivent plus etre utilisees pour le classement quotidien.

Les fonctions de classement par categorie restent temporairement en base pour compatibilite, mais l'interface ne les appelle plus. Deux fonctions de lecture dediees exposent le classement quotidien :

- classement d'une date precise ;
- classement general cumule par utilisateur.

Le profil et le menu compte chargent leur propre etat via React Query. Ils ne doivent pas dependre exclusivement d'une donnee eventuellement absente du cache.

## Generation du defi

### Contenu eligible

Un indice est eligible lorsqu'il :

- appartient a une collection officielle ;
- est publie ;
- possede au moins une image exploitable ;
- appartient a une categorie officielle active ;
- peut etre joue en mode pays.

### Melange des categories

La selection quotidienne doit couvrir autant de categories officielles distinctes que possible avant de reprendre une seconde question dans une meme categorie.

Pour dix questions :

1. classer les indices de chaque categorie avec un ordre deterministe derive de la date et de l'identifiant de l'indice ;
2. prendre un indice par categorie disponible ;
3. completer les places restantes en tours successifs et equilibres entre categories ;
4. appliquer un ordre final deterministe commun a tous les joueurs.

Une categorie insuffisamment fournie ne rend pas le defi indisponible tant que dix indices eligibles existent au total. Si moins de dix indices eligibles existent, aucune carte de defi indisponible n'est affichee et un autre ensemble eligible doit etre recherche selon les regles existantes.

Le defi reste en mode pays pour cette version. Les regions ne participent pas au daily global.

## Score et classements

### Classement du jour

Seules les tentatives premium terminees et valides sont incluses.

Ordre :

1. nombre de bonnes reponses decroissant ;
2. duree totale croissante ;
3. heure de fin croissante ;
4. identifiant utilisateur pour garantir un ordre stable.

La vue affiche au minimum : position, joueur, score sur dix, precision, chrono, rang XP et XP totale.

### Points journaliers

Chaque tentative premium terminee produit un score de classement general :

- 10 points de participation ;
- 100 points par bonne reponse ;
- bonus chrono compris entre 0 et 90 points.

Le bonus chrono diminue avec la duree totale et atteint zero au-dela du plafond defini cote SQL. Il ne peut jamais compenser une bonne reponse supplementaire.

Le score journalier est calcule cote serveur a partir de la tentative enregistree. Le client ne transmet jamais un nombre de points de confiance.

### Classement general

Le classement general additionne les points journaliers de toutes les tentatives premium terminees.

Ordre :

1. points cumules decroissants ;
2. nombre total de bonnes reponses decroissant ;
3. duree cumulee croissante ;
4. nombre de participations decroissant ;
5. identifiant utilisateur pour garantir un ordre stable.

La vue affiche : position, joueur, points, participations, bonnes reponses, precision globale, rang XP et XP totale.

## XP et premium

Les entrainements classes sur contenu officiel continuent d'utiliser la grille XP existante. Ils n'apparaissent dans aucun classement.

Le daily premium continue de calculer l'XP a partir de la difficulte de chaque indice et du resultat de chaque reponse. Les points de classement daily sont independants de l'XP :

- XP = progression et rang du compte ;
- points daily = performance competitive cumulee.

Une tentative gratuite :

- peut aller jusqu'a l'ecran final ;
- ne cree pas d'evenement XP ;
- n'apparait dans aucun classement ;
- conserve le message premium de fin de defi.

## Interface

### Page Classement

`/leaderboard` devient une page exclusivement daily.

Elle contient :

- un titre unique `Classement du defi quotidien` ;
- deux onglets `Aujourd'hui` et `General` ;
- le podium puis la liste paginee ;
- la position personnelle, meme hors de la page courante ;
- la date du defi pour la vue quotidienne ;
- aucune liste ou selection de categories.

Le lien `Voir le classement` du defi ouvre directement la vue `Aujourd'hui` correspondant au challenge affiche.

### Profil et menu compte

Le profil reste la reference pour l'XP globale et la progression de rang.

Le menu compte doit lancer une vraie requete de profil et de facturation, avec le meme cache React Query que la page profil. En cas de cache vide, il affiche un etat de chargement plutot que `0 XP` et `Gratuit` par defaut.

Apres attribution XP, le resultat serveur met immediatement a jour le cache du profil puis invalide la requete pour confirmation.

## Securite et integrite

- Les calculs de points, XP, precision et chrono restent cote Supabase.
- Les fonctions `security definer` conservent un `search_path` vide et des droits d'execution limites a `authenticated`.
- Les classements n'exposent que les profils avec `leaderboard_visible = true`.
- La progression personnelle reste lisible par son proprietaire meme si son profil est masque du classement public.
- Les tentatives gratuites sont exclues par `is_premium`, pas par une valeur envoyee par le navigateur.
- Les fonctions sont idempotentes et ne recreent aucun evenement XP existant.

## Migration des donnees

Les tentatives securisees deja terminees restent valides. Le classement les lit directement sans copie.

Les XP deja attribues ne sont ni recalcules ni rejoues. Pour `marc.roger@outlook.fr`, les 39 XP presents en base doivent devenir visibles apres correction du chargement profil.

Les anciennes sessions daily de `training_sessions`, si elles existent, ne sont pas fusionnees automatiquement dans le nouveau classement. Une migration historique separee pourra etre envisagee uniquement si des donnees reelles doivent etre recuperees.

## Erreurs et etats vides

- Aucun defi disponible : conserver l'entrainement classique sans afficher une carte daily inutilisable.
- Aucun resultat aujourd'hui : afficher un etat vide explicite.
- Aucun resultat general : afficher un etat vide explicite.
- Echec du classement : afficher une erreur locale sans bloquer les autres pages.
- Echec du profil : ne pas substituer silencieusement `0 XP` ou `Gratuit`.

## Tests

### Supabase

- dix questions exactement ;
- plusieurs categories representees lorsque les donnees le permettent ;
- selection et ordre deterministes pour une date ;
- exclusion des indices sans image et non publies ;
- exclusion des tentatives gratuites des deux classements ;
- ordre quotidien par score puis chrono ;
- calcul journalier des points et impossibilite pour le chrono de compenser une reponse ;
- cumul general exact ;
- position personnelle avec profil masque ;
- absence de double attribution XP.

### Frontend

- page classement sans filtre de categorie ;
- bascule Aujourd'hui / General ;
- lien daily vers la bonne date ;
- affichage des points et statistiques adaptees a chaque vue ;
- menu compte charge les 39 XP reels au lieu d'un cache vide ;
- synchronisation immediate du cache apres attribution XP ;
- etats de chargement, vide et erreur.

## Hors perimetre

- saisons competitives ;
- classement hebdomadaire ou mensuel ;
- matchmaking ;
- ligues separees par pays ou region ;
- recompenses materielles ou monnaie virtuelle ;
- migration automatique d'anciennes sessions daily non securisees.
