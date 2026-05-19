/**
 * Rotating "creative angles" nudge the model toward different axes each round
 * so prompts stay diverse without maintaining an enormous static catalog.
 */

const TRUTH_ANGLES = [
  "emotional honesty — what they hide until they trust someone",
  "standards and boundaries — what they refuse to compromise",
  "chemistry vs compatibility — how they tell the difference",
  "risk they've taken for attraction",
  "a time they misread signals",
  "what makes them feel chosen, not just liked",
  "their relationship with jealousy or competition",
  "how they recover after being hurt",
  "what they find hot that isn't about looks",
  "the last time they were surprised by themselves",
  "what they'd tell a younger version of themselves about dating",
  "how they know they're catching feelings",
  "a double standard they catch themselves using",
  "what intimacy means to them beyond physical",
  "a green flag they trust immediately",
  "a red flag they ignored and regretted",
  "how they handle someone pulling away",
  "what they need to hear vs what they want to hear",
  "their honest relationship with apps and validation",
  "what 'good tension' feels like to them",
  "a crush or situationship they never told anyone about",
  "what would make them delete the apps for someone",
  "how they flirt when they mean it",
  "what they overthink before a first meet",
  "their tell when they're nervous but acting cool",
  "what they wish people asked on dates more often",
  "a compliment that actually landed",
  "the line between flirting and leading someone on",
  "a text they rewrote too many times before sending",
  "when they pretended to be unbothered but were not",
  "what attention vs real interest feels like to them",
  "a situationship they should have ended sooner",
];

const DARE_ANGLES = [
  "voice note — tone and pacing matter more than words",
  "selfie — expression and eyes, not the background",
  "short video — confident silence or one gesture beats a speech",
  "text-only — wit, specificity, no generic pickup lines",
  "one bold compliment they'd never type in a bio",
  "react to a hypothetical 'they just texted you…' beat",
  "show don't tell: body language that says interested",
  "micro-story in one sentence — setup and punch",
  "three words only — each word has to earn its place",
  "emoji-only reply that still feels adult",
  "half-joke half-serious — deadpan delivery",
  "vulnerability without oversharing — one real detail",
  "playful challenge — dare them back in spirit",
  "slow burn — imply more than you say",
  "directness — no hedging, no 'lol' shield",
  "confidence without arrogance",
  "heat without naming explicit acts",
  "something they'd only do for someone they're into",
  "mirror their energy — match or contrast on purpose",
  "callback — reference something from the chat vibe hypothetically",
  "one thing they'd want to know before a first kiss",
  "honest 'type' in words they'd never put in a profile",
  "reaction clip — genuine laugh or fake-serious judge face",
  "angle or lighting choice that feels intentional",
  "voice note as if they're already comfortable with this person",
  "text that would make the other person lean in",
  "video: one second of hesitation before answering",
  "selfie that matches their texting energy",
  "dare that could only work in chat, not IRL",
];

export function randomCreativeAngle(type: "truth" | "dare"): string {
  const pool = type === "truth" ? TRUTH_ANGLES : DARE_ANGLES;
  return pool[Math.floor(Math.random() * pool.length)] ?? "something fresh and specific to these two people";
}
