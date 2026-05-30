import {
  clearProfileEnhancementCelebrationShown,
  isProfileEnhancementCelebrationShown,
  profileEnhancementIsComplete,
} from './profileEnhancementChecklist';
import { fetchProfileEnhancementSnapshot } from './fetchProfileEnhancementSnapshot';

/** After profile edits: show Better matches celebration if checklist just became complete. */
export async function maybeShowProfileEnhancementCelebration(
  photoCountFallback: number,
  onShow: () => void,
  onHide?: () => void
): Promise<void> {
  const snapshot = await fetchProfileEnhancementSnapshot(photoCountFallback);
  if (!profileEnhancementIsComplete(snapshot)) {
    await clearProfileEnhancementCelebrationShown();
    onHide?.();
    return;
  }
  const shown = await isProfileEnhancementCelebrationShown();
  if (!shown) {
    onShow();
  }
}
