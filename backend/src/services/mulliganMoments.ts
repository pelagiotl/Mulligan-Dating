/**
 * Mulligan Moments: shared interests for AI prompts, stale-conversation detection,
 * and conversation reset with logged conversation_resets rows.
 */

import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

async function awaitRow<T>(result: T | Promise<T>): Promise<T> {
  return result instanceof Promise ? await result : result;
}

/** Intersection of interest names between two users' profiles (case-insensitive). */
export async function getSharedInterests(
  _matchId: string,
  user1Id: string,
  user2Id: string
): Promise<string[]> {
  const p1Result = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([user1Id]);
  const p2Result = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get([user2Id]);
  const p1 = (await awaitRow(p1Result)) as { id: string } | undefined;
  const p2 = (await awaitRow(p2Result)) as { id: string } | undefined;
  if (!p1?.id || !p2?.id) return [];

  const i1Result = db.prepare('SELECT name FROM interests WHERE profile_id = ?').all([p1.id]);
  const i2Result = db.prepare('SELECT name FROM interests WHERE profile_id = ?').all([p2.id]);
  const list1 = (await awaitRow(i1Result)) as { name: string }[];
  const list2 = (await awaitRow(i2Result)) as { name: string }[];
  if (!Array.isArray(list1) || !Array.isArray(list2)) return [];

  const norm = (s: string) => s.trim().toLowerCase();
  const set2 = new Set(list2.map((r) => norm(r.name)).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of list1) {
    const key = norm(row.name);
    if (!key || !set2.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.name.trim());
  }
  return out;
}

function staleHours(): number {
  const n = Number(process.env.MULLIGAN_STALE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 48;
}

/**
 * True if there are no messages yet, or the last message is older than MULLIGAN_STALE_HOURS (default 48).
 */
export async function isConversationDead(matchId: string): Promise<boolean> {
  const rowResult = db
    .prepare('SELECT MAX(sent_at) AS last_sent FROM messages WHERE match_id = ?')
    .get([matchId]);
  const row = (await awaitRow(rowResult)) as { last_sent: string | null } | undefined;
  const lastSent = row?.last_sent;
  if (lastSent == null || lastSent === '') {
    return true;
  }
  const last = new Date(lastSent).getTime();
  if (Number.isNaN(last)) return true;
  const limitMs = staleHours() * 3600 * 1000;
  return Date.now() - last > limitMs;
}

function pickFallbackStarter(shared: string[]): string {
  if (shared.length > 0) {
    const topic = shared[0];
    return `Okay but we both care about ${topic} — what's the hottest take you have about it?`;
  }
  return "I'm calling a Mulligan on the small talk — hit me with something real nobody asks on a first chat.";
}

const DEFAULT_EXPLANATION =
  'Fresh starter based on your profiles and what you have in common. Send it when it feels right.';

/**
 * Records a conversation reset and returns an AI (or fallback) starter for the match.
 * Token consumption is handled by the route before this runs.
 */
export async function resetConversation(
  matchId: string,
  initiatedBy: string,
  _useToken?: boolean
): Promise<{ starter: string; explanation: string; resetId: string }> {
  const matchResult = db.prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?').get([matchId]);
  const matchRow = (await awaitRow(matchResult)) as { user1_id: string; user2_id: string } | undefined;
  if (!matchRow) {
    throw new Error('Match not found');
  }

  const shared = await getSharedInterests(matchId, matchRow.user1_id, matchRow.user2_id);
  const sharedJson = JSON.stringify(shared);

  let starter = '';
  let explanation = DEFAULT_EXPLANATION;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: openaiKey });
      const interestsLine =
        shared.length > 0
          ? `Shared interests (use subtly, do not list): ${shared.slice(0, 8).join(', ')}.`
          : 'No shared interests on profiles — still write a bold, specific opener for two people who matched.';

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You write ONE short conversation starter message for a dating app chat, first person ("I" / "me"), max 220 characters. Cool, confident, adult — not cheesy, not a pun, not corporate. No hashtags. Output ONLY the message text.`,
          },
          {
            role: 'user',
            content: `${interestsLine}\nWrite one opener they can paste into chat.`,
          },
        ],
        temperature: 0.95,
        max_tokens: 120,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (content && content.length >= 8 && content.length <= 400) {
        starter = content;
        explanation =
          'AI-generated opener using your match context. You can edit before sending — keep it you.';
      }
    } catch (e) {
      console.warn('[mulliganMoments] OpenAI starter failed:', e);
    }
  }

  if (!starter) {
    starter = pickFallbackStarter(shared);
    explanation = DEFAULT_EXPLANATION;
  }

  const resetId = uuidv4();
  await (db
    .prepare(
      `INSERT INTO conversation_resets (id, match_id, initiated_by, reset_reason, ai_generated_starter, shared_interests_used, token_used)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run([resetId, matchId, initiatedBy, 'mulligan_token', starter, sharedJson]) as Promise<unknown>);

  return { starter, explanation, resetId };
}
