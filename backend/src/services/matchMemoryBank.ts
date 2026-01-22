import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

export interface MatchReflection {
  id: string;
  userId: string;
  matchId: string | null;
  reflectionType: 'unmatch' | 'date' | 'general';
  title: string | null;
  content: string;
  tags: string[];
  dateType: string | null;
  secondDatePlanned: boolean;
  insights: string | null;
  createdAt: string;
}

/**
 * Save a reflection
 */
export async function saveReflection(
  userId: string,
  reflection: {
    matchId?: string;
    reflectionType: 'unmatch' | 'date' | 'general';
    title?: string;
    content: string;
    tags?: string[];
    dateType?: string;
    secondDatePlanned?: boolean;
  }
): Promise<MatchReflection> {
  const reflectionId = uuidv4();

  await (db
    .prepare(
      `INSERT INTO match_reflections 
       (id, user_id, match_id, reflection_type, title, content, tags, 
        date_type, second_date_planned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run([
      reflectionId,
      userId,
      reflection.matchId || null,
      reflection.reflectionType,
      reflection.title || null,
      reflection.content,
      JSON.stringify(reflection.tags || []),
      reflection.dateType || null,
      reflection.secondDatePlanned ? 1 : 0,
    ]) as Promise<any>);

  return {
    id: reflectionId,
    userId,
    matchId: reflection.matchId || null,
    reflectionType: reflection.reflectionType,
    title: reflection.title || null,
    content: reflection.content,
    tags: reflection.tags || [],
    dateType: reflection.dateType || null,
    secondDatePlanned: reflection.secondDatePlanned || false,
    insights: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get all reflections for a user
 */
export async function getUserReflections(
  userId: string,
  limit: number = 50
): Promise<MatchReflection[]> {
  const result = db
    .prepare(
      `SELECT id, user_id, match_id, reflection_type, title, content, tags,
              date_type, second_date_planned, insights, created_at
       FROM match_reflections
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all([userId, limit]);
  const reflections = (result instanceof Promise ? await result : result) as Array<{
    id: string;
    user_id: string;
    match_id: string | null;
    reflection_type: string;
    title: string | null;
    content: string;
    tags: string;
    date_type: string | null;
    second_date_planned: number;
    insights: string | null;
    created_at: string;
  }>;

  return reflections.map((r) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(r.tags || '[]');
    } catch {
      tags = [];
    }

    return {
      id: r.id,
      userId: r.user_id,
      matchId: r.match_id,
      reflectionType: r.reflection_type as 'unmatch' | 'date' | 'general',
      title: r.title,
      content: r.content,
      tags,
      dateType: r.date_type,
      secondDatePlanned: r.second_date_planned === 1,
      insights: r.insights,
      createdAt: r.created_at,
    };
  });
}

/**
 * Generate AI insights from user's reflections
 */
export async function generateInsights(userId: string): Promise<{
  connectionPatterns: string[];
  dateSuccessFactors: string[];
  personalGrowth: string[];
  recommendations: string[];
}> {
  const reflections = await getUserReflections(userId, 100);

  if (reflections.length === 0) {
    return {
      connectionPatterns: [],
      dateSuccessFactors: [],
      personalGrowth: [],
      recommendations: ['Start adding reflections to see personalized insights!'],
    };
  }

  // Analyze patterns
  const connectionPatterns: string[] = [];
  const dateSuccessFactors: string[] = [];
  const personalGrowth: string[] = [];
  const recommendations: string[] = [];

  // Count date types
  const dateTypes = new Map<string, number>();
  const secondDateCount = reflections.filter((r) => r.secondDatePlanned).length;
  const totalDates = reflections.filter((r) => r.reflectionType === 'date').length;

  reflections.forEach((r) => {
    if (r.dateType) {
      dateTypes.set(r.dateType, (dateTypes.get(r.dateType) || 0) + 1);
    }
  });

  // Find most successful date type
  if (dateTypes.size > 0) {
    const bestDateType = Array.from(dateTypes.entries()).sort((a, b) => b[1] - a[1])[0];
    if (bestDateType[1] >= 2) {
      dateSuccessFactors.push(`${bestDateType[0]} dates have been your most successful`);
    }
  }

  // Calculate second date rate
  if (totalDates > 0) {
    const secondDateRate = (secondDateCount / totalDates) * 100;
    if (secondDateRate >= 50) {
      dateSuccessFactors.push(`You have a ${Math.round(secondDateRate)}% second date rate - great job!`);
    } else if (secondDateRate > 0) {
      recommendations.push(`Consider focusing on first dates that align with your interests to improve your second date rate`);
    }
  }

  // Analyze common tags
  const allTags = new Map<string, number>();
  reflections.forEach((r) => {
    r.tags.forEach((tag) => {
      allTags.set(tag, (allTags.get(tag) || 0) + 1);
    });
  });

  const commonTags = Array.from(allTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (commonTags.length > 0) {
    const topTag = commonTags[0];
    if (topTag[1] >= 3) {
      connectionPatterns.push(`You often mention "${topTag[0]}" in your reflections`);
    }
  }

  // Use AI for deeper insights if OpenAI is available
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey && reflections.length >= 5) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const reflectionSummary = reflections
        .slice(0, 20)
        .map((r, i) => `${i + 1}. ${r.reflectionType}: ${r.content.substring(0, 100)}${r.content.length > 100 ? '...' : ''}`)
        .join('\n');

      const prompt = `Analyze this user's dating reflections and provide insights. Be concise and actionable.

Reflections:
${reflectionSummary}

Provide insights in this JSON format:
{
  "connectionPatterns": ["pattern 1", "pattern 2"],
  "dateSuccessFactors": ["factor 1", "factor 2"],
  "personalGrowth": ["growth area 1", "growth area 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Keep each array to 2-3 items max. Be specific and helpful.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful dating coach that analyzes patterns in dating experiences to provide actionable insights.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 400,
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            connectionPatterns: parsed.connectionPatterns || connectionPatterns,
            dateSuccessFactors: parsed.dateSuccessFactors || dateSuccessFactors,
            personalGrowth: parsed.personalGrowth || personalGrowth,
            recommendations: parsed.recommendations || recommendations,
          };
        }
      }
    } catch (error) {
      console.error('❌ Failed to generate AI insights:', error);
    }
  }

  // Fallback insights if AI fails or not enough reflections
  if (connectionPatterns.length === 0) {
    connectionPatterns.push('Keep adding reflections to discover your connection patterns');
  }
  if (dateSuccessFactors.length === 0 && totalDates > 0) {
    dateSuccessFactors.push('Your date experiences are being tracked - patterns will emerge as you add more reflections');
  }
  if (personalGrowth.length === 0) {
    personalGrowth.push('Reflecting on your experiences helps you grow and learn');
  }
  if (recommendations.length === 0) {
    recommendations.push('Continue being authentic and open in your conversations');
  }

  return {
    connectionPatterns,
    dateSuccessFactors,
    personalGrowth,
    recommendations,
  };
}

