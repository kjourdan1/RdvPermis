# Diagnostic : blocage Cloudflare Turnstile sur le login, et orientation à suivre

## Contexte

`check-slots.yml` a été itéré plusieurs fois le 2026-08-01 pour faire passer le
login automatisé (`worker/src/login.ts`) sur `ubuntu-latest`, après l'échec de
la piste "IP résidentielle" (voir
`2026-07-31-self-hosted-runner-design.md` /
`2026-08-01-headed-chrome-github-hosted.md`). Chronologie des changements
testés, dans l'ordre, chacun ayant fait progresser l'échec un peu plus loin
dans le flux de login sans jamais l'achever :

1. **Chromium headless → Chrome headed (`channel: 'chrome'`) sous Xvfb.**
   Résultat : on ne reçoit plus la page de blocage statique Cloudflare
   ("Sorry, you have been blocked") — on atteint la vraie page de login
   Keycloak.
2. **`page.goto(..., { waitUntil: 'networkidle' })` → `'domcontentloaded'`.**
   Le `networkidle` timeoutait avant même que la page charge, à cause du
   trafic de fond continu (télémétrie, scripts de challenge). Résultat :
   `goto()` puis les deux `fill()` (email, mot de passe) réussissent.
3. **Ajout d'un clic sur "Tout accepter" (bannière cookies) avant de
   remplir le formulaire.** Hypothèse testée : la bannière empêchait le
   rendu du widget Turnstile. Résultat : la bannière disparaît bien
   (confirmé par capture d'écran), mais le blocage persiste à l'identique.

**État actuel :** le formulaire se remplit intégralement (email + mot de
passe), mais `page.click('#kc-login')` timeout après 30s car le bouton reste
`disabled`.

## Diagnostic technique

Le HTML capturé au moment de l'échec (`login-failure.html`, artefact
`login-debug`) montre :

```html
<div id="kc-captcha" class="g-recaptcha fr-mb-6v" data-size="normal"
     data-sitekey="0x4AAAAAAAS8ALmRyWxvETE0"
     data-callback="enableLoginButton"
     data-expired-callback="disableLoginButton" ...>
  <div>
    <input type="hidden" name="cf-turnstile-response" ...>
    <input type="hidden" name="g-recaptcha-response" ...>
  </div>
</div>
<input disabled class="fr-btn fr-m-0" name="login" id="kc-login" ...>
```

Le conteneur `#kc-captcha` reste **vide** dans les deux dernières captures
(avant et après le clic sur la bannière cookies) : le script Cloudflare
Turnstile (`challenges.cloudflare.com/turnstile/v0/api.js?compat=recaptcha`)
n'y a jamais injecté de widget. Sans rendu du widget, son callback
`enableLoginButton` n'est jamais appelé, et `#kc-login` reste désactivé
indéfiniment — ce n'est pas un ralentissement, c'est un état bloquant stable.

**Cause la plus probable :** Turnstile évalue le contexte du navigateur
(rendu WebGL/GPU, canvas, autres signaux matériels) avant de décider s'il
affiche un challenge. Sous Xvfb, Chrome utilise un rendu logiciel
(llvmpipe/SwiftShader) — une signature quasiment absente chez un utilisateur
réel et donc un signal fort d'automatisation/virtualisation. Le
comportement observé (aucun rendu, silence complet plutôt qu'un challenge
visible) est cohérent avec Turnstile choisissant de ne rien afficher du tout
à un contexte qu'il classe comme automatisé, plutôt que de présenter une
case à cocher.

Ce n'est plus le même type de blocage que les étapes précédentes (bannière
UI, stratégie d'attente réseau) : c'est le mécanisme anti-bot du site,
utilisé exactement pour l'usage qu'on essaie d'automatiser.

## Ce qu'il faut faire à partir d'ici

Le principe directeur pour toute solution à ce blocage : **l'authentification
doit être obtenue par une résolution humaine réelle du challenge Turnstile,
dans un navigateur natif, sur un poste avec un rendu graphique réel** — pas
par un navigateur piloté par script visant à se faire passer pour un humain
aux yeux du challenge. Une fois cette authentification obtenue
légitimement, la session qui en résulte (cookies) peut être réutilisée par
l'automatisation pour la suite des opérations, qui elles n'ont jamais besoin
de repasser par un navigateur : `worker/src/checkSlots.ts` fait déjà ses
requêtes de créneaux en HTTP direct avec l'en-tête de cookie obtenu au
login — `login()` est le seul point du pipeline qui pilote un navigateur, et
donc le seul point à remplacer.

Architecture à implémenter (reprend le principe déjà évoqué, "option
cookies") :

1. **Capture de session humaine.** Un script séparé (`export-session.ts`),
   exécuté manuellement par un humain dans un vrai navigateur (headed, sur
   poste avec rendu graphique natif — pas Xvfb), effectue le login réel
   (Turnstile se résout normalement, comme pour n'importe quel visiteur) puis
   exporte `context.storageState()` (cookies + storage) dans un fichier.
2. **Stockage du secret.** Le contenu de ce `storageState` est déposé comme
   secret GitHub Actions (`AUTH_STORAGE_STATE`), jamais committé en clair.
3. **Réutilisation en CI.** `login()` est modifié pour, si ce secret est
   présent, créer le contexte Playwright avec `storageState` directement
   (`browser.newContext({ storageState })`) et sauter le formulaire de login
   entièrement — plus de navigation vers la page de login, plus
   d'interaction avec Turnstile.
4. **Détection d'expiration.** Si la session capturée a expiré (redirection
   vers le login ou blocage détecté au premier appel HTTP), l'automatisation
   doit échouer explicitement avec un message demandant une nouvelle capture
   manuelle — pas de tentative de login scripté en secours, puisque c'est
   précisément ce qui est bloqué.
5. **Mesure de la durée de vie de la session.** Avant de considérer cette
   architecture fiable pour un cron, il faut mesurer empiriquement combien de
   temps un `storageState` capturé reste valide sur ce site (minutes, heures,
   jours ?) pour déterminer la fréquence de rafraîchissement manuel
   nécessaire, et si elle est compatible avec un usage sans intervention
   fréquente.
6. **Retour à `ubuntu-latest` sans Xvfb/Chrome headed.** Une fois
   l'authentification déportée à une capture humaine, le navigateur piloté
   en CI n'a plus besoin de contourner quoi que ce soit — `check-slots.yml`
   peut redevenir un simple `runs-on: ubuntu-latest`, sans dépendance à un
   runner résidentiel ni à un rendu graphique particulier.

## Points ouverts

- Durée de vie réelle du cookie de session / `cf_clearance` sur ce site :
  inconnue, à mesurer avant de committer sur cette approche pour un cron
  automatique.
- Process de capture pour les autres forkers du projet : à documenter dans
  le README une fois l'implémentation validée (actuellement, le README
  documente encore l'installation d'un runner self-hosted, qui n'est plus
  la voie recommandée).
