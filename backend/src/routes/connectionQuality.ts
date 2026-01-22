import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import {
  getConnectionQualityScore,
  updateConnectionQualityScore,
  getConnectionQualityHistory,
} from '../services/connectionQuality.js';

export const connectionQualityRouter = Router();

// Get connection quality score for current user
connectionQualityRouter.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get or calculate score
    let score = await getConnectionQualityScore(userId);
    if (!score) {
      // Calculate for the first time
      score = await updateConnectionQualityScore(userId);
    } else {
      // Recalculate to get latest score
      score = await updateConnectionQualityScore(userId);
    }

    res.json({ score });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Connection quality score error:', error);
    res.status(500).json({ error: `Failed to get connection quality score: ${errorMessage}` });
  }
});

// Get score history for trends
connectionQualityRouter.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const days = parseInt(req.query.days as string) || 90;

    const history = await getConnectionQualityHistory(userId, days);

    res.json({ history });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Connection quality history error:', error);
    res.status(500).json({ error: `Failed to get score history: ${errorMessage}` });
  }
});

// Force recalculation
connectionQualityRouter.post('/recalculate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const score = await updateConnectionQualityScore(userId);

    res.json({ score, message: 'Score recalculated successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Recalculate connection quality error:', error);
    res.status(500).json({ error: `Failed to recalculate score: ${errorMessage}` });
  }
});

