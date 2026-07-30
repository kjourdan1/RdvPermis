# RdvPermis-IDF — Design

**Date :** 2026-07-30
**Repo :** RdvPermis-IDF (GitHub, public)

## Contexte

Recherche manuelle et répétée de créneaux d'examen du permis de conduire sur le site
officiel RdvPermis (candidat.permisdeconduire.gouv.fr) : connexion, navigation vers la
recherche de créneaux, sélection d'un département, lancement de la recherche. Le site
expose une API interne non documentée mais accessible directement :

```
GET https://candidat.permisdeconduire.gouv.fr/api/v1/candidat/creneaux?code-departement=XX
```

Cette API répond en JSON avec la liste des centres et créneaux disponibles, à condition
que la requête inclue les cookies de session d'un utilisateur authentifié. Un script
communautaire (Greasemonkey/Tampermonkey) existe déjà et démontre que cette API est
directement exploitable une fois authentifié, sans avoir besoin de simuler des clics
navigateur pour chaque recherche.

## Objectif

Automatiser la vérification périodique des créneaux disponibles sur une liste de
départements (78, 91, 92, 93, 94, 95, 27, 28, 60, 45), notifier uniquement l'apparition
de nouveaux créneaux, et afficher l'état courant sur un petit dashboard web — le tout sur
des services gratuits, sans jamais réserver automatiquement à la place de l'utilisateur.

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│ GitHub Actions       │ écrit   │  Vercel Blob          │  lit   ┌──────────────┐
│ (cron every 15 min)  │────────▶│  creneaux.json        │───────▶│ Next.js app   │
│                       │         │  (état complet +      │        │ (dashboard)   │
│ worker/ (Node+TS)     │         │   lastChecked)        │        │ web/          │
└──────────┬───────────┘         └──────────────────────┘        └──────────────┘
           │ notifie si nouveau créneau
           ▼
    Telegram Bot API
```

### Structure du repo (monorepo, deux packages indépendants)

```
RdvPermis-IDF/
├── worker/     (package Node/TS — Playwright + logique de check, exécuté uniquement
│                par GitHub Actions, jamais déployé)
└── web/        (app Next.js — dashboard, déployée sur Vercel)
```

Séparer `worker/` de `web/` évite que Playwright (dépendance lourde, télécharge un vrai
Chromium) soit embarqué dans le build/bundle Vercel. Le worker ne tourne jamais sur
Vercel ; seul `web/` y est déployé.

## Composants

**`worker/`**
- `login.ts` — Playwright headless : navigue vers la page de connexion, remplit NEPH +
  date de naissance (lus depuis `process.env`), soumet le formulaire, récupère les
  cookies de session une fois authentifié.
- `checkSlots.ts` — bascule en HTTP pur (`fetch` avec les cookies récupérés) pour
  interroger l'API des créneaux sur chaque département de la liste, avec un délai
  aléatoire de 1 à 2 secondes entre chaque appel.
- `diffAndNotify.ts` — compare le nouvel état au dernier état stocké, envoie une
  notification Telegram uniquement pour les créneaux réellement nouveaux.
- `storage.ts` — lit/écrit l'état JSON dans Vercel Blob.
- `config.ts` — liste des départements et fenêtres horaires de fréquence.

**`web/`**
- Une page unique qui lit le JSON d'état le plus récent depuis Vercel Blob côté serveur
  (ISR, revalidation toutes les 2-5 min) et affiche un tableau : département, centre,
  date, heure, dernière vérification, avec code couleur (vert = dispo, gris = rien).
- Application ouverte, sans authentification (décision explicite de l'utilisateur : rien
  de sensible n'y transite, cf. section Sécurité).

## Sécurité et gestion des secrets

Contrainte explicite : les identifiants ne doivent jamais être en clair ni récupérables,
y compris via les cookies, sachant que l'app est ouverte et le repo public.

- NEPH, date de naissance, token du bot Telegram, et token d'écriture Vercel Blob vivent
  uniquement dans **GitHub Actions Secrets** (chiffrés, jamais visibles dans les logs ni
  dans le code, même en repo public).
- Le worker ne logue jamais les cookies de session ni les identifiants (logs limités au
  département testé, au nombre de créneaux trouvés, et à des messages d'erreur génériques
  sans corps de réponse brut si celui-ci peut contenir des données de session).
- Les cookies de session restent en mémoire du process GitHub Actions le temps du run,
  puis sont détruits — jamais écrits sur disque, jamais dans le JSON stocké sur Vercel
  Blob.
- Le frontend (`web/`) ne lit **que** `creneaux.json` (département, centre, date, heure,
  horodatage) : il n'a ni accès réseau vers RdvPermis, ni connaissance des secrets.
  Architecturellement, il ne peut pas exposer NEPH, date de naissance ou cookies de
  session, puisqu'il ne les reçoit jamais.

## Flux d'exécution (un run worker)

1. Lecture de l'état précédent (`creneaux.json`) depuis Vercel Blob, y compris
   `lastChecked`.
2. Calcul de l'heure locale de Paris actuelle (`Intl.DateTimeFormat` avec
   `timeZone: 'Europe/Paris'`, gère automatiquement CET/CEST) et détermination de la
   fenêtre : pointe (8h-9h, 12h-13h, 17h-18h) ou hors-pointe.
3. Calcul du temps écoulé depuis `lastChecked`. Si écoulé < 15 min (pointe) ou < 30 min
   (hors-pointe) → le run s'arrête immédiatement (aucun login, aucun appel API, aucune
   écriture). Sinon → passage à l'étape 4.
4. Login Playwright headless → récupération des cookies de session. Si échec → le job se
   termine en échec (`process.exit(1)`, voir Gestion des erreurs) sans toucher au Blob.
5. Pour chaque département (78, 91, 92, 93, 94, 95, 27, 28, 60, 45) : appel
   `GET /api/v1/candidat/creneaux?code-departement=XX` avec les cookies, délai aléatoire
   1-2s avant l'appel suivant.
6. Construction du nouvel état complet : `{ departement, centre, date, heure }[]` +
   `lastChecked` (horodatage du run).
7. **Diff** : comparaison entre nouvel état et ancien état, clé unique
   `departement+centre+date+heure` → liste des créneaux apparus (présents maintenant,
   absents avant).
8. Si la liste de nouveautés n'est pas vide → un message Telegram groupé par
   département/centre est envoyé.
9. Écriture du nouvel état complet dans `creneaux.json` sur Vercel Blob (remplace
   l'ancien) — c'est ce fichier que lit le dashboard.

### Pourquoi un seul état comparé au run précédent

Un créneau qui reste disponible plusieurs runs de suite n'est notifié qu'une fois. Un
créneau qui disparaît puis réapparaît (réservé puis annulé par quelqu'un) redéclenche une
notification, ce qui est le comportement voulu.

### Pourquoi le temps écoulé plutôt que l'horloge murale (:00/:30)

GitHub Actions déclenche le cron `*/15 * * * *` en UTC toutes les 15 minutes, mais les
runs planifiés peuvent être retardés en période de forte charge (GitHub le documente
explicitement, notamment en début d'heure). Une logique basée sur "l'heure actuelle
tombe-t-elle pile sur :00 ou :30" serait cassée par ce décalage et pourrait faire sauter
des checks à répétition. En comparant le temps écoulé depuis `lastChecked` (mis à jour
uniquement lors d'un vrai check, jamais lors d'un run sauté) au seuil de 15 ou 30 min, la
logique est insensible au décalage : elle rattrape naturellement dès que le seuil est
dépassé, sans dérive cumulative possible.

## Notifications

- **Telegram** : réservé exclusivement aux annonces de nouveaux créneaux. Format groupé
  par département/centre, ex :
  ```
  🚗 Nouveau créneau disponible !
  📍 Département 78 — Centre de Versailles
  📅 Vendredi 15 août à 14h30
  ```
- **Email** : géré nativement par GitHub Actions — si un job échoue (code de sortie
  non-zéro), GitHub envoie automatiquement un email à l'adresse associée au compte GitHub
  du propriétaire du repo, avec un lien direct vers les logs du run. Aucune intégration
  email custom n'est nécessaire.

## Gestion des erreurs et résilience

Principe général : une erreur sur une étape ne doit jamais faire planter tout le run
silencieusement. Soit on continue en dégradé, soit le job échoue explicitement pour
déclencher l'email automatique GitHub.

| Situation | Comportement |
|---|---|
| Login Playwright échoue (site down, formulaire changé, CAPTCHA inattendu) | Run marqué en échec (`process.exit(1)`) → email automatique GitHub. Rien n'est écrit sur Blob (dernier état valide conservé). |
| Appel API département échoue (timeout, 500, session expirée en cours de route) | Retenté une fois après un court délai ; si échec persistant, département ignoré pour ce run (ancienne valeur conservée dans l'état), loggé. Les autres départements continuent normalement. Le run se termine en succès. |
| Session expirée détectée en cours de run (401/403 sur l'API) | Un seul re-login Playwright est tenté au milieu du run ; en cas d'échec, bascule sur le cas "login échoue" ci-dessus. |
| Structure JSON de réponse inattendue (le site a changé son format) | Parsing du département concerné échoue proprement (try/catch), traité comme un échec d'appel API (run continue). |
| Écriture Vercel Blob échoue | Run marqué en échec (`process.exit(1)`) → email automatique GitHub. Le prochain run réessaiera normalement. |

## Planification

Cron GitHub Actions unique, toutes les 15 minutes, sans exception :

```yaml
schedule:
  - cron: '*/15 * * * *'
```

La décision de faire un vrai check ou de sauter le run est prise dans le code du worker
(voir Flux d'exécution, étapes 2-3), pas dans l'expression cron elle-même — ce qui évite
tout problème de fuseau horaire (CET/CEST) ou de décalage d'exécution.

Fenêtres de pointe (check toutes les 15 min) : 8h-9h, 12h-13h, 17h-18h (heure de Paris).
Hors pointe : check toutes les 30 min. Configurable dans `worker/config.ts`.

## Tests et vérification

- **`worker/`** : tests unitaires (Vitest) sur la logique pure et déterministe — diff
  nouveau/ancien état, calcul de fenêtre horaire (pointe/hors-pointe, CET/CEST), calcul du
  temps écoulé depuis `lastChecked`. Le login Playwright et les appels API réels ne sont
  pas testés automatiquement (dépendent du site en ligne) — vérifiés manuellement en
  local avec de vrais identifiants avant le premier déploiement.
- **`web/`** : pas de suite de tests dédiée (une page, un fetch, un rendu de tableau) —
  vérification manuelle dans le navigateur après déploiement (golden path : créneaux
  affichés correctement ; cas vide : aucun créneau nulle part).
- **Vérification bout-en-bout avant mise en prod** : un run manuel du workflow GitHub
  Actions (`workflow_dispatch`) pour confirmer login + fetch + écriture Blob + notif
  Telegram fonctionnent ensemble, avant de compter sur le cron automatique.

## Livrables

- Repo GitHub public **RdvPermis-IDF** avec `worker/` (Node/TS + Playwright) et `web/`
  (Next.js) comme packages séparés.
- Workflow GitHub Actions (`*/15 * * * *`) avec secrets : `NEPH`, `DATE_NAISSANCE`,
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BLOB_READ_WRITE_TOKEN`.
- `README.md` : instructions pas-à-pas — création des secrets GitHub, déploiement Vercel
  (lié au même repo, dossier `web/`), création du bot Telegram (BotFather + récupération
  du chat id), configuration du store Vercel Blob.
- `worker/config.ts` documenté : comment ajouter/retirer un département, modifier les
  fenêtres horaires de pointe.

## Contraintes légales et éthiques (rappel)

- Le système vérifie et affiche uniquement la disponibilité — il ne réserve jamais
  automatiquement de créneau. La décision finale reste entièrement manuelle.
- Fréquence de vérification volontairement mesurée (15-30 min selon l'heure, délai
  aléatoire entre départements) pour rester raisonnable vis-à-vis du service public et ne
  pas risquer de blocage du compte.
- Aucune donnée personnelle (NEPH, date de naissance, cookies de session) n'est exposée
  dans le frontend, les logs publics, ou le code source versionné.
