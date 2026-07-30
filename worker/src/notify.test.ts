import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatNewCreneauxMessage, sendTelegramNotification } from './notify';

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
