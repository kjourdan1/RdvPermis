# Self-hosted GitHub Actions runner on VPS

## Problem

The scheduled worker (`check-slots.yml`) fails to log in when run on GitHub-hosted
runners: the login form never appears (timeout waiting for `#username`), even though
the same selector works when checked interactively. The likely cause is that
Cloudflare serves a bot-detection challenge to GitHub Actions' shared IP ranges
instead of the real login form (see commit `e9c08da`, which added diagnostic
screenshot/HTML capture on failure but hasn't yet confirmed the root cause).

## Goal

Run the existing `check-slots.yml` workflow on a self-hosted GitHub Actions runner
installed on the user's Ubuntu 24.04 VPS (`vps-6c2118f8.vps.ovh.net`,
137.74.170.209), instead of `ubuntu-latest`, to test whether a non-GitHub-Actions IP
avoids the Cloudflare challenge.

## Non-goals

- Rewriting the worker's orchestration, scheduling, or notification logic.
- Moving off GitHub Actions entirely (secrets management, cron scheduling, and
  workflow history all stay on GitHub).
- Multi-repo or organization-level runner (this runner is scoped to
  `kjourdan1/RdvPermis` only).

## Design

### Runner installation

- Official GitHub Actions runner (`actions/runner` release tarball), installed under
  `/home/ubuntu/actions-runner` on the VPS.
- Registered as a **repository-level** runner (not org-level) for
  `kjourdan1/RdvPermis`, using a short-lived registration token generated via
  `gh api repos/kjourdan1/RdvPermis/actions/runners/registration-token`.
- Installed as a `systemd` service (via the runner's bundled `svc.sh install`/`start`),
  running as the `ubuntu` user, so it survives reboots and restarts automatically if
  it crashes.
- Labelled `self-hosted, linux, rdvpermis` so only workflows that explicitly opt in
  target it.

### Workflow change

Single-line change in `.github/workflows/check-slots.yml`:

```diff
- runs-on: ubuntu-latest
+ runs-on: [self-hosted, linux, rdvpermis]
```

Everything else in the workflow (checkout, `npm ci`, `npx playwright install
--with-deps chromium`, `npm run run`, failure-artifact upload) stays unchanged. Since
the VPS is a persistent machine (unlike ephemeral GitHub-hosted runners), Playwright's
browser cache and npm's package cache persist between runs, so `playwright install`
and `npm ci` should get faster after the first run rather than needing extra caching
logic.

### Security

The repo is **public**. Self-hosted runners on public repos are a known risk when a
workflow can be triggered by a pull request from an external fork (arbitrary code
execution on the runner's host). This does not apply here: `check-slots.yml` only
has `schedule` and `workflow_dispatch` triggers — `workflow_dispatch` requires
write access to the repo, and `schedule` only ever runs the workflow file from the
default branch. Guardrail going forward: never add a `pull_request` or
`pull_request_target` trigger to a workflow that runs on this runner label.

### Verification

1. Confirm the runner shows as "Idle" in the repo's Settings → Actions → Runners.
2. Trigger the workflow manually (`gh workflow run` + `gh run watch`) and confirm the
   job picks up the self-hosted runner and completes.
3. Check whether the login step succeeds now (resolves or further narrows the
   Cloudflare hypothesis). If it still fails, the debug artifacts added in `e9c08da`
   will show what page was actually served.

### Rollback

If the self-hosted runner approach doesn't resolve the login issue, or the user
wants to stop hosting it, revert `runs-on` to `ubuntu-latest` and remove the runner
from the VPS (`svc.sh uninstall`, then deregister via the repo's Settings → Actions →
Runners).
