import type { Creneau } from './types';

export function formatNewCreneauxMessage(creneaux: Creneau[]): string {
  const lines = ['🚗 Nouveau créneau disponible !', ''];
  for (const c of creneaux) {
    lines.push(`📍 Département ${c.departement} — ${c.centre}`);
    lines.push(`📅 à ${c.heure.replace(':', 'h')} le ${c.date}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export async function sendTelegramNotification(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  if (!response.ok) {
    throw new Error(`Telegram notification failed: ${response.status}`);
  }
}
