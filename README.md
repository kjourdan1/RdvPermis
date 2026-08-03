# RdvPermis

Vérification automatique des créneaux d'examen du permis de conduire en candidat libre
(candidat.permisdeconduire.gouv.fr) sur les **8 départements d'Île-de-France et leurs 8
départements limitrophes** (16 au total). Le service détecte et affiche les disponibilités, y
compris les nouvelles depuis la dernière vérification, mais ne réserve rien automatiquement : c'est
à l'utilisateur d'aller réserver lui-même une fois un créneau repéré.

Deux façons de suivre les alertes :

- **Le dashboard public**, sans authentification : <https://web-delta-seven-90.vercel.app>
- **Le groupe Telegram**, qui reçoit les mêmes alertes en temps réel dès qu'un créneau réellement
  nouveau apparaît : `[LIEN DU GROUPE TELEGRAM À AJOUTER]`

## Sécurité

- L'email, le mot de passe, le cookie de session, et tout autre identifiant ne sont **jamais**
  stockés, loggés, ni commités : ils ne transitent qu'en mémoire, le temps d'une exécution, via les
  secrets GitHub Actions du repo. Voir « Le conteneur de login » ci-dessous pour le détail de ce
  qui est fait de ces identifiants pendant le run.
- Le fichier d'état lu par le dashboard (le store Vercel Blob) ne contient que département, centre,
  date, heure, indicateur « nouveau », et horodatage de dernière vérification — aucune donnée
  personnelle.
- Le dashboard est public et sans authentification, mais en lecture seule : rien n'y transite vers
  le worker, il ne fait qu'afficher le dernier état écrit par celui-ci. Sélectionner des
  départements dans l'interface ne change que ce qui s'affiche localement, jamais ce que le worker
  vérifie côté serveur.
- Ce projet automatise un usage personnel légitime (surveiller son propre accès à un service
  public) et n'effectue aucune réservation ni action pour le compte d'un tiers. Chaque déploiement
  est indépendant et n'utilise que les identifiants de son propre exploitant — voir « Déployer sa
  propre instance » plus bas.

## Fonctionnement

- `worker/` s'exécute uniquement dans un workflow GitHub Actions planifié (toutes les 15 min en
  heures de pointe, une fois par heure le reste du temps). Il obtient un cookie de session valide
  via un conteneur de login dédié (voir ci-dessous), interroge l'API interne des créneaux pour
  chacun des 16 départements d'Île-de-France + limitrophes, notifie sur Telegram les créneaux
  réellement nouveaux, et écrit l'état complet dans Vercel Blob. Le périmètre a couvert les 101
  départements français un temps, mais a été ramené à l'IDF + voisins le 2026-08-03 après que le
  compte s'est fait bloquer par le contrôle anti-abus du site lui-même (« Nombre maximum de
  requêtes atteint ») — voir `docs/sessions/` pour le détail de l'incident.
- `web/` est un dashboard Next.js déployé sur Vercel qui lit cet état et l'affiche, sans
  authentification.

### Le conteneur de login

Le formulaire de connexion du site est protégé par Cloudflare Turnstile, qui bloque toute
automatisation pilotée via le Chrome DevTools Protocol (CDP) — donc tout ce qui repose sur
Playwright ou Puppeteer classiques, quels que soient les efforts de camouflage du navigateur.
`worker/src/login.ts` (Playwright) existe encore dans le repo mais n'est plus utilisé — c'est du
code mort, conservé par prudence.

La solution retenue, dans `worker/login-container/` : un conteneur Docker qui lance un vrai serveur
X (Xorg, avec accès direct au GPU du Raspberry Pi via `/dev/dri`) et un Chromium **sans aucun flag
d'automatisation**, piloté entièrement au niveau du serveur X par `xdotool` (souris et clavier
synthétiques via XTest — indiscernables d'une vraie entrée matérielle pour tout ce qui tourne
au-dessus du serveur X, CDP y compris son absence). Le rendu GPU réel évite aussi le fallback de
rendu logiciel que Turnstile peut détecter. Une fois connecté, le cookie de session est extrait via
l'onglet Network des DevTools (les cookies d'authentification sont `HttpOnly`, donc invisibles à
`document.cookie`) plutôt que par déchiffrement du store Chromium. Ce cookie est ensuite masqué
(`::add-mask::`) et passé en variable d'environnement au reste du workflow — voir
`.github/workflows/check-slots.yml`.

Cette approche fonctionne, mais deux points sont à garder en tête si vous la reproduisez :

- Elle est **calibrée en coordonnées pixel** pour la mise en page actuelle du site, à une
  résolution de fenêtre fixe. Un changement de mise en page côté
  candidat.permisdeconduire.gouv.fr cassera le script (`worker/login-container/run.sh`, très
  commenté) jusqu'à recalibrage manuel des coordonnées. Chaque run laisse des captures d'écran de
  chaque étape en artefact GitHub Actions (`login-diagnostics-*`) en cas d'échec — c'est le premier
  endroit où regarder.
- Elle nécessite un **vrai GPU accessible en passthrough** au conteneur (pas de VM sur ce genre de
  matériel : pas de passthrough GPU propre, retombe sur du logiciel). Voir « Étape 3 » plus bas pour
  les prérequis matériels et la configuration du Raspberry Pi.

## Dashboard

`[SCREENSHOT DU DASHBOARD À AJOUTER ICI, ex: docs/screenshot-dashboard.png]`

Le dashboard (<https://web-delta-seven-90.vercel.app>) affiche, pour les départements sélectionnés,
les créneaux disponibles groupés par département, avec :

- un badge « Nouveau » sur les créneaux détectés depuis la dernière vérification ;
- un sélecteur de département en liste déroulante (recherche par nom ou code, pliage des accents —
  taper « rhone » trouve « Rhône ») ;
- un raccourci « Île-de-France + départements voisins » épinglé en tête de cette liste, qui
  remplace la sélection courante par l'IDF et les 8 départements limitrophes en un clic ;
- un bouton « Réserver mon examen », qui renvoie directement vers l'espace candidat officiel
  (<https://candidat.permisdeconduire.gouv.fr/reservation>) — ce dashboard ne réserve rien
  lui-même, il ne fait que signaler la disponibilité.

La sélection de départements est portée par l'URL (`?dep=075,077,...`), donc partageable telle
quelle : envoyer un lien avec sa propre sélection à quelqu'un d'autre lui affiche la même vue.

## Déployer sa propre instance

Chaque déploiement est indépendant : le worker se connecte avec le compte personnel
candidat.permisdeconduire.gouv.fr (email + mot de passe) de l'utilisateur et notifie son propre bot
Telegram. Aucune donnée n'est partagée ni ne transite par un serveur tiers.

### Contrainte obligatoire : IP résidentielle + GPU réel

Le site cible protège son formulaire de connexion avec Cloudflare, qui bloque l'ensemble des plages
d'IP de type datacenter/hébergeur, quel que soit le fingerprint du navigateur utilisé. Cela exclut :

- les runners GitHub-hosted standards (`ubuntu-latest` et équivalents) ;
- les VPS et serveurs cloud (OVH, AWS, Azure, etc.), même correctement configurés — y compris ceux
  avec un GPU virtuel, qui ne fournit pas un vrai passthrough matériel.

Deux prérequis matériels sont donc obligatoires, sur le **même appareil** :

1. Une **IP résidentielle ou mobile** : un runner self-hosted sur un appareil connecté à une box
   internet personnelle.
2. Un **GPU accessible en passthrough Docker** (`/dev/dri`), pour le conteneur de login (voir
   « Le conteneur de login » plus haut) — pas seulement un CPU, le rendu logiciel est lui-même un
   signal détectable par Turnstile.

Un Raspberry Pi 4B (avec son GPU VideoCore intégré) connecté à une box internet personnelle
convient parfaitement à cet usage, et c'est la configuration utilisée en production pour ce projet.

### Prérequis

- Un compte GitHub, avec [le CLI `gh`](https://cli.github.com/) installée et authentifiée
  (`gh auth login`).
- Un compte [Vercel](https://vercel.com) (gratuit), avec le CLI `vercel` installée
  (`npm install -g vercel`).
- Node.js 20 ou supérieur en local, pour exécuter les tests ou le dashboard en développement.
- Un compte candidat sur candidat.permisdeconduire.gouv.fr (celui utilisé normalement pour réserver
  l'examen) : son email et son mot de passe servent à la connexion automatique du worker.
- Un appareil résidentiel avec GPU (Raspberry Pi 4B ou équivalent) disponible en permanence, pour
  héberger le runner self-hosted et le conteneur de login (voir les étapes 2 et 3 ci-dessous).

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
  gh repo create RdvPermis --public --source=. --remote=origin --push
  ```
  Remplacer `--public` par `--private` si le repo doit rester privé (voir la contrainte ci-dessus) :
  cela ne dispense pas d'installer un runner self-hosted.

### Étape 2 : Installer le runner self-hosted (obligatoire)

Le workflow `.github/workflows/check-slots.yml` cible déjà `runs-on: [self-hosted, rdvpermis]` :
aucune modification du workflow n'est nécessaire, seul un runner correspondant doit être enregistré
sur le repo.

**Exemple avec un Raspberry Pi 4B (Raspberry Pi OS ou DietPi 64 bits) :**

1. Installer le système sur le Pi et le connecter à la box internet du domicile (Ethernet
   recommandé pour la stabilité). S'assurer que le Pi reste allumé et connecté en permanence : le
   workflow tourne 24h/24 (toutes les 15 min en heures de pointe, une fois par heure le reste du
   temps -- voir `.github/workflows/check-slots.yml`).
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
4. Enregistrer le runner sur le repo, avec le jeton d'enregistrement obtenu au point précédent, et
   un label supplémentaire `rdvpermis` (utilisé par le workflow pour cibler précisément cette
   machine) :
   ```bash
   ./config.sh --url https://github.com/<compte>/<depot> --token <TOKEN> \
     --labels self-hosted,rdvpermis --unattended
   ```
5. Installer et démarrer le runner comme service systemd, pour qu'il redémarre automatiquement avec
   le Pi :
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```
6. Vérifier que le runner apparaît en ligne dans **Settings → Actions → Runners** du repo (statut
   `Idle`), avec les labels `self-hosted` et `rdvpermis`.

Cette procédure est identique pour tout autre appareil résidentiel avec GPU, seule l'architecture
du tarball change (`arm64` pour un Raspberry Pi, `x64` pour un PC classique).

**Repo public : pas de trigger `pull_request`.** Ce workflow ne se déclenche que sur `schedule` et
`workflow_dispatch`, jamais sur `pull_request`/`pull_request_target` — un self-hosted runner sur un
repo public qui réagirait à des PR externes exécuterait du code arbitraire venu d'un fork. Ne pas
ajouter ce genre de trigger sur ce workflow.

### Étape 3 : Configurer Docker et le GPU pour le conteneur de login

Le conteneur de login (voir « Le conteneur de login » plus haut) a besoin d'un accès direct au GPU
du Pi — cette étape est ce qui, en pratique, fait ou casse le contournement de Turnstile.

1. Installer Docker sur le Pi (ex. `curl -fsSL https://get.docker.com | sh`), puis ajouter
   l'utilisateur qui fait tourner le runner au groupe `docker` (`sudo usermod -aG docker <user>`,
   puis se reconnecter) pour piloter le démon sans `sudo`.
2. **Désactiver tout bureau graphique ou serveur VNC actif sur le Pi.** Un seul processus à la fois
   peut détenir le « DRM master » sur la carte graphique : si un bureau (XFCE, etc.) ou un serveur
   VNC tourne déjà et détient le GPU, le conteneur échoue au démarrage de son propre serveur X avec
   `drmSetMaster failed: Permission denied`. Un Pi dédié à ce runner devrait démarrer directement en
   CLI (pas de bureau au boot).
3. Vérifier que le device GPU est bien présent : `ls -l /dev/dri` doit lister au moins une entrée
   (`card0`, `renderD128`, ...). C'est ce device que `docker run --device /dev/dri:/dev/dri` (déjà
   dans le workflow) passe au conteneur.
4. **Sur un Raspberry Pi 4 avec deux ports HDMI**, les réglages de `config.txt`
   (`/boot/firmware/config.txt`) sans suffixe de port (ex. `hdmi_force_hotplug=1`) ne s'appliquent
   qu'au port HDMI 0. Si le conteneur cible le port 1 (`HDMI-2`, comme dans
   `worker/login-container/run.sh`), forcer ce port explicitement pour qu'il rapporte une résolution
   fixe même sans écran physique branché, en ajoutant au fichier :
   ```
   hdmi_force_hotplug:1=1
   hdmi_group:1=1
   hdmi_mode:1=16
   ```
   (`hdmi_mode:1=16` force le mode CEA 16, soit 1920×1080@60, indépendamment de tout EDID.)
   Redémarrer le Pi pour appliquer. Sans ce réglage, tant qu'un écran reste branché sur ce port tout
   fonctionne (l'EDID de l'écran fournit la résolution) — le problème n'apparaît que le jour où
   l'écran est débranché, et se manifeste par un échec silencieux de `xrandr` dans les logs du
   conteneur puis des clics `xdotool` qui ratent leur cible (résolution retombée à 1024×768 par
   défaut). Vérifier après coup avec `cat /sys/class/drm/card1-HDMI-A-2/status` (doit afficher
   `connected`) et `docker run --rm --device /dev/dri:/dev/dri rdvpermis-login` en test manuel.

### Étape 4 : Créer le bot Telegram

Procédure détaillée disponible dans
[ce gist](https://gist.github.com/nafiesl/4ad622f344cd1dc3bb1ecbe468ff9f8a) ; résumé ci-dessous pour
le cas d'usage de ce projet (notification en message privé — pour notifier un groupe à la place,
voir la note en fin d'étape).

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

**Pour notifier un groupe plutôt qu'une conversation privée** : créer un groupe Telegram, y ajouter
le bot, lui donner les droits nécessaires pour poster, puis lui envoyer un message dans le groupe et
reprendre l'étape 5 — `result[0].message.chat.id` sera alors négatif (identifiant de groupe), à
utiliser tel quel comme `TELEGRAM_CHAT_ID`.

### Étape 5 : Créer le compte Vercel et le store Blob

1. Créer un compte sur [vercel.com](https://vercel.com/signup) si nécessaire (l'offre gratuite
   « Hobby » suffit pour ce projet), en s'authentifiant de préférence avec le même compte GitHub que
   celui utilisé pour le repo : cela simplifie la liaison du projet à l'étape 7.
2. Sur le [dashboard Vercel](https://vercel.com/dashboard), ouvrir l'onglet **Storage**, puis
   **Create Database → Blob**.
3. Donner un nom au store (par exemple `rdvpermis-state`), choisir une région, et le créer en accès
   **public** (le contenu — liste de créneaux, aucune donnée sensible — doit être lisible par le
   dashboard sans authentification ; l'écriture reste protégée par `BLOB_READ_WRITE_TOKEN`).
4. Une fois le store créé, ouvrir son onglet **Quickstart** ou **`.env.local`** : le jeton affiché
   sous la forme `BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...` est le jeton à utiliser aux étapes 6 et
   7. Ce jeton donne un accès en lecture/écriture au store : à traiter comme un secret, au même
   titre qu'un mot de passe.

### Étape 6 : Poser les secrets GitHub Actions

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

### Étape 7 : Déployer le dashboard sur Vercel

```bash
cd web
vercel link --yes
vercel env add BLOB_READ_WRITE_TOKEN production
# coller le même jeton que celui de l'étape 5
vercel --prod
```

Une URL de production est affichée (par exemple `https://projet.vercel.app`) : il s'agit du dashboard
public.

### Étape 8 : Vérifier que tout fonctionne

```bash
gh workflow run "Check RdvPermis slots"
gh run watch
```

Le job doit se terminer sans erreur et doit indiquer qu'il s'est exécuté sur le runner self-hosted
enregistré à l'étape 2 (visible dans le log « Set up job »). En cas d'échec à l'étape « Log in and
extract a fresh session cookie », télécharger l'artefact `login-diagnostics-*` du run : il contient
une capture d'écran de chaque étape du login, le premier endroit où chercher la cause (mauvaise
résolution, page qui n'a pas fini de charger, mise en page du site qui a changé — voir « Le
conteneur de login » plus haut). Un message Telegram n'arrive que si un créneau réellement nouveau
est trouvé : l'absence de message ne signifie pas que l'exécution a échoué.

Le workflow s'exécute ensuite automatiquement via les crons définis dans
`.github/workflows/check-slots.yml` : toutes les 15 min pendant les heures de pointe (8h-9h,
11h-14h, 16h-18h heure de Paris), une fois par heure le reste du temps -- pour limiter le volume de
requêtes global. Ces horaires sont codés en dur en UTC (le cron GitHub Actions ne connaît pas les
fuseaux horaires) et doivent être décalés d'une heure à chaque changement d'heure -- voir le
commentaire dans le fichier de workflow. À noter : GitHub désactive automatiquement les workflows
planifiés (`schedule`) après 60 jours sans activité sur le repo. Un `git push`, même minime, suffit
à réactiver le cron le cas échéant.

## Configuration

- **Ajouter ou retirer un département** : modifier le tableau `DEPARTEMENTS` dans
  `worker/src/config.ts` (codes sur 3 chiffres, zero-paddés, par exemple `"078"`). Le dashboard
  (`web/lib/departements.ts`) a sa propre copie de la liste complète (codes + noms) : la tenir à
  jour séparément si le périmètre du worker change.
- **Changer les fenêtres de pointe ou la fréquence** : modifier `PEAK_WINDOWS`,
  `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` dans `worker/src/config.ts`. Ces
  heures sont interprétées en heure de Paris (CET/CEST géré automatiquement). **Penser aussi** à
  mettre à jour les crons (en UTC, non ajustés automatiquement) dans
  `.github/workflows/check-slots.yml` pour que le déclenchement réel du workflow corresponde aux
  nouvelles fenêtres — sinon `worker/src/schedule.ts` continuera de sauter les checks hors-fenêtre,
  mais le conteneur de login (l'étape la plus coûteuse et la plus sensible côté détection) continuera
  de tourner à l'ancienne fréquence.
- **Changer le délai entre appels API** : `MIN_DELAY_MS` / `MAX_DELAY_MS` dans `worker/src/config.ts`.

## Tests

```bash
cd worker && npm test
cd web && npm test
```
