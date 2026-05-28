import { Router } from 'express';
import { db } from '../database.js';
import { isSmsOptOutKeyword, phoneDigitsOnly } from '../services/sms.js';

export const smsWebhookRouter = Router();

/**
 * Twilio inbound SMS webhook — handles STOP / opt-out.
 * Configure in Twilio Console: Phone Number → Messaging → "A message comes in" → POST this URL.
 */
smsWebhookRouter.post('/inbound', async (req, res) => {
  try {
    const from = String(req.body?.From || req.body?.from || '').trim();
    const body = String(req.body?.Body || req.body?.body || '');

    if (from && isSmsOptOutKeyword(body)) {
      const digits = phoneDigitsOnly(from);
      if (digits.length >= 10) {
        const tail10 = digits.slice(-10);
        const users = (await db.prepare('SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL').all(
          [],
        )) as { id: string; phone_number: string }[];

        let opted = 0;
        for (const u of users) {
          const ud = phoneDigitsOnly(u.phone_number);
          if (ud === digits || ud.slice(-10) === tail10) {
            await (db.prepare('UPDATE users SET sms_opt_out = 1 WHERE id = ?').run([u.id]) as Promise<unknown>);
            opted += 1;
          }
        }
        console.log(`📵 SMS opt-out from ${from}: updated ${opted} user(s)`);
      }

      res.type('text/xml');
      res.send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from Mulligan account reminders.</Message></Response>',
      );
      return;
    }

    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('SMS inbound webhook error:', error);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});
