import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatNewCreneauxMessage, sendTelegramNotification } from './notify';
import type { Creneau } from './types';

describe('formatNewCreneauxMessage', () => {
  it('includes the header line', () => {
    const message = formatNewCreneauxMessage([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
    ]);
    expect(message).toContain('🚗 Nouveau créneau disponible !');
  });

  it('lists departement, centre and time for each new creneau', () => {
    const message = formatNewCreneauxMessage([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
      { departement: '091', centre: 'Centre de Corbeil', date: '2026-08-15', heure: '09:00' },
    ]);
    expect(message).toContain('📍 Département 078 — Centre de Versailles');
    expect(message).toContain('à 14h30');
    expect(message).toContain('📍 Département 091 — Centre de Corbeil');
    expect(message).toContain('à 09h00');
  });

  it('does not truncate or add a footer for a small list that fits comfortably', () => {
    const message = formatNewCreneauxMessage([
      { departement: '078', centre: 'Centre de Versailles', date: '2026-08-14', heure: '14:30' },
      { departement: '091', centre: 'Centre de Corbeil', date: '2026-08-15', heure: '09:00' },
    ]);
    expect(message).not.toContain('autre');
    expect(message.length).toBeLessThan(4096);
  });

  it('caps the message at the Telegram limit and appends an omitted-count footer when creneaux do not fit', () => {
    const many: Creneau[] = Array.from({ length: 200 }, (_, i) => ({
      departement: '078',
      centre: `Centre ${i}`,
      date: '2026-08-14',
      heure: '14:30',
    }));

    const message = formatNewCreneauxMessage(many);

    expect(message.length).toBeLessThanOrEqual(4096);

    const footerMatch = message.match(/\n\n… et (\d+) autres? créneaux?\.$/);
    expect(footerMatch).not.toBeNull();
    const omittedCount = Number(footerMatch![1]);
    const includedCount = many.length - omittedCount;
    expect(includedCount).toBeGreaterThan(0);
    expect(includedCount).toBeLessThan(many.length);

    // Everything that made it in must be formatted exactly as it would be
    // on its own -- truncation must never change the format of included
    // creneaux, only stop including more of them.
    const expectedPrefix = formatNewCreneauxMessage(many.slice(0, includedCount));
    expect(message.startsWith(expectedPrefix)).toBe(true);

    const plural = omittedCount > 1;
    expect(
      message.endsWith(`… et ${omittedCount} autre${plural ? 's' : ''} créneau${plural ? 'x' : ''}.`)
    ).toBe(true);
  });

  it('uses correct singular French wording when exactly one creneau is omitted', () => {
    // Fixed-width centre name so each block is the same length; 68 of these
    // is exactly one more than fits under the message body budget.
    const fixed = (n: number): Creneau[] =>
      Array.from({ length: n }, () => ({
        departement: '078',
        centre: 'Centre X',
        date: '2026-08-14',
        heure: '14:30',
      }));

    const message = formatNewCreneauxMessage(fixed(68));

    expect(message.endsWith('… et 1 autre créneau.')).toBe(true);
    expect(message).not.toContain('autres');
    expect(message).not.toContain('créneaux.');
  });
});

describe('sendTelegramNotification', () => {
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    global.fetch = vi.fn();
  });

  it('throws when Telegram env vars are missing', async () => {
    await expect(sendTelegramNotification('hello')).rejects.toThrow(
      'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set'
    );
  });

  it('posts the message to the Telegram sendMessage endpoint', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    (global.fetch as any).mockResolvedValue({ ok: true });

    await sendTelegramNotification('hello');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '12345', text: 'hello' }),
      })
    );
  });
});
