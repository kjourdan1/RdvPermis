import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { launch: mocks.launch },
}));

import { formatCookieHeader, login } from './login';

describe('formatCookieHeader', () => {
  it('joins cookie name/value pairs with semicolons', () => {
    const header = formatCookieHeader([
      { name: 'JSESSIONID', value: 'abc123' },
      { name: 'XSRF-TOKEN', value: 'xyz789' },
    ]);
    expect(header).toBe('JSESSIONID=abc123; XSRF-TOKEN=xyz789');
  });

  it('returns an empty string for no cookies', () => {
    expect(formatCookieHeader([])).toBe('');
  });
});

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('launches a headed real Chrome, not headless bundled Chromium', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      waitForURL: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      cookies: vi.fn().mockResolvedValue([{ name: 'JSESSIONID', value: 'abc123' }]),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue(context),
      close: vi.fn().mockResolvedValue(undefined),
    };
    mocks.launch.mockResolvedValue(browser);

    await login('a@b.com', 'pw');

    // Cloudflare blocks headless Chromium even from a residential IP
    // (confirmed 2026-08-01) — a future accidental revert to headless
    // should fail this test rather than silently reintroducing the block.
    expect(mocks.launch).toHaveBeenCalledWith({ headless: false, channel: 'chrome' });
  });
});
