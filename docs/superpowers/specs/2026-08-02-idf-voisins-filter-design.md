# Dashboard — raccourci « Île-de-France + départements voisins » dans le sélecteur (design)

_Brainstorm du 2026-08-02, chantier 4 (suite de
`docs/superpowers/specs/2026-08-02-dashboard-polish-design.md`). Périmètre `web/` uniquement._

## Contexte

L'utilisateur veut retrouver facilement les créneaux disponibles en Île-de-France et dans les
départements juste à côté, sans avoir à chercher/ajouter les 16 départements un par un dans le
sélecteur existant.

## Décisions issues du brainstorm

- **Portée « voisins » = départements limitrophes**, pas régions administratives entières. Les 8
  départements d'Île-de-France (75, 77, 78, 91, 92, 93, 94, 95) + les 8 départements qui touchent
  directement la région : Oise (60), Eure (27), Eure-et-Loir (28), Loiret (45), Yonne (89), Aube
  (10), Marne (51), Aisne (02). Total 16 départements. Une région administrative voisine entière
  (ex. toute la Normandie jusqu'à la Manche, tout le Grand Est jusqu'à la Moselle) irait trop loin
  géographiquement par rapport à l'intention (« pas loin »).
- **Entrée spéciale dans la liste déroulante existante**, pas un bouton séparé ailleurs sur la
  page. Réutilise l'interaction déjà en place (`DepartementPicker.tsx`) plutôt que d'ajouter un
  nouvel élément d'UI à un autre endroit de la page.
- **Remplace la sélection, ne l'additionne pas.** Cliquer sur cette entrée fixe la sélection aux
  16 codes ; ce n'est pas un toggle comme pour un département individuel. L'utilisateur peut
  ensuite affiner à la main (retirer/ajouter des badges) exactement comme pour une sélection
  normale — aucun état "mode preset" à mémoriser côté composant.

## Architecture / composants

### Données (`web/lib/departements.ts`)

- Nouvelle constante exportée `IDF_ET_VOISINS: string[]` — les 16 codes ci-dessus, dans le même
  format 3 caractères zero-paddés que `DEPARTEMENTS`. Source unique, pas de duplication de codes
  en dur dans le composant.

### `DepartementPicker.tsx`

- Une entrée spéciale, distincte des départements de `SEARCH_INDEX`, épinglée en tête de la liste
  d'options quand :
  - le champ est ouvert (`isOpen`) et la requête est vide, ou
  - la requête (pliée via `foldForSearch`, comme le reste) correspond à un des mots-clés `idf`,
    `ile de france`, `voisin`/`voisins`.
- Libellé : « Île-de-France + départements voisins (16) », rendu avec le même style de bouton que
  les options normales (`role="option"` inclus, cohérent avec le combobox ARIA déjà en place),
  sans le préfixe code-département habituel.
- Au clic : `router.push('?dep=' + IDF_ET_VOISINS.join(','))`, puis `setQuery('')` et
  `setIsOpen(false)` — même séquence que `toggle()`, mais sans passer par `buildFilterHref`
  puisqu'il s'agit d'un remplacement complet, pas d'un ajout/retrait d'un seul code.
- Après sélection, les 16 départements s'affichent comme des badges individuels retirables, via le
  rendu de chips déjà existant — aucun nouveau chemin de rendu à ajouter pour l'état "preset actif".
- Le reste de la logique (`foldForSearch`, `SEARCH_INDEX`, l'exclusion des départements déjà
  sélectionnés, le cas `allSelected`, la fermeture par containment de focus, Escape) reste
  strictement inchangé.

## Hors périmètre

- Régions administratives entières (écarté, voir Décisions).
- Tout changement worker — ce chantier ne touche que `web/`.
- Tout autre raccourci régional (uniquement IDF + voisins demandé ; pas de généralisation à
  d'autres régions pour l'instant).

## Tests

- Nouveau cas de test pour `IDF_ET_VOISINS` dans `departements.test.ts` (structurel : longueur 16,
  tous les codes présents dans `DEPARTEMENTS`, pas de doublon) — cohérent avec le style de test
  déjà en place pour ce fichier (assertions structurelles, pas de tableau littéral dupliqué).
- Pas de nouveau test pour `DepartementPicker.tsx` (Client Component, cohérent avec l'absence de
  test déjà établie pour ce composant).
- La suite de tests existante doit rester verte sans modification par ailleurs.
