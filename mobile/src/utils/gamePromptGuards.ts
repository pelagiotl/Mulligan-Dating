/** Mirrors backend gamePromptGuards — filters client fallback prompts when API is unavailable. */

const BANNED_GAME_PROMPT_THEME_RE =
  /\b(concert|concerts|festival|festivals|gig|gigs|band|bands|playlist|playlists|spotify|karaoke|song|songs|lyrics|music scene|live music|travel|travels|traveled|travelling|traveling|trip|trips|vacation|vacations|airport|airports|flight|flights|road trip|roadtrip|hotel|resort|sports game|game day|stadium)\b/i;

export function hasBannedGamePromptTheme(prompt: string): boolean {
  return BANNED_GAME_PROMPT_THEME_RE.test(prompt);
}

export function filterBannedGamePrompts<T extends string>(prompts: T[]): T[] {
  const filtered = prompts.filter((p) => !hasBannedGamePromptTheme(p));
  return filtered.length > 0 ? filtered : prompts;
}
