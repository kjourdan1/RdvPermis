# Headed real Chrome on GitHub-hosted runners Implementation Plan

**Goal:** Test whether swapping `login()`'s browser from headless bundled
Chromium to headed real Chrome (under a virtual display) is enough to pass
Cloudflare's bot challenge, so `check-slots.yml` can move back to
`ubuntu-latest` and drop the residential-IP self-hosted-runner requirement.

**Architecture:** One launch-option change in `worker/src/login.ts`
(`headless: false, channel: 'chrome'`), one CI-step change in
`.github/workflows/check-slots.yml` (`runs-on: ubuntu-latest`, install the
`chrome` channel instead of `chromium`, install Xvfb, wrap the run command in
`xvfb-run -a`). No orchestration, secrets, scheduling, or downstream
HTTP-fetch logic changes.

**Tech Stack:** Playwright (`channel: 'chrome'`), Xvfb, GitHub-hosted
`ubuntu-latest` runner, existing vitest/tsx toolchain.

## Global Constraints

- Only `login.ts`'s `chromium.launch(...)` call and `check-slots.yml`'s
  runner/install/run steps change — no other workflow or worker logic (per
  spec's "Design").
- The `schedule` trigger stays **off** (`workflow_dispatch` only) until a
  human confirms multiple real runs succeed — do not re-enable cron as part
  of this plan (per spec's "Non-goals").
- Existing diagnostic screenshot/HTML capture on login failure must keep
  working unchanged — it's the fallback signal if this approach still fails.

---

### Task 1: Switch `login()` to headed real Chrome

**Files:**
- Modify: `worker/src/login.ts:20`
- Modify: `worker/src/login.test.ts` (add a regression guard)

**Interfaces:**
- Consumes: Playwright's `chromium.launch()` API (`channel`, `headless`
  options already supported by the pinned `playwright@^1.47.0`).
- Produces: no interface change — `login()` still returns the same cookie
  header string; only *how* the browser is launched changes.

- [ ] **Step 1: Change the launch options**

In `worker/src/login.ts`, change:
```ts
const browser = await chromium.launch({ headless: true });
```
to:
```ts
const browser = await chromium.launch({ headless: false, channel: 'chrome' });
```

- [ ] **Step 2: Add a regression-guard unit test**

In `worker/src/login.test.ts`, follow the `vi.mock('playwright', ...)` +
`vi.hoisted` pattern already used in `run.test.ts` for mocking sibling
modules: mock the `playwright` module's `chromium.launch` to a `vi.fn()` that
resolves a stub browser/context/page, call `login()`, and assert
`chromium.launch` was called with `{ headless: false, channel: 'chrome' }`.
This exists purely so a future accidental revert to headless gets caught by
`npm test` instead of only being discovered via a live Cloudflare block.

Expected: `npm test` passes, including the new assertion.

- [ ] **Step 3: Typecheck and full test run**

```bash
cd worker && npm run typecheck && npm test
```
Expected: both exit 0. `formatCookieHeader`'s existing tests are untouched
and still pass.

No commit yet — bundle with Task 2's commit so CI and worker code land
together and can be verified in one workflow run.

---

### Task 2: Update `check-slots.yml` for GitHub-hosted headed Chrome

**Files:**
- Modify: `.github/workflows/check-slots.yml`

**Interfaces:**
- Consumes: the `chrome` channel binary (installed in this task's own step,
  not pre-existing), Xvfb (installed in this task's own step).
- Produces: a workflow that runs on `ubuntu-latest` with a virtual display
  available to the `npm run run` step.

- [ ] **Step 1: Move back to `ubuntu-latest`**

```diff
-    runs-on: [self-hosted, linux]
+    runs-on: ubuntu-latest
```

- [ ] **Step 2: Install the Chrome channel instead of bundled Chromium**

```diff
-      - name: Install Playwright browsers
-        run: npx playwright install --with-deps chromium
+      - name: Install Playwright browsers
+        run: npx playwright install --with-deps chrome
```

- [ ] **Step 3: Install Xvfb**

Add a step before "Run slot check" (can combine with Step 2's step or be its
own):
```yaml
      - name: Install Xvfb
        run: sudo apt-get update && sudo apt-get install -y xvfb
```

- [ ] **Step 4: Run under a virtual display**

```diff
       - name: Run slot check
         env:
           EMAIL: ${{ secrets.EMAIL }}
           PASSWORD: ${{ secrets.PASSWORD }}
           TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
           TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
           BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
-        run: npm run run
+        run: xvfb-run -a npm run run
```

- [ ] **Step 5: Commit and push**

```bash
git add worker/src/login.ts worker/src/login.test.ts .github/workflows/check-slots.yml
git commit -m "ci(worker): try headed real Chrome on GitHub-hosted runner

Headless Chromium gets Cloudflare-blocked even from a residential IP
(confirmed via login-debug artifact), so the IP wasn't the real
differentiator. Test headed real Chrome (channel: chrome) under Xvfb
on ubuntu-latest instead of the residential-IP self-hosted runner."
git push
```

---

### Task 3: Verify against the live site

**Files:** none (verification only).

**Interfaces:**
- Consumes: `workflow_dispatch` trigger, the `login-debug` artifact on
  failure.
- Produces: a confirmed pass/fail verdict for this approach.

- [ ] **Step 1: Trigger a manual run and watch it**

Via the GitHub web UI (Actions tab → "Check RdvPermis slots" → "Run
workflow"), since this environment's `gh` token can't call
`workflow_dispatch` (403, documented limited-token issue). Ask the user to
trigger it and share the run link, or trigger it yourself if you have UI
access.

- [ ] **Step 2: Inspect the `Run slot check` step**

Expected on success: no `Login failed` error; the step completes and moves on
to fetching créneaux. Expected on failure: same
`Timeout ... waiting for locator('#username')` as before, plus a fresh
`login-debug` artifact.

- [ ] **Step 3: If it failed, check the artifact**

Download/open `login-failure.png` and `.html`. If it's still Cloudflare's
"Sorry, you have been blocked" page, this approach is insufficient on its
own — stop here, report to the user, and revisit the session-cookie-replay
alternative (separate spec, not part of this plan).

- [ ] **Step 4: If it succeeded, repeat 3-5 more times over 30-60 minutes**

Trigger a few more manual runs spaced out, not back-to-back, since
Cloudflare's bot scoring can be adaptive. Only treat this as reliable once
multiple runs in a row succeed.

- [ ] **Step 5: Report the outcome to the user**

Summarize pass/fail across the runs. Do **not** re-enable the `schedule`
trigger or edit the README's self-hosted-runner section as part of this
step — that's a deliberate follow-up the user signs off on separately, per
this plan's "Global Constraints".

---

## Self-Review Notes

- Spec's "Verification" section (typecheck/test, manual dispatch, multiple
  runs, artifact inspection) is covered by Task 1 Step 3 and Task 3 Steps
  1-4.
- Spec's "Rollback" section is not a task here — it's the documented fallback
  if Task 3 fails, not work to do up front.
- Spec's "Non-goals" (no cron re-enable, no README rewrite, no
  session-cookie-replay work) are called out explicitly in Task 3 Step 5 and
  the plan's "Global Constraints" so a future executor doesn't overreach.
- The regression-guard test in Task 1 Step 2 isn't in the spec explicitly but
  follows directly from the spec's design (the launch-option change is the
  entire fix) and the project's existing testing conventions
  (`vi.mock`/`vi.hoisted` pattern already used in `run.test.ts`) — added to
  make an accidental future revert self-detecting rather than silently
  reintroducing the Cloudflare block.
