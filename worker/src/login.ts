import { chromium } from 'playwright';

const LOGIN_URL = 'https://candidat.permisdeconduire.gouv.fr/';

// Best-guess selectors — MUST be verified against the live site (see Step 6
// of this task) before the first real run.
const NEPH_SELECTOR = 'input[name="username"]';
const DATE_NAISSANCE_SELECTOR = 'input[name="birthdate"]';
const SUBMIT_SELECTOR = 'button[type="submit"]';

export function formatCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function login(neph: string, dateNaissance: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.fill(NEPH_SELECTOR, neph);
    await page.fill(DATE_NAISSANCE_SELECTOR, dateNaissance);
    await page.click(SUBMIT_SELECTOR);
    await page.waitForURL('**/reservation', { timeout: 30000 });
    const cookies = await context.cookies();
    return formatCookieHeader(cookies);
  } finally {
    await browser.close();
  }
}
