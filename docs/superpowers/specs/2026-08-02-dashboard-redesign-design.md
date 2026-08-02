# Dashboard web — refonte visuelle + sélection multi-département (design)

_Brainstorm du 2026-08-02, chantier 2 sur 2 (suite de
`docs/superpowers/specs/2026-08-02-worker-national-departements-design.md`). Périmètre `web/`
uniquement — aucun changement worker._

## Contexte

Le worker vérifie désormais les 101 départements français et persiste un flag `isNew` par
créneau (chantier 1, mergé). Le dashboard `web/` n'a pas suivi : `web/lib/creneaux.ts` garde
encore la liste des 10 départements d'origine (codes seulement, pas de noms) avec un commentaire
explicite "en attendant ce chantier". Le design visuel actuel est minimal (styles Tailwind de
base, pas d'identité). L'utilisateur veut : (1) une vraie identité visuelle, (2) le retrait de
"IDF" du nom du projet (titre + README), (3) un vrai sélecteur de départements par
recherche/ajout plutôt que la rangée de chips statique actuelle, (4) l'affichage du badge
"Nouveau" maintenant que `isNew` existe côté données.

Référence visuelle fournie par l'utilisateur : un mockup HTML autonome (bandeau tricolore,
cartes stats, panneau de recherche/chips, sections dépliables par département) — utilisé comme
référence de structure et de palette, pas reproduit au pixel près (certains éléments du mockup
sont des artefacts de démo, voir Hors périmètre).

## Hors périmètre

- **Aucun changement worker.** `isNew` est déjà persisté (chantier 1) ; ce chantier ne fait que
  l'afficher.
- **Pas de bouton "Actualiser" / compteur "Vérifications".** Le mockup simule un check à la
  demande (données aléatoires générées côté client) ; le vrai système ne vérifie que via le cron.
  Un bouton qui ne ferait qu'un reload de page n'apporterait rien face au `revalidate = 120`
  déjà en place, et un faux compteur de "vérifications" mentirait sur ce qui se passe réellement.
- **La sélection de départements reste strictement un filtre d'affichage.** Ne contrôle jamais ce
  que le worker interroge (décision déjà actée au chantier 1, pour les mêmes raisons de sécurité
  du dashboard public sans authentification).

## Décisions issues du brainstorm

- **Style visuel** : réutilisation de l'infrastructure shadcn/ui + Tailwind déjà en place
  (chantier "dashboard-filtre-departement"), avec les tokens de couleur (`--primary`, etc.)
  recolorés sur la palette bleue du mockup plutôt qu'un CSS sur-mesure séparé.
- **Sélecteur de départements** : recherche par nom ou code avec suggestions, ajout/retrait via
  chips retirables — pas la rangée de 101 chips statiques qu'impliquerait une extension naïve de
  l'ancien composant. Nécessite un Client Component (contrairement au chantier précédent qui
  restait 100% Server Component) pour le filtrage en direct pendant la frappe.
- **Persistance de la sélection** : reste dans l'URL (`?dep=...`), comme au chantier précédent —
  le Client Component fait `router.push` au lieu de servir des `<Link>` statiques, mais le
  mécanisme de fond (`parseSelectedDepartements`, `filterAndGroup`) ne change pas.
- **Stats retenues** : "Places trouvées" (total des créneaux actuellement affichés, après filtre)
  et "Départements sélectionnés" (`selected.length`). Le "Départements suivis" du mockup n'a pas
  d'équivalent honnête distinct de la sélection d'affichage (le worker suit toujours les 101).

## Architecture / composants

- `web/lib/departements.ts` (nouveau) — source canonique statique :
  ```ts
  export interface DepartementInfo {
    code: string; // 3 caractères, zero-paddé -- identique à worker/src/config.ts et Creneau.departement
    name: string;
  }
  export const DEPARTEMENTS: DepartementInfo[]; // 101 entrées
  ```
  Source des données : la liste `DEPARTMENTS` du mockup HTML fourni par l'utilisateur
  (`C:\Users\killi\.claude\uploads\83ad42d6-0ec2-492c-98c5-bdb17c539eda\92a5345f-index.html`,
  lignes 407-429), avec les codes convertis au format 3 caractères déjà utilisé par le worker
  (`"01"` → `"001"`, `"75"` → `"075"`, `"2A"` → `"02A"`, codes DOM `"971"`-`"976"` déjà à 3
  chiffres, inchangés). Même transformation que celle appliquée à
  `worker/src/config.ts` au chantier précédent, appliquée ici à la même liste source mais en
  gardant les noms cette fois.

- `web/lib/creneaux.ts` (modifié) — ne définit plus sa propre liste de codes ; importe les codes
  depuis `departements.ts` (`DEPARTEMENTS.map(d => d.code)`). `parseSelectedDepartements`,
  `filterAndGroup`, `buildFilterHref`, `formatHeure` gardent leurs signatures et leur
  comportement actuels (déjà couverts par les tests du chantier précédent, qui restent valables
  une fois la source de codes élargie à 101).

- `web/components/DepartementPicker.tsx` (nouveau, remplace `DepartementFilter.tsx` qui est
  supprimé) — Client Component (`"use client"`) :
  - Champ de recherche : filtre `departements.ts` sur nom ou code (insensible à la casse),
    exclut les départements déjà sélectionnés, 8 suggestions maximum.
  - Clic sur une suggestion ou sur le × d'un chip sélectionné → calcule la nouvelle href via
    `buildFilterHref` (réutilisée telle quelle, déjà générique pour ajouter ou retirer n'importe
    quel code) → `router.push(href)`.
  - Retirer le dernier département sélectionné : `buildFilterHref` retourne `'?'`, relu comme
    "absent/vide" par `parseSelectedDepartements` → tout redevient coché (comportement déjà
    documenté au chantier précédent, pas un cas particulier à gérer ici).

- `web/components/CreneauGroup.tsx` (modifié) — le titre de section affiche le nom du département
  en plus du code (ex. "078 · Yvelines · 3 créneaux") ; chaque ligne de créneau affiche un badge
  "Nouveau" (shadcn `Badge`, variant distinct) quand `creneau.isNew` est vrai.

- `web/app/page.tsx` (modifié) — nouvel en-tête (bandeau tricolore, marque, lien GitHub vers le
  repo, bandeau d'avertissement "projet communautaire indépendant, non affilié à l'État ni à
  l'ANTS"), deux cartes stats (Places trouvées, Départements sélectionnés), rend
  `DepartementPicker` à la place de `DepartementFilter`. Flux de données inchangé
  (`getLatestState` → `parseSelectedDepartements` → `filterAndGroup` → rendu).

- `web/app/layout.tsx` — `metadata.title` : `"RdvPermis-IDF"` → `"RdvPermis"`.

- `web/app/globals.css` — tokens `--primary`/`--primary-foreground`/etc. recolorés sur la
  palette bleue du mockup au lieu du gris neutre par défaut de l'init shadcn. Source exacte des
  couleurs : le bloc `:root{...}` du mockup HTML (mêmes lignes 8-26 que la source de la liste des
  départements) — `--blue-900` à `--blue-100` pour les tons de `--primary`, `--red-600`/`--red-100`
  pour `--destructive`, `--green-600`/`--green-100` pour un accent "succès" si besoin (créneau
  disponible), `--paper`/`--white`/`--border`/`--ink-*` pour `--background`/`--card`/`--border`/
  `--foreground`/`--muted-foreground`.

- `README.md` — retrait des occurrences de "IDF" dans le nom du projet.

## Gestion des erreurs / cas limites

Inchangé par rapport au chantier précédent : `app/error.tsx` gère l'échec de lecture du Blob,
"Aucun créneau disponible pour le moment." si `creneaux.length === 0`, "Aucun créneau pour les
départements sélectionnés." si le filtre exclut tout ce qui existe. Aucun de ces comportements
n'est modifié par ce chantier.

## Tests

- `web/lib/departements.test.ts` (nouveau) : 101 entrées, pas de doublons de code, chaque code
  fait exactement 3 caractères, présence de quelques noms connus (ex. `"078"` → `"Yvelines"`,
  `"075"` → `"Paris"`).
- `web/lib/creneaux.test.ts` (modifié) : adapté pour utiliser la nouvelle source de codes (101 au
  lieu de 10) — la logique testée (groupement, tri, `buildFilterHref`) ne change pas.
- Pas de test pour `DepartementPicker.tsx` (Client Component avec interaction DOM/recherche —
  cohérent avec l'absence de test sur `DepartementFilter.tsx` aujourd'hui, composants de
  présentation sans logique propre non couverte ailleurs).

## Nouvelle dépendance

Aucune — réutilise shadcn/ui + Tailwind déjà installés.
