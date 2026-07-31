import { chromium } from 'playwright';

const LOGIN_URL = 'https://candidat.permisdeconduire.gouv.fr/';

// Verified against the live site 2026-07-31: candidat.permisdeconduire.gouv.fr
// redirects to a Keycloak login (moncompte.permisdeconduire.gouv.fr) with an
// email + password form — not NEPH + date de naissance as originally assumed.
// The form also carries hidden Cloudflare Turnstile / reCAPTCHA fields, so a
// headless run may still be challenged; this could not be exercised
// end-to-end without real credentials.
const EMAIL_SELECTOR = '#username';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_SELECTOR = '#kc-login';

export function formatCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function login(email: string, password: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill(EMAIL_SELECTOR, email);
    await page.fill(PASSWORD_SELECTOR, password);
    await page.click(SUBMIT_SELECTOR);
    await page.waitForURL((url) => url.hostname === 'candidat.permisdeconduire.gouv.fr', {
      timeout: 30000,
    });
    const cookies = await context.cookies();
    return formatCookieHeader(cookies);
  } finally {
    await browser.close();
  }
}
