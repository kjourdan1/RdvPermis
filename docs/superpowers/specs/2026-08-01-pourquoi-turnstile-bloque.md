# Pourquoi le login automatisé se fait bloquer par Cloudflare Turnstile

Ce document reste au niveau du diagnostic : ce qu'on observe, et pourquoi
c'est probablement ça qui se passe. Il ne couvre pas comment faire en sorte
que le widget se rende pour un navigateur automatisé — cette question est
volontairement hors périmètre (voir
`2026-08-01-turnstile-blocker-diagnostic.md` pour l'orientation retenue à la
place).

## Ce qu'on observe (fait, pas hypothèse)

Sur `ubuntu-latest`, avec Chrome réel (`channel: 'chrome'`) piloté par
Playwright en mode headed sous Xvfb :

- La page de login se charge intégralement, les deux champs (email, mot de
  passe) se remplissent sans erreur.
- Le conteneur du widget Turnstile,
  `<div id="kc-captcha" class="g-recaptcha" data-sitekey="0x4AAAAAAAS8ALmRyWxvETE0" data-callback="enableLoginButton">`,
  reste **vide** — aucun iframe n'y est injecté, aucune erreur JS visible
  dans la capture. Le script `challenges.cloudflare.com/turnstile/v0/api.js`
  se charge (présent dans le `<head>`), mais ne produit aucun rendu visible
  dans ce conteneur.
- Sans rendu du widget, son callback `enableLoginButton` n'est jamais
  déclenché : le bouton `#kc-login` reste `disabled` en continu, ce n'est
  pas un simple ralentissement (30s d'attente ne change rien, l'état est
  stable).
- Deux causes candidates ont été testées et écartées empiriquement, chacune
  confirmée par une capture d'écran + HTML après correction :
  - **Attente réseau bloquante avant même le rendu du DOM**
    (`waitUntil: 'networkidle'`) : éliminée — en passant à
    `'domcontentloaded'`, la page se charge et le formulaire se remplit,
    mais le blocage sur `#kc-captcha` est strictement identique.
  - **Bannière de consentement cookies** masquant le widget : éliminée — la
    bannière est fermée par un clic explicite (confirmé visuellement, elle a
    disparu), le blocage reste identique au pixel près (même conteneur vide).

## Comment Turnstile décide (ou non) de s'afficher

Turnstile, comme la plupart des solutions anti-bot modernes, ne se limite
pas à vérifier une adresse IP : côté client, avant de choisir entre
"afficher un challenge interactif", "se valider silencieusement" ou "ne rien
afficher", le script évalue un ensemble de signaux du navigateur qui
l'exécute. Les catégories de signaux publiquement documentées comme
utilisées par ce type de protection incluent :

- **Le rendu graphique** (chaîne de caractères du renderer/vendor WebGL,
  empreinte de rendu canvas). Sous Xvfb, Chrome utilise un rendu logiciel
  (pas de véritable carte graphique) — une configuration quasiment absente
  chez un utilisateur grand public.
- **Les artefacts laissés par le protocole de pilotage du navigateur**
  (Chrome DevTools Protocol, CDP) : les frameworks d'automatisation comme
  Playwright pilotent Chrome via CDP, ce qui implique d'activer certains
  domaines de l'API (notamment `Runtime`) pour interagir avec la page —
  activation qui laisse une trace détectable côté page, une technique de
  détection publique et largement documentée par les éditeurs anti-bot.
- **La cohérence globale de l'environnement** : résolution d'écran,
  `navigator.hardwareConcurrency`, listes de plugins/formats multimédia
  disponibles, cohérence fuseau horaire/langue — un environnement de CI
  virtualisé en présente typiquement un sous-ensemble incohérent ou vide
  par rapport à un poste physique réel.
- **Le pattern d'interaction avec la page** : timing entre focus, frappe et
  clic, présence de mouvements de souris avant une action. `page.fill()` de
  Playwright pose la valeur du champ directement plutôt que de simuler une
  frappe touche par touche, ce qui diffère structurellement d'une saisie
  humaine.
- **La réputation de la plage IP/ASN** : déjà documentée dans une note
  précédente (datacenter vs résidentiel), mais elle ne suffit pas à elle
  seule à expliquer le blocage actuel — le même échec se reproduit depuis
  l'IP résidentielle du Raspberry Pi utilisé plus tôt dans cette
  investigation.

Le rendu logiciel observé sous Xvfb est le facteur le plus visible et le
moins ambigu parmi cette liste, mais il n'y a pas de raison de penser qu'il
agit seul plutôt qu'en combinaison avec les autres.

## Pourquoi on ne peut pas identifier LA cause exacte avec certitude

Turnstile ne renvoie aucun code d'erreur ni message de diagnostic
exploitable côté client quand il choisit de ne rien afficher — c'est un
choix délibéré du service : ne pas exposer ses critères, précisément pour
ne pas faciliter ce genre d'investigation. On ne dispose que d'une
observation binaire (le widget se rend ou non), jamais d'un score ni d'une
raison explicite. Toute affirmation sur le facteur déclencheur exact reste
donc une hypothèse informée à partir des signaux publiquement documentés
comme utilisés par ce type de protection, pas une certitude vérifiable de
l'extérieur.

## Ce que ça signifie structurellement

Le point commun entre toutes les causes plausibles listées ci-dessus, c'est
qu'elles décrivent des propriétés inhérentes à un navigateur piloté par une
automatisation exécutée dans un environnement de CI — par opposition à un
navigateur utilisé nativement par un humain sur son propre poste. Ce n'est
donc pas un bug ponctuel comparable aux deux précédents (stratégie
d'attente réseau, bannière cookies), qui se corrigeaient par un changement
de code local : c'est le comportement voulu du système de protection,
appliqué exactement à la catégorie de trafic que ce pipeline génère par
construction.
