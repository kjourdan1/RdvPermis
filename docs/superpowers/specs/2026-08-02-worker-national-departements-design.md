# Worker — passage à tous les départements français + badge "Nouveau" (design)

_Brainstorm du 2026-08-02, chantier 1 sur 2 (voir Hors périmètre). Périmètre `worker/` uniquement,
plus le type `Creneau` dupliqué côté `web/`._

## Contexte

Le worker vérifie aujourd'hui 10 départements d'Île-de-France (`worker/src/config.ts`,
`DEPARTEMENTS`). L'utilisateur souhaite étendre la couverture à tous les départements français, en
prévision d'un renommage du projet (retrait de "IDF") et d'une refonte visuelle du dashboard qui
permettra de choisir quels départements afficher.

## Hors périmètre (traité dans un chantier séparé, chantier 2)

- **Refonte visuelle du dashboard** (`web/`) : nouveau design, retrait de "IDF" du titre/README,
  interface de recherche/sélection des départements affichés. Un mockup HTML fourni par
  l'utilisateur sert de référence visuelle pour ce chantier.
- **Nom + mapping des départements** (code → nom, ex. `"69"` → `"Rhône"`) : uniquement une
  préoccupation d'affichage, vivra côté `web/` dans le chantier 2. Le worker ne manipule que des
  codes.

## Décisions issues du brainstorm

- **La sélection de départements ne contrôle jamais ce que le worker interroge.** Décision
  initiale envisagée (sélection = filtre d'écriture worker) écartée pour des raisons de sécurité :
  le dashboard est public sans authentification, et rendre la sélection modifiable depuis cette
  page exposerait la configuration du worker à n'importe quel visiteur. **Le worker vérifie
  systématiquement tous les départements** ; toute sélection future côté dashboard (chantier 2)
  ne sera qu'un filtre d'affichage, jamais un canal d'écriture vers le worker.
- **Aucun changement de mécanisme de vérification** : même boucle séquentielle avec délai aléatoire
  entre chaque département. Le volume de requêtes/jour est accepté comme un risque assumé
  (voir Architecture) plutôt que traité par un sharding entre plusieurs runs.
- **Badge "Nouveau" ajouté au périmètre** : le worker calcule déjà quels créneaux sont
  "réellement nouveaux" pour la notification Telegram (`findNewCreneaux` dans `diff.ts`) ; cette
  information est maintenant aussi persistée dans le Blob pour que le dashboard puisse l'afficher.

## Architecture

### Liste des départements

`worker/src/config.ts`, `DEPARTEMENTS` passe de 10 à la liste complète des départements français
(métropole `01`-`95` y compris `2A`/`2B` pour la Corse — pas de `20` —, DOM `971`-`974`, `976`) :
101 codes au total. Uniquement les codes (`string[]`, même forme qu'aujourd'hui) — pas de noms,
ceux-ci sont une préoccupation du chantier 2 côté `web/`.

Source canonique des 101 codes : la liste `DEPARTMENTS` du fichier mockup fourni par l'utilisateur
(`C:\Users\killi\.claude\uploads\83ad42d6-0ec2-492c-98c5-bdb17c539eda\92a5345f-index.html`, lignes
407-429) — déjà vérifiée par l'utilisateur pour le chantier 2. Le plan d'implémentation extrait les
codes (colonne de gauche de chaque paire) de cette liste plutôt que de les retranscrire à la main,
pour éviter tout risque de faute de frappe sur une liste de 101 valeurs.

### Boucle de vérification

Aucun changement à `worker/src/run.ts` ni `worker/src/checkSlots.ts` au-delà de la taille de
`DEPARTEMENTS` : même boucle `for (const departement of DEPARTEMENTS)`, même délai aléatoire
(`randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS)`, 1-2s) entre chaque appel, même appel `curl` par
département (voir `checkSlots.ts` — choisi précédemment pour contourner une différence
d'empreinte TLS entre `curl` et le `fetch` natif de Node).

Impact estimé : la boucle de départements passe d'environ 15-25s (10 départements) à environ
3-4 minutes (101 départements) ; en ajoutant le flux de login (~1-2 min), un run complet passe
d'environ 1-2 minutes à environ 5-6 minutes — large marge sous l'intervalle de cron de 15 minutes.

Le changement réel n'est pas le temps mais le **volume** : environ 10x plus de requêtes par jour
depuis la même session/IP qu'aujourd'hui. Le design anti-détection existant (rendu GPU réel,
`curl` avec empreinte navigateur, délais aléatoires par requête) reste inchangé et n'est pas
retravaillé dans ce chantier ; ce risque est accepté explicitement par l'utilisateur plutôt que
mitigé par un sharding des départements entre plusieurs runs de cron.

### Badge "Nouveau" — persistance de `isNew`

- `worker/src/types.ts` : `Creneau` gagne un champ `isNew: boolean`.
- `worker/src/run.ts` : après avoir construit `allCreneaux` et calculé `newCreneaux =
  findNewCreneaux(previousCreneaux, allCreneaux)` (déjà fait aujourd'hui pour Telegram), chaque
  créneau de `allCreneaux` est marqué `isNew: true` s'il apparaît dans `newCreneaux`, `false`
  sinon, avant l'appel à `writeState`.
- Définition de "nouveau" : présent lors de ce check, absent lors du check précédent (~15 min plus
  tôt) — exactement la même règle que celle déjà utilisée pour la notification Telegram, pas de
  logique parallèle. Un créneau reste `isNew: true` pendant exactement un run puis redevient
  `false` (il est désormais présent dans `previousCreneaux` au run suivant).
- `web/lib/state.ts` : l'interface `Creneau` dupliquée côté `web/` (voir
  `docs/superpowers/specs/2026-08-02-dashboard-filtre-departement-design.md` pour le contexte de
  cette duplication) gagne le même champ `isNew: boolean`, pour que le chantier 2 puisse
  directement l'afficher sans nouveau changement worker.

## Tests

- `worker/src/config.test.ts` (existant) : mise à jour pour attendre la liste complète des 101
  codes au lieu des 10 codes IDF.
- Marquage `isNew` : nouveaux tests (probablement dans `worker/src/run.test.ts`, qui mocke déjà
  `fetchDepartementCreneaux`) vérifiant qu'un créneau absent du `previousState` et présent dans le
  nouveau relevé est écrit avec `isNew: true`, et qu'un créneau déjà présent lors du run précédent
  est écrit avec `isNew: false`.
- `worker/src/diff.test.ts` (existant, teste `findNewCreneaux`) : inchangé, la fonction elle-même
  ne change pas.
