/** Minimum messages each person must send in a match chat before certain features unlock. */
export const MATCH_CHAT_DEPTH_MIN_EACH = 7;

export function matchChatDepthCounts(
  rows: Array<{ senderId: string }>,
  currentUserId: string,
  partnerUserId: string
): { my: number; their: number } {
  let my = 0;
  let their = 0;
  for (const m of rows) {
    if (m.senderId === currentUserId) my++;
    else if (m.senderId === partnerUserId) their++;
  }
  return { my, their };
}

export function matchChatDepthThresholdMet(
  rows: Array<{ senderId: string }>,
  currentUserId: string,
  partnerUserId: string
): boolean {
  const { my, their } = matchChatDepthCounts(rows, currentUserId, partnerUserId);
  return my >= MATCH_CHAT_DEPTH_MIN_EACH && their >= MATCH_CHAT_DEPTH_MIN_EACH;
}

export type MatchChatDepthFeature = "truth_or_dare" | "never_have_i_ever" | "date_plan";

export function matchChatDepthLockedMessage(feature: MatchChatDepthFeature): string {
  const n = MATCH_CHAT_DEPTH_MIN_EACH;
  switch (feature) {
    case "truth_or_dare":
      return `Truth or Dare unlocks after you and your match have each sent at least ${n} messages in this chat.`;
    case "never_have_i_ever":
      return `Never Have I Ever unlocks after you and your match have each sent at least ${n} messages in this chat.`;
    case "date_plan":
      return `Hangout plans unlock after you and your match have each sent at least ${n} messages in this chat.`;
  }
}
