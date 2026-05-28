/**
 * Shared helpers for per-match game prompt history (Truth or Dare + NHIE).
 * Both players in a match share one history list so prompts never repeat in the same session.
 */

const DEFAULT_MAX_USED = 80;

/** Normalize for duplicate checks — case, whitespace, optional NHIE prefix, trailing punctuation. */
export function normalizeGamePrompt(prompt: string | null | undefined): string {
  return String(prompt || '')
    .toLowerCase()
    .replace(/^never\s+have\s+i\s+ever\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseUsedPromptsJson(raw: unknown): string[] {
  try {
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      }
    }
    if (Array.isArray(raw)) {
      return raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function isPromptAlreadyUsed(
  prompt: string | null | undefined,
  usedPrompts: string[],
): boolean {
  const norm = normalizeGamePrompt(prompt);
  if (!norm) return false;
  return usedPrompts.some((p) => normalizeGamePrompt(p) === norm);
}

/** Build exclusion list from stored history + optional current prompt on screen. */
export function buildExcludePromptList(
  usedPrompts: string[],
  currentPrompt?: string | null,
): string[] {
  const out = [...usedPrompts];
  if (currentPrompt?.trim()) out.push(currentPrompt.trim());
  return out;
}

/** Append a prompt to session history (deduped, capped). */
export function appendUsedPrompt(
  usedPrompts: string[],
  prompt: string,
  maxSize = DEFAULT_MAX_USED,
): string[] {
  const trimmed = prompt.trim();
  if (!trimmed || isPromptAlreadyUsed(trimmed, usedPrompts)) {
    return usedPrompts.slice(-maxSize);
  }
  return [...usedPrompts, trimmed].slice(-maxSize);
}

export const GAME_PROMPT_HISTORY_MAX = DEFAULT_MAX_USED;
