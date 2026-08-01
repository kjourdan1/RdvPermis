import { chromium } from 'playwright';

const LOGIN_URL = 'https://candidat.permisdeconduire.gouv.fr/';

// Verified against the live site 2026-07-31: candidat.permisdeconduire.gouv.fr
// redirects to a Keycloak login (moncompte.permisdeconduire.gouv.fr) with an
// email + password form — not NEPH + date de naissance as originally assumed.
// Confirmed 2026-08-01: Cloudflare blocks headless Chromium even from a
// residential IP (login-debug artifact showed its block page), so the
// browser below runs headed under a real Chrome channel instead.
const EMAIL_SELECTOR = '#username';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_SELECTOR = '#kc-login';

export function formatCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function login(email: string, password: string): Promise<string> {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    try {
      await page.fill(EMAIL_SELECTOR, email);
      await page.fill(PASSWORD_SELECTOR, password);
      await page.click(SUBMIT_SELECTOR);
      await page.waitForURL((url) => url.hostname === 'candidat.permisdeconduire.gouv.fr', {
        timeout: 30000,
      });
    } catch (error) {
      // Diagnostic-only: capture what the page actually looked like when the
      // expected login form/redirect never showed up (e.g. a bot-detection
      // challenge instead of the real form), without ever writing credentials
      // to disk. Uploaded as a CI artifact by the workflow on failure.
      await page.screenshot({ path: 'login-failure.png', fullPage: true }).catch(() => {});
      const html = await page.content().catch(() => null);
      if (html) {
        const fs = await import('node:fs/promises');
        await fs.writeFile('login-failure.html', html).catch(() => {});
      }
      throw error;
    }
    const cookies = await context.cookies();
    return formatCookieHeader(cookies);
  } finally {
    await browser.close();
  }
}
