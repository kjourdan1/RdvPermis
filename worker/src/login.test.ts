import { describe, it, expect } from 'vitest';
import { formatCookieHeader } from './login';

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
