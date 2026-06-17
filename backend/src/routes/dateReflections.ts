import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { rateLimitAPI } from '../middleware/security.js';
import {
  getDateReflectionStatus,
  saveDateReflection,
} from '../services/dateReflections.js';

export const dateReflectionsRouter = Router();

const reflectionBodySchema = z.object({
  matchId: z.string().uuid(),
  wentWell: z.string().min(1).max(2000),
  secondDateInterest: z.enum(['yes', 'no', 'maybe']),
  extraNotes: z.string().max(2000).optional(),
  voiceNoteUrl: z.string().max(2000).optional(),
});

dateReflectionsRouter.post('/', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const parsed = reflectionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reflection', details: parsed.error.errors });
    }
    const result = await saveDateReflection(req.userId!, parsed.data);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save reflection';
    const status = message.includes('Not authorized') ? 403 : message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

dateReflectionsRouter.get('/:matchId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const status = await getDateReflectionStatus(req.userId!, req.params.matchId);
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reflection';
    const statusCode = message.includes('Not authorized') ? 403 : message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: message });
  }
});
