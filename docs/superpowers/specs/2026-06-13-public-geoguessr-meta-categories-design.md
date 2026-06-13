# Catégories publiques GeoGuessr supplémentaires

Date : 13 juin 2026

## Objectif

Ajouter à la `Collection officielle` trois catégories publiques :

- `Marquages au sol`
- `Poteaux électriques`
- `Google Car`

Le premier lot vise les pays fréquemment rencontrés dans GeoGuessr. Chaque indice doit posséder une image réelle réutilisable, une difficulté, un pays, des métadonnées de provenance et, lorsque le phénomène est local, une ou plusieurs régions.

Plonk It et MetaGuessr servent de guides de recherche et de recoupement. Leurs textes et images ne sont pas copiés. Les descriptions sont reformulées et les images proviennent de sources dont la licence autorise la réutilisation, principalement Wikimedia Commons.

## Périmètre initial

L'objectif est de produire environ 20 à 25 indices publiables par catégorie. Ce nombre est une cible, pas une raison d'importer une fiche incomplète.

Pays prioritaires :

- Europe : France, Royaume-Uni, Irlande, Espagne, Portugal, Italie, Allemagne, Danemark, Norvège, Suède, Finlande, Pologne, Roumanie, Hongrie, République tchèque, Slovaquie, Serbie, Grèce, Turquie et Islande.
- Amériques : États-Unis, Canada, Mexique, Guatemala, Colombie, Équateur, Pérou, Brésil, Argentine, Uruguay et Chili.
- Afrique : Ghana, Sénégal, Kenya, Ouganda, Rwanda, Nigeria, Afrique du Sud, Botswana, Lesotho et Eswatini.
- Asie et Océanie : Japon, Corée du Sud, Taïwan, Thaïlande, Philippines, Indonésie, Malaisie, Sri Lanka, Bangladesh, Australie et Nouvelle-Zélande.

Chaque catégorie retient uniquement les pays pour lesquels l'indice est pertinent et suffisamment documenté. Il n'est pas nécessaire de créer une fiche dans chaque catégorie pour chaque pays.

## Catégories

### Marquages au sol

- Identifiant stable : `f1000000-0000-0000-0000-000000000004`
- Icône : `road`
- Couleur de catégorie : `#F2C94C`
- Couverture prévue : 20 à 25 pays.

Exemples de caractéristiques :

- couleur de la ligne centrale ;
- lignes latérales continues ou discontinues ;
- combinaison entre lignes centrales et lignes de rive ;
- forme ou espacement caractéristique ;
- particularités des routes en béton.

Une fiche régionale est créée seulement si le marquage diffère réellement à l'intérieur d'un pays et si la région correspondante existe dans GeoTrainer.

### Poteaux électriques

- Identifiant stable : `f1000000-0000-0000-0000-000000000005`
- Icône : `pole`
- Couleur de catégorie : `#A78BFA`
- Couverture prévue : 20 à 25 pays.

Exemples de caractéristiques :

- matériau du poteau ;
- forme, perforations ou bandes peintes ;
- disposition des isolateurs ;
- supports métalliques ou renforts ;
- plaques, numéros ou marquages visibles.

Les bollards et bornes routières restent dans la catégorie `Bollards`. Cette catégorie concerne les poteaux de distribution électrique ou téléphonique utilisés comme indice visuel.

### Google Car

- Identifiant stable : `f1000000-0000-0000-0000-000000000006`
- Icône : `car`
- Couleur de catégorie : `#38BDF8`
- Couverture prévue : jusqu'à 20 pays ou territoires, selon la disponibilité d'images légalement réutilisables.

Exemples de caractéristiques :

- barres de toit ;
- antenne ou rétroviseur visible ;
- couleur ou partie visible du véhicule ;
- ruban adhésif ou équipement distinctif ;
- hauteur de caméra ;
- forme de la zone de floutage.

Cette catégorie accepte davantage de fiches régionales, car certains véhicules sont associés à une île, une ville ou une zone précise. Exemples envisagés : Réunion, San Andrés, Christmas Island, Svalbard ou Kampala. Une fiche n'est importée que si le territoire peut être représenté proprement par le modèle géographique existant.

## Difficulté

Chaque fiche utilise l'une des valeurs existantes :

- `easy` : indice très distinctif, visible et généralement spécifique ;
- `medium` : indice fiable mais nécessitant une comparaison ou un contexte complémentaire ;
- `expert` : indice subtil, régional, variable ou partagé par plusieurs pays.

La carte réutilise les couleurs de difficulté existantes :

- vert clair pour `easy` ;
- jaune clair pour `medium` ;
- rouge clair pour `expert`.

La difficulté est définie dans le dataset, pas calculée pendant l'import. Une fiche régionale est généralement `medium` ou `expert`, sauf indice particulièrement évident.

## Régions

Le dataset peut contenir `regionIds`.

- Sans `regionIds`, la couverture est `whole_country`.
- Avec au moins une région résolue, la couverture est `regions`.
- Tous les identifiants doivent exister dans `public.regions`.
- L'import échoue pour la fiche si une région demandée ne peut pas être résolue.
- Une région n'est pas ajoutée uniquement pour rendre la fiche plus précise : elle doit correspondre à la portée réelle de l'indice.

Le clic sur une région dans l'Atlas sélectionne la fiche correspondante sans modifier le zoom courant.

## Images et licences

Une image est obligatoire pour chaque fiche.

Sources acceptées :

- Wikimedia Commons avec page de fichier et licence identifiables ;
- autres banques ou institutions autorisant explicitement la réutilisation et l'hébergement ;
- créations propres au projet lorsque leur provenance est documentée.

Sources refusées :

- captures Google Street View ou Google Maps sans autorisation adaptée ;
- images récupérées directement depuis Plonk It ou MetaGuessr ;
- images sans auteur, licence ou page source vérifiable ;
- miniatures distantes conservées comme unique URL sans copie dans Supabase Storage.

Chaque fiche stocke :

- `sourceName`
- `sourceUrl`
- `licenseName`
- `licenseUrl`
- `attributionText`
- `imageUrl`
- `imageAltText`

L'import télécharge l'image, vérifie son type réel, l'envoie dans `clue-images`, puis crée l'enregistrement `clue_images`. Une fiche sans image valide n'est ni créée ni publiée.

## Données

Trois datasets JSON versionnés sont ajoutés :

- `scripts/official-road-markings/road-markings.v1.json`
- `scripts/official-utility-poles/utility-poles.v1.json`
- `scripts/official-google-car/google-car.v1.json`

Format commun d'une entrée :

```json
{
  "id": "uuid-stable",
  "countryCode": "FR",
  "regionIds": [],
  "difficulty": "easy",
  "title": "Marquage au sol - France",
  "characteristics": ["Description reformulée"],
  "notes": "Conseil GeoGuessr reformulé.",
  "sourceName": "Wikimedia Commons",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:...",
  "licenseName": "CC BY-SA 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
  "attributionText": "Auteur et fichier source.",
  "imageUrl": "https://commons.wikimedia.org/wiki/Special:FilePath/...",
  "imageAltText": "Description accessible de la photo"
}
```

## Import

Les commandes prévues sont :

```bash
npm run road-markings:import
npm run utility-poles:import
npm run google-car:import
```

Chaque commande accepte :

```bash
--dry-run
--missing-images-only
```

Comportement requis :

1. Charger `.env` et `.env.local`.
2. Vérifier l'existence de la Collection officielle et de la catégorie.
3. Vérifier l'auteur configuré ou utiliser le propriétaire officiel prévu.
4. Valider l'intégralité du dataset avant les écritures.
5. Résoudre pays et régions.
6. Télécharger et contrôler l'image.
7. Créer ou mettre à jour l'indice avec son UUID stable.
8. Réconcilier les régions et l'image.
9. Publier uniquement une fiche complète.
10. Produire un résumé JSON dans `output/`.

Les imports sont idempotents : une seconde exécution met à jour les fiches existantes sans créer de doublons.

Une erreur sur une fiche est enregistrée dans le résumé et n'empêche pas le traitement des autres fiches. Le processus se termine toutefois avec un code non nul si au moins une fiche a échoué.

## Migration

Une migration ajoute les trois catégories à la Collection officielle avec leurs UUID, noms, icônes et couleurs stables. Elle utilise `on conflict` afin de rester réexécutable.

Aucune nouvelle table ni modification de RLS n'est nécessaire.

## Interface

Les catégories apparaissent automatiquement dans :

- l'Atlas ;
- le choix de catégorie de l'entraînement ;
- les statistiques ;
- l'éditeur d'indice pour les administrateurs de la Collection officielle.

L'Atlas affiche les pays ou régions renseignés avec la couleur correspondant à la difficulté. Les fiches affichent la photo, les caractéristiques, les notes et les liens de provenance.

L'icône `car` doit être ajoutée au registre d'icônes de l'Atlas. Les icônes `road` et `pole` existent déjà.

## Tests et contrôles

Tests automatisés :

- validation des champs obligatoires du dataset ;
- rejet d'une entrée sans image ;
- rejet d'une difficulté inconnue ;
- rejet d'un pays ou d'une région introuvable ;
- détermination correcte de `whole_country` ou `regions` ;
- idempotence des UUID et chemins Storage ;
- création des métadonnées de licence ;
- présence des nouvelles catégories dans l'Atlas.

Contrôles avant import réel :

- `--dry-run` sans échec ;
- vérification manuelle d'un échantillon de chaque difficulté ;
- vérification visuelle des images et de leur correspondance avec l'indice ;
- vérification des pages source et licences ;
- build, lint, typecheck et tests du projet.

## Critères d'acceptation

- Les trois catégories appartiennent à la Collection officielle publique.
- Chaque indice publié possède au moins une image stockée dans Supabase.
- Chaque indice possède une difficulté cohérente.
- Les fiches locales ciblent les régions disponibles quand cela est pertinent.
- Aucun texte ou visuel de Plonk It, MetaGuessr ou Google Street View n'est copié sans droit de réutilisation.
- Les sources et licences sont visibles dans la fiche.
- Les imports peuvent être relancés sans doublon.
- Les pays et régions renseignés sont colorés par difficulté dans l'Atlas.
- La sélection d'une région ne change pas le zoom choisi par l'utilisateur.

## Hors périmètre

- couverture mondiale exhaustive ;
- extraction automatique non contrôlée de tous les guides ;
- import d'images dont la licence est ambiguë ;
- création de régions géographiques absentes uniquement pour satisfaire une fiche ;
- fusion de ces catégories avec `Bollards` ou `Plaques`.
