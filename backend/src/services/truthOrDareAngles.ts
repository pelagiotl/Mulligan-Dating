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

const TRUTH_ANGLES_SPICY = [
  "raw desire they'd only admit after mutual tension",
  "a boundary they pretend is firm but would bend for the right person",
  "what 'almost' did to them — almost text, almost kiss, almost rule broken",
  "power — who had it, who wanted it, who lost it on purpose",
  "the message that made them weak — tone and timing, not the words",
  "fantasy they'd act on only with full consent and full chemistry",
  "jealousy that felt unfairly hot",
  "what they'd want permission to say before escalating",
  "restraint — what they held back and why it made it worse",
  "body language they'd use if they were alone together",
  "a line they crossed in chat that surprised them",
  "what they'd do if the other person said 'your move'",
  "late-night honesty they'd delete in the morning",
  "the difference between wanting someone and needing their attention",
  "a situation where they chose tension over clarity",
  "what they'd whisper if the room were empty",
  "how they know someone has them mentally undressed",
  "a risk they'd take in person they won't put in a bio",
  "what makes them feel desired vs merely wanted",
  "the last time they replayed someone's voice in their head",
];

const DARE_ANGLES_SPICY = [
  "voice note — slow, close-mic, one sentence that implies more",
  "selfie — collarbone, jaw, eyes; suggestive not explicit",
  "text — two lines max, would make them blush at 1 a.m.",
  "short video — gesture only: lip press, slow blink, neck touch",
  "confession dare — one honest thing about what you want from them",
  "permission dare — ask what they'd green-light before you go further",
  "tension dare — describe what you'd do on a couch, stop before explicit",
  "challenge dare — dare them back in the same energy",
  "slow-burn dare — imply the next move without naming acts",
  "power dare — who leads, who waits, who breaks first",
  "emoji dare — sequence that reads adult, not silly",
  "hypothetical dare — 'if you were here right now…' then stop",
  "compliment dare — specific, physical-adjacent, not crude",
  "restraint dare — admit what you're not sending yet",
  "mirror dare — match their flirt energy on purpose",
  "voice dare — say it like you're already alone together",
  "eyes dare — look at camera like you're deciding to make a move",
  "boundary dare — one negotiable, one not — one sentence each",
  "anticipation dare — what you're saving for when you meet",
  "callback dare — reference the vibe between you two hypothetically",
];

export type CreativeAngleSpice = "pg13" | "ratedr" | "spicy";

export function randomCreativeAngle(type: "truth" | "dare", spiceLevel?: CreativeAngleSpice): string {
  let pool = type === "truth" ? TRUTH_ANGLES : DARE_ANGLES;
  if (spiceLevel === "spicy") {
    pool = type === "truth" ? TRUTH_ANGLES_SPICY : DARE_ANGLES_SPICY;
  }
  return pool[Math.floor(Math.random() * pool.length)] ?? "something fresh and specific to these two people";
}
