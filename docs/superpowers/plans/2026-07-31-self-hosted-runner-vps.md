# Self-hosted GitHub Actions runner on VPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `check-slots.yml` on a self-hosted GitHub Actions runner installed on the user's VPS instead of `ubuntu-latest`, to test whether Cloudflare is challenging GitHub Actions' shared IP ranges specifically.

**Architecture:** Install the official GitHub Actions runner on the VPS as a `systemd` service registered to `kjourdan1/RdvPermis` only, labelled `rdvpermis`. Change one line in the existing workflow to target that label. No other orchestration, secrets, or scheduling logic changes.

**Tech Stack:** GitHub Actions self-hosted runner (official tarball), systemd, Ubuntu 24.04 VPS, `gh` CLI (already authenticated locally as `kjourdan1`).

## Global Constraints

- Runner must be **repository-scoped** to `kjourdan1/RdvPermis`, not org-level (per spec: "Non-goals").
- Runner labels must include `self-hosted, linux, rdvpermis` (spec: "Runner installation").
- Only the `runs-on` line in `.github/workflows/check-slots.yml` changes — no other workflow logic (spec: "Workflow change").
- Never add `pull_request`/`pull_request_target` triggers to any workflow using this runner label (spec: "Security").
- VPS access: SSH key at `/tmp/claude-1000/-workspaces-RdvPermis/c25d6c4e-4bae-4822-b0d3-27bb2f9fdd5b/scratchpad/ssh/rdvpermis_vps`, host `ubuntu@137.74.170.209`, passwordless sudo confirmed available.

---

### Task 1: Install and register the runner as a systemd service

**Files:**
- Modify (VPS filesystem, not repo): `/home/ubuntu/actions-runner/*`
- Modify (VPS filesystem): `/etc/systemd/system/actions.runner.*.service` (created by the runner's own installer)

**Interfaces:**
- Consumes: SSH key path and host above; `gh` CLI authenticated as `kjourdan1` in the local environment (used to mint the registration token — the token itself never touches the VPS filesystem outside the runner's own config step, and is not committed anywhere).
- Produces: a running systemd service named `actions.runner.kjourdan1-RdvPermis.<runner-name>.service`, and a runner entry visible in the repo's Settings → Actions → Runners with labels `self-hosted, linux, rdvpermis`.

- [ ] **Step 1: Get the latest runner release version and download URL**

Run locally:
```bash
gh api repos/actions/runner/releases/latest --jq '.tag_name'
```
Expected: a version string like `v2.321.0`. Use it to build the download URL:
`https://github.com/actions/runner/releases/download/<tag>/actions-runner-linux-x64-<tag-without-v>.tar.gz`

- [ ] **Step 2: Download and extract the runner on the VPS**

Run over SSH (substitute `<tag>`/`<version>` from Step 1):
```bash
ssh -i <key> ubuntu@137.74.170.209 '
  mkdir -p ~/actions-runner && cd ~/actions-runner &&
  curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/<tag>/actions-runner-linux-x64-<version>.tar.gz &&
  tar xzf actions-runner-linux-x64.tar.gz &&
  ./bin/installdependencies.sh
'
```
Expected: extraction succeeds, `installdependencies.sh` exits 0 (installs libicu etc. via apt — this is why passwordless sudo is required).

- [ ] **Step 3: Verify the runner is not already registered**

Run locally:
```bash
gh api repos/kjourdan1/RdvPermis/actions/runners --jq '.runners[].name'
```
Expected: empty output (no runners yet). If a stale runner from a previous attempt shows up, remove it first: `gh api -X DELETE repos/kjourdan1/RdvPermis/actions/runners/<id>`.

- [ ] **Step 4: Generate a registration token**

Run locally:
```bash
gh api -X POST repos/kjourdan1/RdvPermis/actions/runners/registration-token --jq '.token'
```
Expected: a short-lived token string (valid ~1 hour). This token is passed directly into the next SSH command and never written to a file or committed.

- [ ] **Step 5: Configure the runner**

Run over SSH, using the token from Step 4:
```bash
ssh -i <key> ubuntu@137.74.170.209 '
  cd ~/actions-runner &&
  ./config.sh --url https://github.com/kjourdan1/RdvPermis --token <TOKEN> --name vps-rdvpermis --labels rdvpermis --unattended
'
```
Expected: output ends with "Runner successfully added" and "Runner connection is good".

- [ ] **Step 6: Install and start as a systemd service**

Run over SSH:
```bash
ssh -i <key> ubuntu@137.74.170.209 '
  cd ~/actions-runner &&
  sudo ./svc.sh install &&
  sudo ./svc.sh start
'
```
Expected: `svc.sh install` reports the service was created and enabled; `svc.sh start` reports it started.

- [ ] **Step 7: Verify the runner is Idle and online**

Run locally:
```bash
gh api repos/kjourdan1/RdvPermis/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```
Expected: one runner named `vps-rdvpermis`, `status: "online"`, labels include `self-hosted`, `linux`, `x64`, `rdvpermis`.

No commit for this task — nothing in the repo changes yet.

---

### Task 2: Point the workflow at the self-hosted runner and verify a real run

**Files:**
- Modify: `.github/workflows/check-slots.yml:10`

**Interfaces:**
- Consumes: the `rdvpermis` runner label registered in Task 1.
- Produces: a workflow run executed on the VPS, confirming (or further narrowing) the Cloudflare IP-blocking hypothesis from commit `e9c08da`.

- [ ] **Step 1: Change the `runs-on` line**

In `.github/workflows/check-slots.yml`, change:
```yaml
    runs-on: ubuntu-latest
```
to:
```yaml
    runs-on: [self-hosted, linux, rdvpermis]
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/check-slots.yml
git commit -m "ci(worker): run check-slots on self-hosted VPS runner

Test whether Cloudflare is specifically challenging GitHub Actions'
shared IP ranges (see e9c08da) by running the same job from the VPS's
IP instead."
git push
```

- [ ] **Step 3: Trigger a manual run and watch it**

```bash
gh workflow run "Check RdvPermis slots"
gh run watch
```
Expected: the run picks up the `vps-rdvpermis` runner (visible in the run's "Set up job" log as `Runner name: 'vps-rdvpermis'`), and the `Run slot check` step either:
- succeeds (login worked — Cloudflare hypothesis confirmed and resolved), or
- fails at the same `#username` timeout, in which case the `login-debug` artifact (added in `e9c08da`) will contain a screenshot/HTML showing what was actually served from the VPS's IP, which is new diagnostic information either way.

- [ ] **Step 4: Report the outcome**

Summarize for the user whether the login succeeded from the VPS IP, and if not, what `login-failure.png`/`login-failure.html` show (download via `gh run download <run-id> -n login-debug` if needed).

---

## Self-Review Notes

- Spec's "Verification" section (repo Settings check, manual trigger, `gh run watch`) is covered by Task 1 Step 7 and Task 2 Steps 3-4.
- Spec's "Rollback" section is not a task — it's a documented fallback only needed if verification fails; no code to write for it up front.
- Runner registration token is never persisted to disk or committed, per the spec's implicit security expectations (same standard as the existing `EMAIL`/`PASSWORD`/etc. secrets handling in this repo).
