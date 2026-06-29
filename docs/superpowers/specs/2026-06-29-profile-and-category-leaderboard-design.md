# Profil utilisateur et classement par categorie

Date : 2026-06-29

## Objectif

Ajouter deux modules lies :

- une page Profil permettant a chaque utilisateur de gerer son identite publique, son avatar et son adresse email ;
- une page Classement comparant les utilisateurs par categorie officielle selon leur precision moyenne, avec le temps moyen par question comme critere de departage.

Le classement doit rester communautaire et lisible. Il ne vise pas, dans cette premiere version, un niveau de protection adapte a une competition avec recompenses.

## Decisions validees

- le classement est separe par categorie ;
- le score principal est le pourcentage moyen de bonnes reponses ;
- le chrono sert uniquement a departager les joueurs ayant le meme pourcentage ;
- la moyenne utilise les 10 derniers quiz termines dans la categorie ;
- un utilisateur doit terminer au moins 3 quiz dans une categorie pour apparaitre ;
- avant ce seuil, son espace personnel indique le nombre de quiz restant a terminer ;
- seuls les quiz de la Collection officielle comptent ;
- le chrono mesure toute la session, sans limite de temps ;
- le nom d'utilisateur est unique et modifiable une fois tous les 30 jours ;
- la participation au classement est activee par defaut, avec une option pour masquer son profil.

## Perimetre

### Inclus

- route protegee `/profile` ;
- route protegee `/leaderboard` ;
- acces au Profil depuis le menu du compte ;
- acces au Classement depuis le bandeau principal ;
- modification du nom d'utilisateur ;
- import, apercu, remplacement et suppression de l'avatar ;
- demande de changement d'adresse email via Supabase Auth ;
- preference de visibilite dans le classement ;
- chrono visible pendant les quiz eligibles ;
- classement par categorie officielle ;
- progression personnelle avant les 3 quiz requis ;
- calcul sur les 10 derniers quiz eligibles ;
- affichage responsive sur ordinateur et mobile ;
- migrations, politiques RLS, fonctions SQL et tests associes.

### Hors perimetre

- recompenses, saisons, badges ou niveaux ;
- classement global melangeant plusieurs categories ;
- classement des collections privees ou publiques non officielles ;
- mode tournoi avec une liste de questions identique pour tous ;
- prevention absolue de la triche ;
- messagerie entre joueurs ;
- suppression complete du compte.

## Etat actuel

Le projet dispose deja de la plupart des fondations :

- `public.profiles` contient `display_name`, `avatar_url` et un email miroir utilise par l'administration ;
- `training_sessions` contient la categorie, le nombre de questions, les scores, `started_at` et `completed_at` ;
- `training_answers` conserve les reponses individuelles ;
- les statistiques personnelles lisent deja les sessions de l'utilisateur ;
- le menu de profil n'expose actuellement que l'administration et la deconnexion.

Le trigger Auth actuel met a jour simultanement l'email, `display_name` et `avatar_url` lors d'une modification d'email ou des metadonnees Auth. Il devra etre ajuste afin qu'un changement d'email ne puisse pas ecraser un nom ou un avatar modifies depuis la page Profil.

Les donnees de session sont aujourd'hui privees par RLS. Le classement devra donc exposer uniquement un resultat agrege et les champs publics du profil, sans ouvrir la lecture des sessions ni des emails.

## Approche retenue

Utiliser Supabase comme source de verite pour le profil, le chrono et le classement.

- React gere les formulaires, l'affichage du chrono et les etats d'interface.
- Supabase Auth reste la source de verite de l'adresse email.
- Postgres applique l'unicite et la frequence de modification du nom d'utilisateur.
- Supabase Storage conserve les avatars.
- Postgres calcule le classement depuis les sessions terminees et eligibles.
- Des fonctions RPC etroites renvoient seulement les donnees necessaires a la page Classement.

Cette approche evite un classement calcule et falsifiable uniquement dans le navigateur, tout en restant moins complexe qu'un moteur de competition complet.

## Modele de donnees

### Profils

Conserver `public.profiles` comme table principale et faire de `display_name` le nom d'utilisateur affiche dans l'application.

Ajouter :

- `username_changed_at timestamptz null` ;
- `leaderboard_visible boolean not null default true`.

Renforcer `display_name` :

- longueur comprise entre 3 et 30 caracteres apres suppression des espaces exterieurs ;
- valeur non vide ;
- unicite insensible a la casse avec un index sur `lower(display_name)`.

La migration doit attribuer un nom unique aux profils existants avant d'ajouter l'index. Elle utilise en priorite le nom existant, puis la partie locale de l'email, avec un suffixe numerique en cas de collision.

Le changement de nom met `username_changed_at` a l'heure serveur. Un trigger refuse une nouvelle modification avant 30 jours. La creation initiale ou la normalisation realisee par migration ne doit pas bloquer le premier changement volontaire.

### Collection officielle

Ajouter a `public.collections` :

- `is_official boolean not null default false`.

Une contrainte ou un index partiel garantit qu'une seule collection peut porter `is_official = true`. La migration marque la collection commune existante `Collection officielle`.

Le classement ne se base jamais sur le nom de la collection pour determiner l'eligibilite.

### Sessions classees

Ajouter a `public.training_sessions` :

- `is_ranked boolean not null default false` ;
- `duration_ms bigint null`.

Une session est eligible uniquement si :

- elle appartient a la collection marquee officielle ;
- elle cible une categorie precise ;
- elle a ete creee par le nouveau flux chronometre ;
- elle est terminee ;
- elle contient au moins une reponse ;
- `duration_ms` est strictement positif.

Les anciennes sessions restent visibles dans les statistiques personnelles mais ne sont pas retroactivement classees, car leur chrono n'a pas ete garanti par le serveur.

## Gestion du profil

### Nom d'utilisateur

Le formulaire affiche :

- le nom actuel ;
- la prochaine date de modification possible si le delai de 30 jours est actif ;
- une validation immediate de longueur ;
- une erreur explicite en cas de nom deja utilise.

La base reste l'autorite finale pour l'unicite et le delai.

### Avatar

Creer un bucket Storage `avatars` destine aux avatars publics.

Regles :

- lecture publique de l'image uniquement ;
- ecriture et suppression reservees au proprietaire du chemin ;
- chemin commencant par l'identifiant de l'utilisateur ;
- formats JPEG, PNG et WebP ;
- taille source maximale de 5 Mo ;
- redimensionnement cote client vers une image carree WebP de 512 px afin de limiter le stockage et le trafic.

Le remplacement charge d'abord la nouvelle image, met ensuite le profil a jour, puis supprime l'ancien objet. En cas d'echec de mise a jour, la nouvelle image est nettoyee autant que possible.

### Adresse email

Le formulaire utilise `supabase.auth.updateUser({ email })`.

Comportement :

- afficher que la modification necessite une confirmation ;
- ne jamais considerer le nouvel email comme actif avant le retour de Supabase Auth ;
- conserver `auth.users.email` comme source de verite ;
- synchroniser le champ miroir `profiles.email` par un trigger Auth limite a l'email ;
- conserver l'initialisation du nom et de l'avatar lors de la creation du compte, sans les reecrire lors d'un simple changement d'email ;
- ne jamais retourner l'email dans les API publiques du classement.

### Visibilite

La participation est activee par defaut.

Lorsque `leaderboard_visible` vaut `false` :

- l'utilisateur disparait de tous les classements publics ;
- ses sessions et statistiques personnelles sont conservees ;
- son bloc personnel affiche toujours sa progression et ses resultats ;
- une reactivation le replace au classement lors du prochain chargement.

## Chronometre

Le navigateur affiche un chrono fluide, mais la valeur classee est calculee par le serveur.

Flux :

1. la creation de session enregistre `started_at` avec l'heure Postgres ;
2. le chrono s'affiche lorsque la premiere question est disponible ;
3. changer d'onglet, verrouiller le telephone ou perdre temporairement le focus ne met pas le chrono en pause ;
4. la derniere reponse declenche la finalisation ;
5. une fonction RPC fixe `completed_at = now()` et calcule `duration_ms` ;
6. une session abandonnee ou non finalisee ne compte pas.

Le temps moyen utilise pour le classement est :

`somme(duration_ms) / somme(total_answers)`

Cette normalisation permet de comparer des quiz contenant des nombres de questions differents.

## Calcul du classement

### Selection des sessions

Pour chaque couple utilisateur/categorie :

1. selectionner les sessions eligibles terminees ;
2. les trier par date de fin decroissante ;
3. conserver les 10 plus recentes ;
4. compter le nombre de sessions retenues ;
5. classer l'utilisateur seulement si ce nombre est au moins egal a 3.

### Metriques

Le pourcentage moyen est pondere par le nombre de questions :

`100 * somme(correct_answers) / somme(total_answers)`

Ordre du classement :

1. pourcentage moyen decroissant ;
2. temps moyen par question croissant ;
3. nombre de quiz retenus decroissant ;
4. nom d'utilisateur croissant pour garantir un ordre stable.

### Progression avant classement

Pour un utilisateur ayant moins de 3 quiz eligibles, afficher :

- `Encore 3 quiz a terminer pour apparaitre dans ce classement` ;
- `Encore 2 quiz...` ;
- `Encore 1 quiz...`.

Son pourcentage provisoire et son temps moyen peuvent etre affiches comme informations personnelles, mais sans rang public.

## Acces aux donnees et securite

### Principe

Ne pas elargir la politique SELECT de `profiles`, car cette table contient aussi l'email miroir. Ne pas ouvrir non plus la lecture des `training_sessions` des autres utilisateurs.

### RPC de classement

Ajouter des fonctions RPC retournant des colonnes explicites :

- liste des categories officielles disponibles pour le classement ;
- classement pagine d'une categorie ;
- progression personnelle de l'utilisateur courant dans une categorie.

Le resultat public d'un joueur contient uniquement :

- identifiant utilisateur ;
- nom d'utilisateur ;
- URL d'avatar ;
- rang ;
- pourcentage ;
- temps moyen par question ;
- nombre de quiz retenus.

Si une fonction `security definer` est necessaire pour agreger les sessions privees :

- definir un `search_path` vide ;
- qualifier tous les objets avec leur schema ;
- revoquer `EXECUTE` a `PUBLIC` et `anon` ;
- accorder uniquement a `authenticated` ;
- verifier explicitement qu'un utilisateur est authentifie ;
- ne retourner aucun email, reponse individuelle ou identifiant d'indice.

### Finalisation classee

La finalisation d'une session classee doit passer par une RPC etroite qui :

- verifie que `auth.uid()` possede la session ;
- refuse une session deja terminee ;
- verifie que la collection et la categorie sont eligibles ;
- calcule les totaux a partir des reponses en base ;
- fixe l'heure de fin et la duree avec l'heure serveur.

Les politiques et privileges doivent empecher le client de modifier directement les champs classes d'une session terminee.

Cette protection limite les manipulations triviales. Elle ne pretend pas empecher un utilisateur technique de consulter les donnees d'indice ou d'automatiser des reponses ; cela relevera d'un futur mode competition.

## Interfaces

### Page Profil

La page reprend le meme bandeau et la meme structure visuelle que les autres modules.

Sections :

- carte d'identite avec avatar et nom ;
- formulaire Nom d'utilisateur ;
- formulaire Adresse email ;
- preference `Apparaitre dans les classements` ;
- informations de securite et date de prochaine modification du nom.

Le menu de compte affiche un lien `Mon profil` pour tous les utilisateurs.

### Page Classement

Le bandeau principal ajoute l'entree `Classement` avec une icone de trophee.

Contenu :

- selecteur de categorie officielle ;
- carte personnelle avec rang ou progression vers les 3 quiz ;
- podium des trois premiers sur ordinateur ;
- tableau pagine du classement ;
- colonnes Rang, Joueur, Precision, Temps/question et Quiz ;
- mise en evidence de la ligne de l'utilisateur courant ;
- etat vide lorsqu'une categorie n'a pas encore trois participants eligibles.

Sur mobile, le podium devient une liste compacte et le tableau utilise des cartes verticales sans defilement horizontal obligatoire.

### Training

Pendant un quiz classe :

- le chrono apparait dans le panneau de question sur ordinateur ;
- il reste compact et visible pres de la progression sur mobile ;
- l'ecran final affiche la duree totale et le temps moyen par question ;
- un lien permet d'ouvrir le classement de la categorie jouee.

Un quiz sans categorie precise, sur une collection non officielle ou abandonne reste un entrainement personnel non classe.

## Gestion des erreurs

- nom deja utilise : message pres du champ, sans perdre la saisie ;
- delai de 30 jours : afficher la date autorisee fournie par le serveur ;
- avatar invalide : expliquer le format ou la taille refusee ;
- echec Storage : conserver l'ancien avatar ;
- email en attente : afficher un etat persistant jusqu'a actualisation de la session ;
- finalisation du quiz impossible : conserver le resultat local a l'ecran, proposer une nouvelle tentative de synchronisation et ne pas publier de classement incomplet ;
- classement indisponible : afficher une erreur non bloquante avec bouton Reessayer.

## Performance

Ajouter les index necessaires au calcul des 10 dernieres sessions :

- index partiel sur `(category_id, user_id, completed_at desc)` pour les sessions classees terminees ;
- index sur `collections(is_official)` ou index unique partiel ;
- index unique sur `lower(profiles.display_name)`.

La RPC de classement est paginee. Une table de scores materialisee n'est pas necessaire pour la premiere version. Elle pourra etre ajoutee si le volume de sessions rend l'agregation dynamique trop couteuse.

## Tests

### Base de donnees

- normalisation et unicite des noms existants ;
- refus d'un nom deja utilise sans tenir compte de la casse ;
- refus d'un second changement avant 30 jours ;
- modification autorisee apres 30 jours ;
- politiques du bucket avatars ;
- impossibilite de modifier l'avatar d'un autre utilisateur ;
- seule la collection officielle produit des sessions classees ;
- finalisation avec heure et duree serveur ;
- refus de finaliser la session d'un autre utilisateur ;
- selection correcte des 10 dernieres sessions ;
- seuil de 3 quiz ;
- exclusion des profils masques ;
- ordre score puis temps ;
- absence d'email et de reponses detaillees dans les resultats RPC.

### Frontend

- chargement et modification du profil ;
- etat verrouille du nom d'utilisateur ;
- import, remplacement et erreur d'avatar ;
- demande de changement d'email ;
- absence de regression du nom et de l'avatar apres un changement d'email ;
- activation et desactivation du classement ;
- affichage du chrono pendant le quiz ;
- fin de session et duree ;
- progression a 0, 1 et 2 quiz ;
- classement a partir de 3 quiz ;
- filtres par categorie ;
- rendu mobile du profil et du classement ;
- non-regression des statistiques et quiz existants.

## Deploiement

1. creer une migration avec la CLI Supabase ;
2. ajouter les colonnes, contraintes, index, bucket et politiques ;
3. ajouter les fonctions de finalisation et de classement ;
4. regenerer les types TypeScript ;
5. implementer l'API et la page Profil ;
6. integrer le chrono serveur au Training ;
7. implementer l'API et la page Classement ;
8. ajouter les liens de navigation ;
9. executer les tests frontend et SQL ;
10. appliquer la migration sur Supabase de production ;
11. reconstruire les conteneurs Docker et verifier les routes.

## Criteres d'acceptation

- un utilisateur peut changer son avatar, son email et son nom depuis `/profile` ;
- deux utilisateurs ne peuvent pas partager le meme nom, meme avec une casse differente ;
- un nom ne peut pas etre modifie deux fois en moins de 30 jours ;
- aucun email n'apparait dans le classement ;
- seuls les quiz termines de la Collection officielle avec une categorie precise comptent ;
- le classement utilise au maximum les 10 derniers quiz par categorie ;
- moins de 3 quiz affiche le nombre restant sans publier de rang ;
- a partir de 3 quiz, le joueur est classe par pourcentage puis par temps moyen par question ;
- masquer son profil le retire du classement sans supprimer ses statistiques ;
- le chrono continue lorsque l'onglet perd le focus ;
- le profil et le classement sont utilisables sur ordinateur et smartphone.

## Evolution ulterieure

Si un classement plus competitif devient necessaire, la prochaine etape sera un mode Challenge dans lequel le serveur choisit la serie de questions, signe la session et valide chaque reponse sans exposer a l'avance la correction. Cette evolution pourra reutiliser le profil public, le chrono et l'interface de classement definis ici.
