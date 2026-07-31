# RdvPermis-IDF

Vérification automatique des créneaux d'examen du permis de conduire (candidat.permisdeconduire.gouv.fr)
pour les départements 78, 91, 92, 93, 94, 95, 27, 28, 60, 45. Vérifie et affiche la disponibilité —
ne réserve jamais automatiquement.

## Comment ça marche

- `worker/` tourne uniquement dans un workflow GitHub Actions planifié toutes les 15 min. Il se connecte
  via Playwright, interroge l'API interne des créneaux pour chaque département, notifie sur Telegram
  uniquement les créneaux réellement nouveaux, et écrit l'état complet dans Vercel Blob.
- `web/` est un dashboard Next.js déployé sur Vercel qui lit cet état et l'affiche, sans authentification.

## Déployer sa propre version

Chaque personne doit déployer sa propre copie du repo : le worker se connecte avec **ton** compte
candidat.permisdeconduire.gouv.fr (email + mot de passe) et notifie **ton** bot Telegram. Rien de tout
ça n'est partagé ni ne transite par un serveur tiers — chaque instance est indépendante.

### Prérequis

- Un compte GitHub, et [la CLI `gh`](https://cli.github.com/) authentifiée (`gh auth login`).
- Un compte [Vercel](https://vercel.com) (gratuit), et la CLI `vercel` (`npm install -g vercel`).
- Node.js 20+ en local si tu veux lancer les tests ou le dashboard en dev.
- Un compte candidat sur candidat.permisdeconduire.gouv.fr (celui avec lequel tu réserves normalement
  ton examen) — c'est son email + mot de passe qui serviront à la connexion automatique.

### 1. Récupérer le code

Deux options :

- **Fork** (recommandé si tu veux pouvoir récupérer les futures mises à jour) : clique sur *Fork* en
  haut de la page GitHub du repo, puis clone ton fork :
  ```bash
  git clone https://github.com/<ton-compte>/RdvPermis.git
  cd RdvPermis
  ```
- **Copie indépendante** (nouveau repo sans lien avec l'original) :
  ```bash
  git clone https://github.com/kjourdan1/RdvPermis.git
  cd RdvPermis
  rm -rf .git && git init
  gh repo create RdvPermis-IDF --public --source=. --remote=origin --push
  ```

### 2. Créer le bot Telegram

1. Dans Telegram, ouvre une conversation avec [`@BotFather`](https://t.me/BotFather), envoie `/newbot`
   et suis les instructions (nom, puis identifiant se terminant par `bot`).
2. BotFather te renvoie un token du type `123456789:ABCdefGhIJKlmnoPQRstuVwxyZ` — c'est ton
   `TELEGRAM_BOT_TOKEN`.
3. Envoie n'importe quel message à ton bot (depuis ton compte Telegram) pour qu'il enregistre une
   conversation avec toi.
4. Récupère ton `TELEGRAM_CHAT_ID` :
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
   ```
   Cherche la valeur numérique `"chat":{"id": ...}` dans la réponse JSON.

### 3. Créer le store Vercel Blob

1. Sur le [dashboard Vercel](https://vercel.com/dashboard) → onglet **Storage** → **Create Database**
   → **Blob**.
2. Donne-lui un nom (ex. `rdvpermis-state`) et crée-le.
3. Copie le `BLOB_READ_WRITE_TOKEN` affiché dans le snippet de connexion.

### 4. Poser les secrets GitHub Actions

Dans le dossier du repo (celui créé à l'étape 1), avec `gh` authentifié sur **ton** compte GitHub :

```bash
gh secret set EMAIL --body "<email de ton compte candidat.permisdeconduire.gouv.fr>"
gh secret set PASSWORD --body "<mot de passe de ce compte>"
gh secret set TELEGRAM_BOT_TOKEN --body "<token recu de BotFather>"
gh secret set TELEGRAM_CHAT_ID --body "<chat_id recupere via getUpdates>"
gh secret set BLOB_READ_WRITE_TOKEN --body "<token du store Blob>"
```

Ces valeurs ne doivent **jamais** être écrites dans un fichier versionné, un message de commit ou
collées dans un chat — uniquement passées à `gh secret set`, qui les envoie chiffrées à GitHub.

### 5. Déployer le dashboard sur Vercel

```bash
cd web
vercel link --yes
vercel env add BLOB_READ_WRITE_TOKEN production
# colle le même token que celui de l'étape 3
vercel --prod
```

Une URL de production est affichée (ex. `https://ton-projet.vercel.app`) — c'est ton dashboard public.

### 6. Vérifier que tout fonctionne

```bash
gh workflow run "Check RdvPermis slots"
gh run watch
```

Le job doit se terminer sans erreur. Ouvre le log et vérifie que chaque département configuré a bien
été interrogé. Un message Telegram n'arrive que si un créneau réellement nouveau est trouvé — l'absence
de message ne veut pas dire que ça a échoué.

Le workflow tourne ensuite automatiquement toutes les 15 min via le cron défini dans
`.github/workflows/check-slots.yml`, sans action supplémentaire de ta part.

## Configuration

- **Ajouter/retirer un département** : modifier le tableau `DEPARTEMENTS` dans `worker/src/config.ts`
  (codes sur 3 chiffres, zero-paddés, ex: `"078"`).
- **Changer les fenêtres de pointe ou la fréquence** : modifier `PEAK_WINDOWS`,
  `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` dans `worker/src/config.ts`.
  Ces heures sont interprétées en heure de Paris (CET/CEST géré automatiquement).
- **Changer le délai entre appels API** : `MIN_DELAY_MS` / `MAX_DELAY_MS` dans `worker/src/config.ts`.

## Sécurité

Ton email, ton mot de passe, le cookie de session, et tout autre identifiant ne sont jamais stockés,
loggés, ni commités ailleurs que dans les secrets GitHub Actions de ton propre repo — ils ne sont
utilisés qu'en mémoire, le temps du run. Le fichier d'état lu par le dashboard (`creneaux.json`) ne
contient que département, centre, date, heure, et horodatage de dernière vérification.

## Tests

```bash
cd worker && npm test
cd web && npm test
```
