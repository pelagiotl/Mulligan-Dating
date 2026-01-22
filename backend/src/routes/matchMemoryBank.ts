import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { rateLimitAPI } from '../middleware/security.js';
import {
  saveReflection,
  getUserReflections,
  generateInsights,
} from '../services/matchMemoryBank.js';
import { z } from 'zod';

export const matchMemoryBankRouter = Router();

// Save a reflection
matchMemoryBankRouter.post('/reflections', authenticateToken, rateLimitAPI, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const reflectionSchema = z.object({
      matchId: z.string().uuid().optional(),
      reflectionType: z.enum(['unmatch', 'date', 'general']),
      title: z.string().optional(),
      content: z.string().min(1, 'Content is required'),
      tags: z.array(z.string()).optional(),
      dateType: z.string().optional(),
      secondDatePlanned: z.boolean().optional(),
    });

    const validationResult = reflectionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid reflection data',
        details: validationResult.error.errors,
      });
    }

    const reflection = await saveReflection(userId, validationResult.data);

    res.json({ reflection, message: 'Reflection saved successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Save reflection error:', error);
    res.status(500).json({ error: `Failed to save reflection: ${errorMessage}` });
  }
});

// Get all reflections for current user
matchMemoryBankRouter.get('/reflections', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 50;

    const reflections = await getUserReflections(userId, limit);

    res.json({ reflections });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Get reflections error:', error);
    res.status(500).json({ error: `Failed to get reflections: ${errorMessage}` });
  }
});

// Get AI-generated insights
matchMemoryBankRouter.get('/insights', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const insights = await generateInsights(userId);

    res.json({ insights });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Generate insights error:', error);
    res.status(500).json({ error: `Failed to generate insights: ${errorMessage}` });
  }
});

