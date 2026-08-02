import type { Creneau } from './types';

// Telegram rejects sendMessage calls over 4096 characters, counted in UTF-16
// code units -- and the emoji used in this format (🚗 📍 📅) are non-BMP,
// so they count as 2 units each. Budget well below the hard limit rather
// than computing exactly against it.
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_MESSAGE_SAFETY_MARGIN = 296;
const MESSAGE_BODY_BUDGET = TELEGRAM_MESSAGE_LIMIT - TELEGRAM_MESSAGE_SAFETY_MARGIN;

export function formatNewCreneauxMessage(creneaux: Creneau[]): string {
  const lines = ['🚗 Nouveau créneau disponible !', ''];
  let includedCount = 0;

  for (const c of creneaux) {
    const block = [
      `📍 Département ${c.departement} — ${c.centre}`,
      `📅 à ${c.heure.replace(':', 'h')} le ${c.date}`,
      '',
    ];
    const candidateLength = lines.concat(block).join('\n').length;
    if (candidateLength > MESSAGE_BODY_BUDGET) {
      break;
    }
    lines.push(...block);
    includedCount++;
  }

  let message = lines.join('\n').trim();

  const omittedCount = creneaux.length - includedCount;
  if (omittedCount > 0) {
    const plural = omittedCount > 1;
    message += `\n\n… et ${omittedCount} autre${plural ? 's' : ''} créneau${plural ? 'x' : ''}.`;
  }

  return message;
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
