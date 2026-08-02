# Dashboard — bouton réservation, en-tête plus sobre, sélecteur en vraie liste déroulante (design)

_Brainstorm du 2026-08-02, chantier 3 sur 3 (suite de
`docs/superpowers/specs/2026-08-02-dashboard-redesign-design.md`). Périmètre `web/` uniquement._

## Contexte

Après le déploiement du chantier 2 (refonte visuelle bleue), l'utilisateur a comparé le rendu
avec le vrai site officiel (`candidat.permisdeconduire.gouv.fr`, capture d'écran fournie) et
identifié trois améliorations : un accès direct à la réservation, un en-tête moins envahissant
en bleu, et un sélecteur de département qui se comporte comme une vraie liste déroulante plutôt
qu'une recherche qui n'affiche rien tant qu'on n'a pas tapé.

## Décisions issues du brainstorm

- **Pas de logos officiels.** Le vrai site utilise le logo Marianne, "GOUVERNEMENT", et le logo
  "Sécurité routière" — on reprend l'esprit visuel (fond clair, titre noir gras, sous-titre gris,
  bleu réservé aux accents) mais pas ces éléments de marque, cohérent avec le disclaimer déjà en
  place ("projet communautaire indépendant, non affilié à l'État ni à l'ANTS").
- **Un seul bouton "Réserver mon examen"**, global, en haut de page — pas un par groupe de
  département, puisque le lien de réservation officiel ne pointe pas vers un créneau précis,
  juste vers le point d'entrée de connexion (`https://candidat.permisdeconduire.gouv.fr/reservation`).
- **Liste déroulante plutôt que recherche par ville.** Une base de communes françaises (~35 000
  entrées) pour retomber sur le même département final n'apporte rien par rapport à la
  réutilisation de la liste des 101 départements déjà en place — écarté pour un gain nul contre un
  coût de mise en place bien plus élevé.
- **Évolution du composant existant, pas une réécriture.** `DepartementPicker.tsx` garde toute sa
  logique (recherche avec pliage des accents, sélection multiple, retour à "tous" quand la
  sélection est vidée) ; seul le déclenchement de l'affichage change (au focus, pas seulement à la
  frappe).

## Architecture / composants

### En-tête (`web/app/page.tsx`)

- `<header>` passe de `bg-primary text-primary-foreground` à un fond clair (`bg-card` ou
  `bg-background`) avec texte `text-foreground`/`text-muted-foreground`.
- Titre `<h1>RdvPermis</h1>` en noir gras (`text-foreground font-bold`), sous-titre existant en
  gris (`text-muted-foreground`) — texte inchangé, seule la couleur change.
- Le monogramme "RP" et le bandeau tricolore restent (éléments génériques, pas des logos
  officiels), mais le monogramme perd son fond dégradé bleu-sur-bleu au profit d'un traitement
  simple cohérent avec le nouveau fond clair.
- Bandeau disclaimer et lien GitHub : bordure grise (`border-border`) et texte
  `text-muted-foreground` au lieu des variantes blanc-sur-bleu actuelles
  (`border-primary-foreground/*`, `text-primary-foreground/*`).
- Les cartes stats et les accents (liens, badges) gardent le bleu (`text-primary`) —
  le bleu n'est pas supprimé, seulement retiré du fond plein de l'en-tête.

### Bouton de réservation

- Composant shadcn `Button` (déjà en place), enveloppé dans un `<Link>` externe vers
  `https://candidat.permisdeconduire.gouv.fr/reservation`, `target="_blank"`,
  `rel="noopener noreferrer"`.
- Placé dans `page.tsx`, juste après l'en-tête et avant les cartes stats — premier élément
  visible et actionnable de la page.

### `DepartementPicker.tsx` → comportement liste déroulante

- Ajout d'un état `isOpen` (focus du champ), indépendant de la présence d'une requête tapée.
- Ouvert : affiche la liste complète des départements disponibles (non déjà sélectionnés, sauf si
  `allSelected`), filtrée par la requête si une requête est tapée — sinon la liste complète,
  scrollable (le conteneur `max-h-56 overflow-y-auto` existe déjà).
- Fermeture au blur (délai court pour laisser le clic sur une option s'exécuter avant la
  fermeture — même pattern que le mockup original de référence).
- Suppression du plafond arbitraire à 8 suggestions (`slice(0, 8)`) : une vraie liste déroulante
  montre tout ce qui correspond, pas un sous-ensemble tronqué — le scroll gère la longueur.
- Ajout d'un chevron visuel (icône `ChevronDown` de `lucide-react`, déjà une dépendance installée
  mais jusqu'ici inutilisée) pour signaler visuellement "ceci est une liste déroulante".
- Toute la logique de sélection (`buildFilterHref`, `foldForSearch`, le cas `allSelected`) reste
  strictement inchangée.

## Hors périmètre

- Recherche par ville (écartée, voir Décisions).
- Logos officiels (écartés, voir Décisions).
- Tout changement worker — ce chantier ne touche que `web/`.

## Tests

- Pas de nouveau test pour `DepartementPicker.tsx` (Client Component, cohérent avec l'absence de
  test déjà établie pour ce composant depuis le chantier précédent).
- Pas de test pour le changement de couleurs de l'en-tête (CSS/JSX, pas de logique testable).
- Le bouton de réservation est un lien statique, pas de logique à tester.
- La suite de tests existante (`departements.test.ts`, `creneaux.test.ts`, `state.test.ts`) doit
  rester verte sans modification — aucune de ces tâches ne touche `web/lib/`.
