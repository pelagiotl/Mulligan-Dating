import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Check if a conversation is "dead" (stalled/ghosted)
 * Criteria:
 * - Last message was more than 48 hours ago
 * - No response to last message
 * - At least 2 messages were exchanged
 */
export async function isConversationDead(matchId: string): Promise<boolean> {
  const messagesResult = db
    .prepare(
      `SELECT sender_id, sent_at 
       FROM messages 
       WHERE match_id = ? 
       ORDER BY sent_at DESC 
       LIMIT 5`
    )
    .all([matchId]);
  const messages = (messagesResult instanceof Promise
    ? await messagesResult
    : messagesResult) as Array<{
    sender_id: string;
    sent_at: string;
  }>;

  if (messages.length < 2) {
    return false; // Not enough messages to be "dead"
  }

  const lastMessage = messages[0];
  const lastMessageTime = new Date(lastMessage.sent_at).getTime();
  const now = Date.now();
  const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);

  // Check if last message was more than 48 hours ago
  if (hoursSinceLastMessage < 48) {
    return false; // Too recent to be considered dead
  }

  // Check if there's been a response since the last message
  // (If there are multiple messages, check if the last two are from different users)
  if (messages.length >= 2) {
    const lastTwoMessages = messages.slice(0, 2);
    // If last two messages are from the same user, it's likely dead (no response)
    if (lastTwoMessages[0].sender_id === lastTwoMessages[1].sender_id) {
      return true; // Last message had no response
    }
  }

  return hoursSinceLastMessage >= 48;
}

/**
 * Get shared interests between two users in a match
 */
export async function getSharedInterests(
  matchId: string,
  user1Id: string,
  user2Id: string
): Promise<string[]> {
  // Get user1's interests
  const user1ProfileResult = db
    .prepare('SELECT id FROM profiles WHERE user_id = ?')
    .get([user1Id]);
  const user1Profile = (user1ProfileResult instanceof Promise
    ? await user1ProfileResult
    : user1ProfileResult) as { id: string } | undefined;

  // Get user2's interests
  const user2ProfileResult = db
    .prepare('SELECT id FROM profiles WHERE user_id = ?')
    .get([user2Id]);
  const user2Profile = (user2ProfileResult instanceof Promise
    ? await user2ProfileResult
    : user2ProfileResult) as { id: string } | undefined;

  if (!user1Profile || !user2Profile) {
    return [];
  }

  const user1InterestsResult = db
    .prepare('SELECT name FROM interests WHERE profile_id = ?')
    .all([user1Profile.id]);
  const user1Interests = (user1InterestsResult instanceof Promise
    ? await user1InterestsResult
    : user1InterestsResult) as Array<{ name: string }>;

  const user2InterestsResult = db
    .prepare('SELECT name FROM interests WHERE profile_id = ?')
    .all([user2Profile.id]);
  const user2Interests = (user2InterestsResult instanceof Promise
    ? await user2InterestsResult
    : user2InterestsResult) as Array<{ name: string }>;

  const user1InterestNames = new Set(user1Interests.map(i => i.name.toLowerCase()));
  const shared = user2Interests
    .filter(i => user1InterestNames.has(i.name.toLowerCase()))
    .map(i => i.name);

  return shared;
}

/**
 * Generate AI conversation starter based on shared interests
 */
export async function generateConversationStarter(
  sharedInterests: string[],
  user1Name: string,
  user2Name: string
): Promise<{ starter: string; explanation: string }> {
  // Check if OpenAI is configured
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    // Fallback: Generate a simple starter without AI
    if (sharedInterests.length > 0) {
      const interest = sharedInterests[0];
      return {
        starter: `Hey! I noticed we both like ${interest}. What got you into it?`,
        explanation: `Based on your shared interest in ${interest}`,
      };
    }
    return {
      starter: `Hey! I'd love to get to know you better. What's something you're passionate about?`,
      explanation: 'A friendly conversation starter',
    };
  }

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const interestsText = sharedInterests.length > 0
      ? `You both share these interests: ${sharedInterests.join(', ')}`
      : 'You matched but don\'t have many shared interests listed yet';

    const prompt = `Generate a friendly, engaging conversation starter for a dating app. 
${interestsText}
User names: ${user1Name} and ${user2Name}

Requirements:
- Be warm and genuine, not generic
- Reference shared interests if available
- Ask an open-ended question
- Keep it under 100 characters
- Be creative and specific

Return ONLY a JSON object with this exact format:
{
  "starter": "the conversation starter text",
  "explanation": "brief explanation of why this starter works"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates engaging conversation starters for dating apps.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        starter: parsed.starter || 'Hey! I\'d love to get to know you better.',
        explanation: parsed.explanation || 'AI-generated conversation starter',
      };
    }

    // Fallback if JSON parsing fails
    return {
      starter: content.trim().replace(/^["']|["']$/g, ''),
      explanation: 'AI-generated conversation starter',
    };
  } catch (error) {
    console.error('❌ Failed to generate AI conversation starter:', error);
    
    // Fallback to simple starter
    if (sharedInterests.length > 0) {
      const interest = sharedInterests[0];
      return {
        starter: `Hey! I noticed we both like ${interest}. What got you into it?`,
        explanation: `Based on your shared interest in ${interest}`,
      };
    }
    
    return {
      starter: `Hey! I'd love to get to know you better. What's something you're passionate about?`,
      explanation: 'A friendly conversation starter',
    };
  }
}

/**
 * Reset conversation and generate new starter
 */
export async function resetConversation(
  matchId: string,
  userId: string,
  tokenUsed: boolean = true
): Promise<{ starter: string; explanation: string; resetId: string }> {
  // Get match info
  const matchResult = db
    .prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?')
    .get([matchId]);
  const match = (matchResult instanceof Promise
    ? await matchResult
    : matchResult) as { user1_id: string; user2_id: string } | undefined;

  if (!match) {
    throw new Error('Match not found');
  }

  const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

  // Get user names
  const user1ProfileResult = db
    .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
    .get([userId]);
  const user1Profile = (user1ProfileResult instanceof Promise
    ? await user1ProfileResult
    : user1ProfileResult) as { display_name: string } | undefined;

  const user2ProfileResult = db
    .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
    .get([otherUserId]);
  const user2Profile = (user2ProfileResult instanceof Promise
    ? await user2ProfileResult
    : user2ProfileResult) as { display_name: string } | undefined;

  const user1Name = user1Profile?.display_name || 'You';
  const user2Name = user2Profile?.display_name || 'Them';

  // Get shared interests
  const sharedInterests = await getSharedInterests(matchId, userId, otherUserId);

  // Generate conversation starter
  const { starter, explanation } = await generateConversationStarter(
    sharedInterests,
    user1Name,
    user2Name
  );

  // Record the reset
  const resetId = uuidv4();
  await (db
    .prepare(
      `INSERT INTO conversation_resets 
       (id, match_id, initiated_by, reset_reason, ai_generated_starter, 
        shared_interests_used, token_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run([
      resetId,
      matchId,
      userId,
      'conversation_stalled',
      starter,
      JSON.stringify(sharedInterests),
      tokenUsed ? 1 : 0,
    ]) as Promise<any>);

  return { starter, explanation, resetId };
}

