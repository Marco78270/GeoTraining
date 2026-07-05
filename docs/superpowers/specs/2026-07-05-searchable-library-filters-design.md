# Filtres saisissables de la bibliothèque d'indices

## Objectif

Permettre de rechercher pendant la saisie dans les filtres Catégorie, Pays et Statut de la bibliothèque d'indices, tout en conservant l'accès à la liste complète et le comportement actuel de filtrage.

## Interface

Un composant `SearchableFilter` remplace chacun des trois éléments `select` dans `CategoryList`.

- Le champ affiche la valeur sélectionnée ou le libellé générique correspondant.
- Un clic sur le champ ou la flèche ouvre toutes les options disponibles.
- Chaque caractère saisi réduit immédiatement les suggestions et actualise la grille après un délai de 250 ms.
- La recherche ignore la casse et les accents.
- Une action d'effacement remet le filtre à sa valeur « Tous ».
- Les touches Flèche haut/bas, Entrée, Échap et Tab sont prises en charge.
- Sur mobile, la liste reste contenue dans la largeur du champ et possède une hauteur maximale défilable.

Le champ existant de recherche par titre conserve son fonctionnement et adopte le même délai de 250 ms afin que les quatre filtres réagissent de manière cohérente.

## Données et filtrage

Les textes saisis sont conservés séparément des valeurs sélectionnées. Les options correspondantes sont résolues localement à partir des métadonnées déjà chargées : identifiants de catégories, codes pays et statuts.

La requête de bibliothèque accepte plusieurs valeurs correspondantes pour chaque filtre. Une saisie vide signifie « toutes les valeurs ». Une saisie sans correspondance produit une grille vide sans envoyer une requête ambiguë.

La pagination revient à la page 1 après chaque modification de filtre. Les requêtes sont temporisées et React Query conserve la dernière réponse pendant le chargement suivant afin de limiter les clignotements.

## Accessibilité

Le composant suit le modèle ARIA combobox/listbox : libellé associé, état ouvert, option active et annonce du nombre de résultats. La sélection à la souris, au tactile et au clavier produit le même état.

## Tests

- Filtrage des suggestions pendant la saisie pour catégorie, pays et statut.
- Recherche insensible à la casse et aux accents.
- Actualisation temporisée de la grille avec les valeurs correspondantes.
- Sélection, effacement et fermeture au clavier.
- Réinitialisation de la pagination.
- Absence de requête ambiguë lorsqu'aucune option ne correspond.
- Conservation du rendu responsive existant.
