# RdvPermis-IDF

Vérification automatique des créneaux d'examen du permis de conduire (candidat.permisdeconduire.gouv.fr)
pour les départements 78, 91, 92, 93, 94, 95, 27, 28, 60, 45. Vérifie et affiche la disponibilité —
ne réserve jamais automatiquement.

## Comment ça marche

- `worker/` tourne uniquement dans un workflow GitHub Actions planifié toutes les 15 min. Il se connecte
  via Playwright, interroge l'API interne des créneaux pour chaque département, notifie sur Telegram
  uniquement les créneaux réellement nouveaux, et écrit l'état complet dans Vercel Blob.
- `web/` est un dashboard Next.js déployé sur Vercel qui lit cet état et l'affiche, sans authentification.

## Déploiement depuis zéro

1. **Bot Telegram** : parler à `@BotFather` sur Telegram, `/newbot`, récupérer le token. Envoyer un
   message au bot, puis `curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` pour récupérer le
   `chat_id`.
2. **Vercel Blob** : dashboard Vercel → Storage → Create Database → Blob. Copier le
   `BLOB_READ_WRITE_TOKEN`.
3. **Repo GitHub** : `gh repo create RdvPermis-IDF --public --source=. --remote=origin --push`.
4. **Secrets GitHub Actions** :
   ```bash
   gh secret set EMAIL --body "<votre-email-de-connexion>"
   gh secret set PASSWORD --body "<votre-mot-de-passe>"
   gh secret set TELEGRAM_BOT_TOKEN --body "<votre-token-bot>"
   gh secret set TELEGRAM_CHAT_ID --body "<votre-chat-id>"
   gh secret set BLOB_READ_WRITE_TOKEN --body "<votre-token-blob>"
   ```
5. **Déploiement Vercel** :
   ```bash
   cd web
   vercel link --yes
   vercel env add BLOB_READ_WRITE_TOKEN production
   vercel --prod
   ```
6. Déclencher un premier run manuel : `gh workflow run "Check RdvPermis slots"` puis `gh run watch`.

## Configuration

- **Ajouter/retirer un département** : modifier le tableau `DEPARTEMENTS` dans `worker/src/config.ts`
  (codes sur 3 chiffres, zero-paddés, ex: `"078"`).
- **Changer les fenêtres de pointe ou la fréquence** : modifier `PEAK_WINDOWS`,
  `PEAK_CHECK_INTERVAL_MINUTES`, `OFF_PEAK_CHECK_INTERVAL_MINUTES` dans `worker/src/config.ts`.
  Ces heures sont interprétées en heure de Paris (CET/CEST géré automatiquement).
- **Changer le délai entre appels API** : `MIN_DELAY_MS` / `MAX_DELAY_MS` dans `worker/src/config.ts`.

## Sécurité

Aucun identifiant, cookie de session ou donnée personnelle n'est stocké ailleurs que dans les secrets
GitHub Actions. Le fichier d'état lu par le dashboard (`creneaux.json`) ne contient que département,
centre, date, heure, et horodatage de dernière vérification.

## Tests

```bash
cd worker && npm test
cd web && npm test
```
