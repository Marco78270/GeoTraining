## XP global, rangs et badge premium

Date: 2026-07-02

## Objectif

Ajouter une couche de progression "gaming" a GeoTrainer Atlas avec:

- un systeme d'XP global unique par utilisateur ;
- des rangs publics derives de seuils d'XP ;
- des gains et pertes d'XP sur les quiz classes uniquement ;
- un badge premium distinct du rang ;
- un affichage prioritaire sur le profil, le menu compte et le classement.

Le systeme doit renforcer l'engagement sans permettre de farm sur des collections privees ou non officielles.

## Decisions validees

- l'XP est globale au compte, pas par categorie ;
- les quiz classes restent limites aux collections publiques/officielles ;
- l'XP n'est attribuee que sur ces quiz classes ;
- une bonne reponse donne de l'XP, une erreur en retire ;
- la montee et la descente de rang sont toutes les deux autorisees ;
- l'XP ne descend jamais sous 0 ;
- le feedback XP est visible apres chaque reponse ;
- le calcul officiel reste valide cote serveur a la fin du quiz ;
- les rangs reposent sur des seuils globaux d'XP ;
- le systeme utilise 6 ligues principales avec 3 sous-rangs chacune ;
- les seuils V1 sont estimes manuellement puis reequilibrables plus tard ;
- la difficulte de l'indice module le gain et la perte ;
- en facile: gain plus faible, perte plus forte ;
- en expert: gain plus fort, perte plus faible ;
- le rang s'affiche sur le profil, dans le menu compte et sur le classement ;
- le badge premium est distinct visuellement du rang XP.

## Perimetre

### Inclus

- progression XP globale sur quiz classes ;
- rang derive de l'XP globale ;
- historique des deltas XP par quiz classe ;
- affichage du rang, de l'XP et de la progression sur le profil ;
- affichage compact du rang dans le menu compte ;
- affichage du rang sur la page Classement ;
- badge premium visuel sur le profil ;
- retour de fin de quiz avec XP finale, delta officiel et changement de rang ;
- migrations, fonctions SQL/RPC et tests associes.

Note: l'historique XP est inclus cote donnees et audit. Son affichage detaille dans l'UI du profil peut rester hors de la premiere livraison visuelle.

### Hors perimetre

- XP par categorie ;
- saisons ou reset periodique ;
- badges de collection ou de categorie ;
- recompenses cosmiques type coffre, loot ou monnaie virtuelle ;
- matchmaking ;
- achat de boosts XP ;
- badge premium "founder" ou variantes temporelles ;
- classement principal trie par XP.

## Etat actuel

Le produit dispose deja de plusieurs briques reutilisables:

- les quiz classes existent deja via les collections officielles et les sessions rankees ;
- la page Profil expose les informations du compte et l'etat premium ;
- la page Classement affiche deja les performances officielles par categorie ;
- le menu compte sait lire le profil en cache ;
- la facturation premium est separee et accessible via l'etat billing.

Aujourd'hui, aucune notion d'XP globale ou de rang n'existe en base. Le badge premium est seulement exprime par des badges textuels simples. Les quiz classes enregistrent deja les sessions et les reponses, ce qui fournit le point d'ancrage ideal pour appliquer un delta XP officiel a la fin du quiz.

## Approche retenue

Utiliser un modele hybride:

- le frontend affiche un delta XP estime apres chaque reponse pour donner du ressenti ;
- le backend Supabase recalcule integralement le delta XP reel a la fin du quiz classe ;
- le backend met a jour l'XP globale de l'utilisateur de facon transactionnelle ;
- le rang visible est derive de l'XP globale, jamais dicte par le client.

Cette approche garde une experience vivante cote joueur, tout en preservant l'integrite du systeme classe.

## Modele de progression

### XP globale

- chaque utilisateur possede une valeur `xp_total` ;
- `xp_total` commence a `0` ;
- `xp_total` ne peut jamais passer sous `0` ;
- seules les sessions eligibles et finalisees peuvent modifier `xp_total`.

### Eligibilite XP

Une session peut modifier l'XP uniquement si:

- elle est classee ;
- elle appartient a une collection publique/officielle ;
- elle est terminee ;
- elle contient au moins une reponse ;
- le serveur la finalise via le flux officiel.

Les quiz prives, brouillons ou non officiels n'ont aucun impact sur l'XP.

### Rangs

Le systeme utilise 6 ligues:

- Bronze
- Argent
- Or
- Diamant
- Master
- Grand Master

Chaque ligue contient 3 sous-rangs:

- III
- II
- I

Le rang est determine uniquement par des seuils globaux d'XP. Exemple de principe:

- 0 XP = Bronze III
- seuil suivant = Bronze II
- seuil suivant = Bronze I
- etc.

Les seuils V1 seront fixes dans une table ou une constante serveur facile a ajuster plus tard.

### Montee et descente

- si l'XP franchit un seuil superieur, le joueur monte ;
- si l'XP repasse sous un seuil inferieur, le joueur redescend ;
- il n'existe pas de protection anti-chute en V1 ;
- le plancher absolu reste Bronze III a 0 XP.

## Economie XP

### Principe general

Chaque reponse d'un quiz classe produit un delta XP:

- bonne reponse -> gain ;
- mauvaise reponse -> perte.

La difficulte de l'indice module ce delta.

### Regles V1 de difficulty shaping

Le systeme doit respecter ces proprietes:

- Facile:
  - gain plus faible
  - perte plus forte
- Moyen:
  - comportement intermediaire et stable
- Expert:
  - gain plus fort
  - perte plus faible

Les valeurs numeriques exactes restent parametrables. La V1 doit utiliser une grille simple, lisible et centralisee cote serveur.

### Validation serveur

Le client peut afficher un delta estime apres chaque reponse, mais:

- le serveur rederive les difficultees et les reponses finales ;
- le serveur recalcule le delta XP total du quiz ;
- le serveur applique ce delta a `xp_total` ;
- le serveur journalise l'operation.

Ainsi, le client ne peut ni gonfler artificiellement les gains, ni diminuer les pertes.

## Modele de donnees

### Profil

Ajouter a `public.profiles`:

- `xp_total bigint not null default 0`

Le rang ne doit pas etre stocke comme une verite independante si on peut le reconstituer de facon deterministe depuis `xp_total`. La V1 prefere un calcul derive pour eviter les desynchronisations.

### Historique XP

Creer une table dediee, par exemple `public.xp_events`, contenant au minimum:

- `id`
- `user_id`
- `training_session_id`
- `total_delta`
- `correct_count`
- `wrong_count`
- `before_xp`
- `after_xp`
- `created_at`

Cette table permet:

- d'auditer les changements ;
- d'afficher plus tard un historique sur le profil ;
- de recalculer ou verifier le systeme si la grille XP evolue.

Une contrainte d'unicite sur `training_session_id` evite de crediter deux fois la meme session.

## Calcul du rang

Le systeme de rang doit etre centralise dans un module partage, utilise par:

- le backend pour retourner le rang actuel ;
- le frontend pour afficher le nom du rang ;
- les tests pour verifier les seuils.

Ce module doit exposer:

- la liste ordonnee des paliers ;
- la resolution `xp -> rang` ;
- la resolution `xp -> progression vers le prochain palier`.

## UX

### Profil

Le profil devient la page de reference pour la progression du joueur:

- XP totale ;
- rang courant ;
- barre ou bloc de progression vers le prochain rang ;
- badge premium visuel separe ;
- rappel du statut premium.

Le badge premium ne doit pas ressembler au badge de rang pour eviter toute confusion entre progression de jeu et abonnement.

### Menu compte

Le menu compte affiche une version compacte:

- rang courant ;
- XP totale ou libelle court ;
- badge premium eventuel si utile visuellement.

L'objectif est de donner un retour rapide sans surcharger le popover.

### Classement

Le classement conserve son role actuel:

- tri principal par performance ;
- le rang XP s'affiche a cote du joueur comme information d'identite/progression ;
- le leaderboard n'est pas trie par XP.

Cela separe clairement:

- la performance competitive (classement) ;
- la progression globale (rang XP).

### Fin de quiz classe

L'ecran de fin de quiz classe doit pouvoir montrer:

- le delta XP officiel ;
- l'XP totale apres application ;
- un message de montee ou de descente de rang si necessaire.

Pendant le quiz, le feedback par reponse reste indicatif. Le recapitulatif de fin reste la source officielle.

## Badge premium

Le badge premium V1 doit:

- etre visible sur le profil ;
- avoir un style visuel distinct du rang ;
- etre derive de `billing.premiumEnabled` ;
- ne pas dependre de l'XP.

La V1 peut rester simple:

- icone dediee ;
- couleur premium specifique ;
- libelle "Premium".

Des variantes plus exclusives pourront venir plus tard sans casser le modele.

## API et securite

Le calcul XP doit rester cote serveur.

Le flux recommande:

1. finalisation du quiz classe ;
2. chargement des reponses et des difficultes officielles ;
3. calcul du delta XP serveur ;
4. insertion d'un `xp_event` ;
5. mise a jour de `profiles.xp_total` ;
6. retour au client avec:
   - `xpDelta`
   - `xpTotal`
   - `rankBefore`
   - `rankAfter`

Le tout doit etre transactionnel pour eviter:

- double attribution ;
- profil mis a jour sans historique ;
- historique cree sans mise a jour de profil.

## Tests

### Backend

- XP refusee pour quiz non officiel ;
- XP refusee pour session non classee ;
- impossibilite de doubler un credit XP sur la meme session ;
- plancher XP a 0 ;
- montee de rang quand un seuil est franchi ;
- descente de rang quand l'XP repasse sous un seuil ;
- calcul correct des deltas par difficulte.

### Frontend

- affichage du rang sur le profil ;
- affichage du badge premium sur le profil ;
- affichage du rang dans le menu compte ;
- affichage du rang sur le leaderboard ;
- message de fin de quiz avec delta XP officiel ;
- distinction claire entre rang et premium.

## Decoupage recommande

1. ajouter le modele de donnees XP et les fonctions serveur ;
2. brancher le calcul XP a la finalisation des quiz classes ;
3. afficher XP/rang sur le profil ;
4. afficher le rang dans le menu compte ;
5. afficher le rang sur le classement ;
6. ajouter le badge premium visuel sur le profil ;
7. ajouter plus tard un historique XP detaille dans l'interface du profil si on veut enrichir la lecture joueur.

## Risques et arbitrages

- si la grille XP V1 est trop punitive, la descente de rang peut frustrer ;
- si elle est trop genereuse, la progression perdra en valeur ;
- stocker seulement `xp_total` et non le rang limite les incoherences ;
- limiter l'XP aux quiz classes officiels protege bien mieux le systeme contre le farm.

Le principal arbitrage V1 est de privilegier l'integrite et la clarte plutot qu'un systeme ultra-complexe.
