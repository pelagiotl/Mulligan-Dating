import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { rateLimitAPI } from '../middleware/security.js';
import {
  listLiveDateEvents,
  listUserLiveDateTickets,
  signupForLiveDate,
} from '../services/liveDates.js';

export const liveDatesRouter = Router();

liveDatesRouter.get('/events', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const events = await listLiveDateEvents(req.userId!);
    res.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load events';
    res.status(500).json({ error: message });
  }
});

liveDatesRouter.get('/my-tickets', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const tickets = await listUserLiveDateTickets(req.userId!);
    res.json({ tickets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load tickets';
    res.status(500).json({ error: message });
  }
});

liveDatesRouter.post('/signup', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const parsed = z.object({ eventId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid signup request' });
    }
    const result = await signupForLiveDate(req.userId!, parsed.data.eventId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    const status = message.includes('full') ? 409 : message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});
