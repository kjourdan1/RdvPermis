# RdvPermis

Vérification automatique des créneaux d'examen du permis de conduire en candidat libre (candidat.permisdeconduire.gouv.fr)
pour les départements 78, 91, 92, 93, 94, 95, 27, 28, 60, 45 (éditable). Le service détecte et affiche les
disponibilités mais ne réserve pas automatiquement.

## Fonctionnement

- `worker/` s'exécute uniquement dans un workflow GitHub Actions planifié toutes les 15 minutes. Il se
  connecte via Playwright, interroge l'API interne des créneaux pour chaque département, notifie sur
  Telegram les créneaux réellement nouveaux, et écrit l'état complet dans Vercel Blob.
- `web/` est un dashboard Next.js déployé sur Vercel qui lit cet état et l'affiche, sans authentification.

## Déployer sa propre instance

Chaque déploiement est indépendant : le worker se connecte avec le compte personnel
candidat.permisdeconduire.gouv.fr (email + mot de passe) de l'utilisateur et notifie son propre bot
Telegram. Aucune donnée n'est partagée ni ne transite par un serveur tiers.

### Contrainte obligatoire : blocage Cloudflare des IP non résidentielles

Le site cible protège son formulaire de connexion avec Cloudflare, qui bloque l'ensemble des plages
d'IP de type datacenter/hébergeur, quel que soit le fingerprint du navigateur utilisé. Cela inclut :

- les runners GitHub-hosted standards (`ubuntu-latest` et équivalents) ;
- les VPS et serveurs cloud (OVH, AWS, Azure, etc.), même correctement configurés.

Seules les IP résidentielles ou mobiles atteignent le formulaire de connexion. **Un runner self-hosted** installé sur un appareil avec une IP résidentielle est donc obligatoire pour que le workflow GitHub Actions fonctionne.
Un Raspberry Pi connecté à une box internet personnelle convient parfaitement à cet usage.

### Prérequis

- Un compte GitHub, avec [le CLI `gh`](https://cli.github.com/) installée et authentifiée
  (`gh auth login`).
- Un compte [Vercel](https://vercel.com) (gratuit), avec le CLI `vercel` installée
  (`npm install -g vercel`).
- Node.js 20 ou supérieur en local, pour exécuter les tests ou le dashboard en développement.
- Un compte candidat sur candidat.permisdeconduire.gouv.fr (celui utilisé normalement pour réserver
  l'examen) : son email et son mot de passe servent à la connexion automatique du worker.
- Un appareil disponible en permanence sur un réseau résidentiel (Raspberry Pi, mini-PC, poste
  personnel laissé allumé, etc.) pour héberger le runner self-hosted (voir l'étape 2 ci-dessous).

## Sécurité

L'email, le mot de passe, le cookie de session, et tout autre identifiant ne sont jamais stockés,
loggés, ni commités ailleurs que dans les secrets GitHub Actions du repo concerné. Ils ne sont
utilisés qu'en mémoire, le temps de l'exécution. Le fichier d'état lu par le dashboard
(`creneaux.json`) ne contient que département, centre, date, heure, et horodatage de dernière
vérification.

### Étape 1 : Récupérer le code

Deux options :

- **Fork** (recommandé pour pouvoir récupérer les futures mises à jour) : cliquer sur *Fork* en haut
  de la page GitHub du repo, puis cloner le fork obtenu :
  ```bash
  git clone https://github.com/<compte-github>/RdvPermis.git
  cd RdvPermis
  ```
- **Copie indépendante** (nouveau repo sans lien avec l'original) :
  ```bash
  git clone https://github.com/kjourdan1/RdvPermis.git
  cd RdvPermis
  rm -rf .git && git init
  gh repo create RdvPermis-IDF --public --source=. --remote=origin --push
  ```
  Remplacer `--public` par `--private` si le repo doit rester privé (voir la contrainte ci-dessus) :
  cela ne dispense pas d'installer un runner self-hosted.

### Étape 2 : Installer le runner self-hosted (obligatoire)

Le workflow `.github/workflows/check-slots.yml` cible déjà `runs-on: [self-hosted, linux]` : aucune
modification du workflow n'est nécessaire, seul un runner correspondant doit être enregistré sur le
repo.

**Exemple avec un Raspberry Pi 4B (Raspberry Pi OS 64 bits) :**

1. Installer Raspberry Pi OS 64 bits sur le Pi et le connecter à la box internet du domicile (Ethernet
   recommandé pour la stabilité). S'assurer que le Pi reste allumé et connecté en permanence : le
   workflow tourne toutes les 15 minutes, 24h/24.
2. Sur le repo GitHub (celui créé à l'étape 1), ouvrir **Settings → Actions → Runners → New
   self-hosted runner**, choisir `Linux` / `ARM64`, et relever la commande d'enregistrement affichée
   (ou générer un jeton depuis un poste authentifié avec `gh` : `gh api -X POST
   repos/<compte>/<depot>/actions/runners/registration-token --jq '.token'`).
3. Sur le Pi, télécharger et préparer le runner (adapter `<tag>` à la dernière version publiée sur
   [github.com/actions/runner/releases](https://github.com/actions/runner/releases)) :
   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-arm64.tar.gz -L \
     https://github.com/actions/runner/releases/download/<tag>/actions-runner-linux-arm64-<version>.tar.gz
   tar xzf actions-runner-linux-arm64.tar.gz
   ./bin/installdependencies.sh
   ```
4. Enregistrer le runner sur le repo, avec le jeton d'enregistrement obtenu au point précédent :
   ```bash
   ./config.sh --url https://github.com/<compte>/<depot> --token <TOKEN> \
     --labels self-hosted,linux --unattended
   ```
5. Installer et démarrer le runner comme service systemd, pour qu'il redémarre automatiquement avec
   le Pi :
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```
6. Vérifier que le runner apparaît en ligne dans **Settings → Actions → Runners** du repo (statut
   `Idle`), avec les labels `self-hosted` et `linux`.

Cette procédure est identique pour tout autre appareil résidentiel (mini-PC, poste personnel sous
Linux), seule l'architecture du tarball change (`arm64` pour un Raspberry Pi, `x64` pour un PC
classique).

### Étape 3 : Créer le bot Telegram

Procédure détaillée disponible dans
[ce gist](https://gist.github.com/nafiesl/4ad622f344cd1dc3bb1ecbe468ff9f8a) ; résumé ci-dessous pour
le cas d'usage de ce projet (notification en message privé).

1. Dans Telegram, ouvrir une conversation avec [`@BotFather`](https://t.me/BotFather) et cliquer sur
   **Start**.
2. Envoyer `/newbot` et suivre les instructions : d'abord un nom d'affichage (libre), puis un
   identifiant technique se terminant obligatoirement par `bot` (par exemple `rdvpermis_kj_bot`).
3. BotFather renvoie un message contenant un jeton du type
   `123456789:ABCdefGhIJKlmnoPQRstuVwxyZ` : c'est le `TELEGRAM_BOT_TOKEN`. Le conserver, il n'est
   affiché qu'une fois (il reste néanmoins récupérable ensuite via `/mybots` → bot concerné → **API
   Token**).
4. Ouvrir une conversation avec le bot nouvellement créé (chercher son identifiant dans Telegram) et
   cliquer sur **Start**, ou lui envoyer n'importe quel message. Cette étape est nécessaire pour que
   Telegram enregistre une conversation entre le compte personnel et le bot.
5. Récupérer le `TELEGRAM_CHAT_ID` correspondant à cette conversation :
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"
   ```
   Chercher la valeur numérique `result[0].message.chat.id` dans la réponse JSON (un nombre, positif
   pour une conversation privée). Si la réponse est vide (`"result":[]`), c'est que l'étape 4 n'a pas
   été effectuée ou que le message envoyé est trop ancien (Telegram ne conserve les mises à jour non
   lues que 24h) : renvoyer un message au bot et réessayer.
6. Vérifier que tout fonctionne en envoyant un message de test directement à l'API :
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage?chat_id=<TELEGRAM_CHAT_ID>&text=test"
   ```
   Le message « test » doit apparaître dans la conversation avec le bot.

### Étape 4 : Créer le compte Vercel et le store Blob

1. Créer un compte sur [vercel.com](https://vercel.com/signup) si nécessaire (l'offre gratuite
   « Hobby » suffit pour ce projet), en s'authentifiant de préférence avec le même compte GitHub que
   celui utilisé pour le repo : cela simplifie la liaison du projet à l'étape 6.
2. Sur le [dashboard Vercel](https://vercel.com/dashboard), ouvrir l'onglet **Storage**, puis
   **Create Database → Blob**.
3. Donner un nom au store (par exemple `rdvpermis-state`), choisir une région, et le créer.
4. Une fois le store créé, ouvrir son onglet **Quickstart** ou **`.env.local`** : le jeton affiché
   sous la forme `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...` est le jeton à utiliser aux étapes 5 et 6.
   Ce jeton donne un accès en lecture/écriture au store : à traiter comme un secret, au même titre
   qu'un mot de passe.

### Étape 5 : Poser les secrets GitHub Actions

Depuis le dossier du repo (celui créé à l'étape 1), avec `gh` authentifié sur le compte GitHub
propriétaire du repo :

```bash
gh secret set EMAIL --body "<email du compte candidat.permisdeconduire.gouv.fr>"
gh secret set PASSWORD --body "<mot de passe de ce compte>"
gh secret set TELEGRAM_BOT_TOKEN --body "<jeton recu de BotFather>"
gh secret set TELEGRAM_CHAT_ID --body "<chat_id recupere via getUpdates>"
gh secret set BLOB_READ_WRITE_TOKEN --body "<jeton du store Blob>"
```

Ces valeurs ne doivent **jamais** être écrites dans un fichier versionné, un message de commit, ni
collées dans une conversation : elles doivent uniquement être transmises à `gh secret set`, qui les
envoie chiffrées à GitHub.

### Étape 6 : Déployer le dashboard sur Vercel

```bash
cd web
vercel link --yes
vercel env add BLOB_READ_WRITE_TOKEN production
# coller le même jeton que celui de l'étape 4
vercel --prod
```

Une URL de production est affichée (par exemple `https://projet.vercel.app`) : il s'agit du dashboard
public.

### Étape 7 : Vérifier que tout fonctionne

```bash
gh workflow run "Check RdvPermis slots"
gh run watch
```

Le job doit se terminer sans erreur et doit indiquer qu'il s'est exécuté sur le runner self-hosted
enregistré à l'étape 2 (visible dans le log « Set up job »). Ouvrir le log et vérifier que chaque
département configuré a bien été interrogé. Un message Telegram n'arrive que si un créneau réellement
nouveau est trouvé : l'absence de message ne signifie pas que l'exécution a échoué.

Le workflow s'exécute ensuite automatiquement toutes les 15 minutes via le cron défini dans
`.github/workflows/check-slots.yml`, sans action supplémentaire. À noter : GitHub désactive
automatiquement les workflows planifiés (`schedule`) après 60 jours sans activité sur le repo. Un
`git push`, même minime, suffit à réactiver le cron le cas échéant.

## Configuration

- **Ajouter ou retirer un département** : modifier le tableau `DEPARTEMENTS` dans
  `worker/src/config.ts` (codes sur 3 chiffres, zero-paddés, par exemple `"078"`).
- **Changer les fenêtres de pointe ou la fréquence** : modifier `PEAK_WINDOWS`,
  `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` dans `worker/src/config.ts`. Ces
  heures sont interprétées en heure de Paris (CET/CEST géré automatiquement).
- **Changer le délai entre appels API** : `MIN_DELAY_MS` / `MAX_DELAY_MS` dans `worker/src/config.ts`.

## Tests

```bash
cd worker && npm test
cd web && npm test
```
