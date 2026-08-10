/** Default / man / unspecified — matches current Play UI. */
export const GOLFER_EMOJI_DEFAULT = '🏌️';
export const GOLFER_EMOJI_WOMAN = '🏌️‍♀️';

/**
 * Golfer emoji from profile gender. Defaults to the generic man golfer
 * when gender is missing (new accounts) or not Man/Woman.
 */
export function golferEmojiForGender(gender?: string | null): string {
  const g = String(gender ?? '')
    .trim()
    .toLowerCase();
  if (g === 'woman' || g === 'female' || g === 'women') {
    return GOLFER_EMOJI_WOMAN;
  }
  return GOLFER_EMOJI_DEFAULT;
}
