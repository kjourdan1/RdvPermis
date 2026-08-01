# Headed real Chrome on GitHub-hosted runners

## Problem

`check-slots.yml` currently fails to log in with `Login failed: page.fill: Timeout
30000ms exceeded ... waiting for locator('#username')`. This was previously
attributed to Cloudflare blocking datacenter/hosting IP ranges (GitHub Actions,
OVH VPS), so the workflow was moved to a self-hosted runner on the user's RPi4
(residential IP).

Confirmed 2026-08-01: the same failure reproduces from the RPi4's residential IP.
The `login-debug` artifact from that run shows the page actually served was still
Cloudflare's "Sorry, you have been blocked" page (IP `176.179.106.118`, a
residential address). Since a real browser opened manually from that same home
network loads the login form fine, the IP itself isn't the differentiator —
Playwright's **headless** Chromium is. This points at Cloudflare's bot
management scoring headless-automation signals (`navigator.webdriver`, absent
GPU/compositor behavior, etc.), not IP reputation, as the actual block trigger.

## Goal

Test whether swapping the automated browser from headless bundled Chromium to a
**headed real Chrome** (Playwright's `channel: 'chrome'`, `headless: false`,
driven under a virtual framebuffer) is enough to pass Cloudflare's challenge —
which would let the workflow move back to `ubuntu-latest` (GitHub-hosted)
runners, removing the need for a permanently-running residential-IP self-hosted
runner and making the project trivially forkable again (no infra to stand up,
just secrets).

## Non-goals

- Session-cookie/`storageState` replay (the alternative "capture a cleared
  session once, replay it on every run" approach) — only pursued as a fallback
  if this spec's approach still gets blocked. Separate spec if/when needed.
- Re-enabling the `schedule` cron trigger automatically. It stays
  `workflow_dispatch`-only until a human has confirmed headed Chrome actually
  beats Cloudflare across multiple real runs, not just one lucky pass.
- Touching anything downstream of `login()` (`checkSlots.ts`'s direct
  `fetch`-with-cookie-header calls) — this is scoped to the browser launch
  step only.
- Decommissioning the RPi4 runner registration — it just stops being required
  by this workflow; no action needed on the Pi itself either way.

## Design

### Browser launch (`worker/src/login.ts`)

```diff
- const browser = await chromium.launch({ headless: true });
+ const browser = await chromium.launch({ headless: false, channel: 'chrome' });
```

- `channel: 'chrome'` uses the real Google Chrome binary instead of Playwright's
  bundled Chromium build, which carries fewer headless-Chromium-specific
  automation fingerprints.
- `headless: false` removes the headless-mode signal class entirely. Nothing
  needs to actually watch the screen — CI supplies a virtual display (see
  below) so this still runs unattended.
- No other change to `login.ts`: same selectors, same cookie extraction, same
  diagnostic screenshot/HTML capture on failure (still valuable if this also
  gets blocked — it'll show whether it's still literally the Cloudflare page).

### CI workflow (`.github/workflows/check-slots.yml`)

- `runs-on: ubuntu-latest` — back to GitHub-hosted, dropping the
  `[self-hosted, linux]` label requirement.
- Browser install step becomes `npx playwright install --with-deps chrome`
  (channel install) instead of `... chromium`.
- Add an Xvfb install/step so `headless: false` has somewhere to render on a
  GitHub-hosted runner (no real display attached): `sudo apt-get update && sudo
  apt-get install -y xvfb`.
- Wrap the run step: `run: xvfb-run -a npm run run` instead of `npm run run`
  directly — `xvfb-run` starts a virtual `$DISPLAY`, runs the command, and
  tears it down after.
- Checkout, `setup-node`, `npm ci`, and the failure-artifact upload step are
  unchanged.

### Local/dev impact

- On a developer machine with a real display, headed Chrome just opens a
  visible (if unwatched) window — harmless.
- On a headless dev/sandbox environment, `npm run run` needs the same
  `xvfb-run -a` wrapper as CI. Document this in the README's local-dev section
  alongside the existing self-hosted-runner instructions (which get marked
  superseded/optional pending verification, not deleted, in case this
  approach doesn't pan out).

### Verification

1. `npm run typecheck` && `npm test` stay green — no logic changed beyond
   launch options, `formatCookieHeader`'s existing unit tests are unaffected.
2. Trigger `workflow_dispatch` manually on `ubuntu-latest` and watch the run.
3. Does `login()` get past `#username`/`#password`/submit and reach
   `waitForURL` back on `candidat.permisdeconduire.gouv.fr`?
   - **Success** → proceed (separate, deliberate follow-up, not part of this
     plan) to re-enable the `schedule` trigger and update the README to drop
     the self-hosted-runner requirement.
   - **Failure** → inspect the new `login-failure.png`/`.html`. If it's still
     literally the Cloudflare block page, this fingerprint-level fix wasn't
     sufficient on its own — fall back to the session-cookie-replay approach
     (separate spec, not written yet).
4. Don't trust a single pass: Cloudflare bot scoring can be adaptive/
   probabilistic. Trigger a handful of `workflow_dispatch` runs spread over
   30-60 minutes before concluding it's reliable.

### Rollback

If headed Chrome doesn't help: revert `login.ts`'s launch options to
`headless: true` (drop `channel`), revert the Playwright install step back to
`chromium`, drop the `xvfb-run` wrapper, and move to the session-cookie-replay
design instead. No state/data migration either way — this is purely a
launch-option and CI-step change with no persisted-state implications.
