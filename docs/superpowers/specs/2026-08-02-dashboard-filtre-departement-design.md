# Dashboard web — groupement + filtre par département (design)

_Brainstorm du 2026-08-02, périmètre `web/` uniquement._

## Contexte

`web/` est un dashboard Next.js (App Router) qui lit l'état écrit par le worker dans Vercel Blob
(`creneaux.json`, snapshot unique — pas d'historique) et l'affiche sur une page publique sans
authentification. Aujourd'hui `app/page.tsx` affiche un tableau plat de tous les créneaux, sans
filtre ni groupement, avec un style inline minimal et un surlignage vert appliqué (à tort) à
toutes les lignes.

## Hors périmètre (explicitement écarté pendant le brainstorm)

- **Historique des créneaux** : nécessiterait de faire persister plus que le dernier snapshot côté
  worker (changement hors `web/`). Traité comme un futur spec séparé.
- **Rafraîchissement automatique côté navigateur** : la page reste 100% Server Component ; les
  données restent à jour au prochain chargement grâce à `revalidate = 120` déjà en place. Pas de
  polling client.
  - **Note** : la lecture de `searchParams` (pour le filtre département) rend la route entièrement
    dynamique — elle n'est plus statiquement re-générée toutes les 120s. Le `list()` Vercel Blob
    s'exécute donc désormais à chaque requête plutôt que toutes les 120s, même si le `fetch` JSON
    sous-jacent dans `lib/state.ts` reste Data-Cached à 120s. Compromis identifié et accepté en
    revue, pas un oubli.
- **Notion de "nouveau créneau"** : pas disponible sans changement worker (le diff "nouveau" existe
  déjà côté worker pour Telegram, mais n'est pas persisté dans le Blob). Le surlignage vert actuel,
  appliqué à toutes les lignes sans distinction, est donc supprimé plutôt que corrigé.

## Décisions issues du brainstorm

- Filtre département : **multi-sélection**, tous cochés par défaut.
- Persistance du filtre : **dans l'URL** (`?dep=078,091,...`), partageable, pas de stockage
  navigateur.
- Tri/groupement : **groupé par département, trié par date puis heure** dans chaque groupe.
- Interaction des chips : **liens purs (`<Link>`), zéro JS côté client** — chaque clic recalcule la
  query string et déclenche une navigation ; le filtrage/groupement se fait côté serveur. Pas de
  frontière `"use client"` introduite.
- Style visuel : **shadcn/ui + Tailwind CSS** (nouvelle dépendance pour ce projet).

## Architecture / flux de données

`page.tsx` reste un Server Component async. Flux inchangé pour la lecture des données
(`getLatestState()` dans `lib/state.ts`, inchangé), avec un filtrage ajouté en mémoire côté
serveur à partir de `searchParams.dep` :

```
searchParams.dep → parseSelectedDepartements() → filterAndGroup(creneaux, selected) → render
```

Absence du paramètre `dep` = tous les départements sélectionnés (comportement par défaut actuel
préservé). `revalidate = 120` reste inchangé.

## Découpage en composants

- `lib/creneaux.ts` — logique pure, sans dépendance réseau :
  - `DEPARTEMENTS` — liste des 10 codes (`078`, `091`, `092`, `093`, `094`, `095`, `027`, `028`,
    `060`, `045`), dupliquée depuis `worker/src/config.ts` : `web/` et `worker/` sont deux
    déploiements séparés (pas de package partagé), donc pas d'import inter-projet possible. À
    garder synchronisée manuellement si la liste évolue côté worker — même risque de dérive que
    n'importe quelle constante dupliquée entre deux projets indépendants.
  - `parseSelectedDepartements(searchParams): string[]` — tout coché si absent/vide ; valeurs
    invalides (hors de `DEPARTEMENTS`) ignorées silencieusement.
  - `filterAndGroup(creneaux, selected): { departement: string; creneaux: Creneau[] }[]` —
    groupe par département (uniquement les départements sélectionnés et non vides), trie chaque
    groupe par `date` puis `heure`.
- `components/DepartementFilter.tsx` — barre de chips, un `<Link href="?dep=...">` par
  département, état actif/inactif dérivé de `selected`.
- `components/CreneauGroup.tsx` — une section par groupe : titre (`{departement} · N créneaux`)
  + tableau shadcn des créneaux de ce groupe.
- `page.tsx` — orchestration uniquement : fetch de l'état, parsing du filtre, boucle sur les
  groupes retournés par `filterAndGroup`.

Chaque unité a une responsabilité unique et est compréhensible sans lire les autres.

## Design visuel

- **Chips de filtre** : composant shadcn `Toggle` (ou `Badge` cliquable) par département — actif
  = fond plein, inactif = contour seul. Enveloppé dans un `<Link>`, pas de gestionnaire de clic JS.
- **Tableau par groupe** : composant shadcn `Table` (`TableHeader`/`TableRow`/`TableCell`).
- **Départements décochés** : simplement absents de la page, aucune section vide affichée.
- **Suppression du surlignage vert actuel** (`backgroundColor: '#e6ffed'` sur toutes les lignes) :
  n'a plus de justification sans notion de "nouveau" (voir Hors périmètre).
- **En-tête de page** : même contenu qu'aujourd'hui (titre, "Dernière vérification : ..."),
  restylé en Tailwind au lieu du style inline actuel.

## Gestion des erreurs

Aujourd'hui, un échec de `getLatestState()` (Blob indisponible, réponse non-OK) fait remonter une
exception non gérée jusqu'à l'écran d'erreur générique de Next.js. Ajout d'un `app/error.tsx`
(convention App Router) affichant un message utilisateur clair ("Impossible de charger les
créneaux pour le moment, réessaie dans quelques instants") sans détail technique, cohérent avec le
fait qu'il s'agit d'une page publique sans authentification.

Les cas déjà gérés (`state === null`, `creneaux` vide) sont conservés tels quels.

## Tests

- `lib/creneaux.test.ts` : tests unitaires purs sur `parseSelectedDepartements` (absence/valeurs
  invalides) et `filterAndGroup` (groupement, tri, exclusion des groupes vides) — même style que
  `lib/state.test.ts` existant, sans mock réseau.
- Pas de test dédié pour `DepartementFilter`/`CreneauGroup` (composants de présentation, peu de
  logique propre) ni pour `page.tsx` (déjà non testé aujourd'hui).

## Nouvelle dépendance

`shadcn/ui` + `tailwindcss` seront ajoutés à `web/package.json` (absents aujourd'hui).
