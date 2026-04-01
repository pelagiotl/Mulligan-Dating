/** Hermes / NOBRIDGE can throw if the handle is stale or the timer is cleared from its own callback. */
export function safeClearTimeout(id: ReturnType<typeof setTimeout> | null | undefined): void {
  if (id == null) return;
  try {
    clearTimeout(id);
  } catch {
    /* ignore */
  }
}
