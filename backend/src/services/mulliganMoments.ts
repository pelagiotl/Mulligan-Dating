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
  
  // Actually unhinged fallback starters when no OpenAI (or AI returns something bland)
  const unhingedFallbacksWithInterest = [
    (i: string) => ({ starter: `We both like ${i}. I'm choosing to believe you'd also help me hide a body. No? Just me?`, explanation: 'Unhinged commitment test' }),
    (i: string) => ({ starter: `${i} fan here. If we dated, our shared hobby would either be our love story or our undoing. Which do you think?`, explanation: 'Chaotic hypothetical' }),
    (i: string) => ({ starter: `You put ${i} on your profile. I put ${i} on mine. One of us is lying or we're soulmates. No in-between.`, explanation: 'Zero chill' }),
    (i: string) => ({ starter: `Okay but ${i} — are we talking "healthy interest" or "I have a shrine" level? Be honest.`, explanation: 'Unhinged honesty' }),
    (i: string) => ({ starter: `Fellow ${i} person. I have one question and it's weird: what's the most unhinged thing you've done for it?`, explanation: 'Chaotic energy' }),
    (i: string) => ({ starter: `So we both like ${i}. Would you still like me if I was a worm? (Asking for a friend.)`, explanation: 'Absurd hypothetical' }),
    (i: string) => ({ starter: `${i} is the one thing we have in common. Everything else could be a disaster. I'm into it.`, explanation: 'Chaotic good' }),
  ];
  const unhingedFallbacksNoInterest = [
    { starter: `I have no opener. I'm just here, slightly unhinged, hoping you're the same. Your move.`, explanation: 'Unhinged honesty' },
    { starter: `What's the most unhinged thing you've done this week? I'll go first if you promise not to run.`, explanation: 'Chaotic energy' },
    { starter: `Would you still like me if I was a worm? (Asking for a friend. No takebacks.)`, explanation: 'Absurd hypothetical' },
    { starter: `No "hey" — we're doing this wrong on purpose. What's one thing that would make you immediately reply?`, explanation: 'Bold and weird' },
    { starter: `I have zero game and I'm not sorry. What's something you're weirdly, passionately obsessed with?`, explanation: 'Unhinged authenticity' },
    { starter: `Hot take: the best openers are unhinged. So — what's a hill you'd die on that would make people side-eye you?`, explanation: 'Chaotic good' },
    { starter: `If we went on a first date and it was a disaster, would you still text me after? (Asking for science.)`, explanation: 'Unhinged hypothetical' },
    { starter: `I'm not good at small talk. So: what's the weirdest thing you've ever done to impress someone?`, explanation: 'Chaotic honesty' },
  ];

  if (!openaiApiKey) {
    if (sharedInterests.length > 0) {
      const pick = unhingedFallbacksWithInterest[Math.floor(Math.random() * unhingedFallbacksWithInterest.length)];
      return pick(sharedInterests[0]);
    }
    return unhingedFallbacksNoInterest[Math.floor(Math.random() * unhingedFallbacksNoInterest.length)];
  }

  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const interestsText = sharedInterests.length > 0
      ? `Shared interests to play with: ${sharedInterests.join(', ')}`
      : 'They matched but no strong shared interests listed — get creative and bold anyway';

    const prompt = `Generate ONE extremely unhinged dating app opener. NOT basic. NOT safe.

${interestsText}
Sender: ${user1Name}. Recipient: ${user2Name}.

BAD (reject these — too basic):
- "I noticed we both like X!"
- "Hey! What do you like about X?"
- "We have X in common, that's cool!"
- "What's your favorite thing about X?"
- Any polite, generic, or "nice" opener.

GOOD (this level of unhinged or more):
- "We both like X. I'm choosing to believe you'd also help me hide a body. No? Just me?"
- "Would you still like me if I was a worm? (Asking for a friend.)"
- "One of us is lying about liking X or we're soulmates. No in-between."
- "What's the most unhinged thing you've done for X? I'll go first if you promise not to run."
- Absurd hypotheticals, commitment tests, shameless honesty, or chaotic energy. Make them laugh or go "wait what."

Rules:
- Under 120 characters.
- Dating-appropriate but NOT safe or corporate.
- If you have shared interests, use them in a weird/funny way — not "we both like X."
- Output ONLY valid JSON, nothing else.

Return ONLY this JSON shape:
{"starter": "your unhinged opener here", "explanation": "short vibe phrase"}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You write dating app openers that are genuinely unhinged — absurd hypotheticals, commitment tests, chaotic honesty. Never write polite, generic, or "nice" openers. Never write "I noticed we both like X" or "What do you like about X?". Good examples: "Would you still like me if I was a worm?", "We both like X — would you help me hide a body?", "One of us is lying or we're soulmates. No in-between." Your openers should make someone laugh or do a double-take. Be weird. Be bold. Under 120 chars.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 1.15,
      max_tokens: 200,
      frequency_penalty: 0.6,
      presence_penalty: 0.4,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        starter: parsed.starter || unhingedFallbacksNoInterest[0].starter,
        explanation: parsed.explanation || 'Unhinged AI moment',
      };
    }

    return {
      starter: content.trim().replace(/^["']|["']$/g, ''),
      explanation: 'Unhinged AI moment',
    };
  } catch (error) {
    console.error('❌ Failed to generate AI conversation starter:', error);
    if (sharedInterests.length > 0) {
      const pick = unhingedFallbacksWithInterest[Math.floor(Math.random() * unhingedFallbacksWithInterest.length)];
      return pick(sharedInterests[0]);
    }
    return unhingedFallbacksNoInterest[Math.floor(Math.random() * unhingedFallbacksNoInterest.length)];
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

