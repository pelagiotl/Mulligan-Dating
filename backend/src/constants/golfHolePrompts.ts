/** Shared 18-hole prompt deck for Golf Dates — same question for both players per hole. */
export const GOLF_HOLE_PROMPTS: readonly string[] = [
  'Hole 1 — What first got you into golf (or wanting to try it)?',
  'Hole 2 — Best round or golf memory you have so far?',
  'Hole 3 — Morning tee time or golden-hour nine?',
  'Hole 4 — What’s your honest pre-round ritual?',
  'Hole 5 — Dream course you’d play together someday?',
  'Hole 6 — Are you competitive on the course, or is it more about the hang?',
  'Hole 7 — What’s a green flag on a first date for you?',
  'Hole 8 — Southern Oregon spot that always puts you in a good mood?',
  'Hole 9 — Halfway — what’s something most people misread about you?',
  'Hole 10 — Favorite non-golf hobby you’d want a partner to try with you?',
  'Hole 11 — What’s your idea of a perfect Sunday?',
  'Hole 12 — Big life goal you’re quietly working toward?',
  'Hole 13 — How do you recharge after a long week?',
  'Hole 14 — What’s a dealbreaker that isn’t about looks?',
  'Hole 15 — Best compliment you’ve ever gotten that actually stuck?',
  'Hole 16 — If this date were a mulligan on dating apps, what would you do differently?',
  'Hole 17 — What’s something you’re proud of that doesn’t show up on a profile?',
  'Hole 18 — Closing hole — what would make you want a second date?',
] as const;

export const GOLF_HOLE_COUNT = GOLF_HOLE_PROMPTS.length;

export function promptForHole(hole: number): string {
  const index = Math.min(Math.max(hole, 1), GOLF_HOLE_COUNT) - 1;
  return GOLF_HOLE_PROMPTS[index];
}
