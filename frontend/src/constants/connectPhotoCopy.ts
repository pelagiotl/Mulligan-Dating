import { MIN_PHOTOS_TO_CONNECT } from "../utils/connectProfileEligibility";
import { PROFILE_ENHANCEMENT_PHOTO_TARGET } from "../utils/profileEnhancementChecklist";

/** Minimum to unlock Connect (gate + modals). */
export const CONNECT_PHOTO_REQUIRED_LINE = "Add 1 photo to Connect.";

/** Shown under checklist / modals as recommendation (not required). */
export const CONNECT_PHOTO_RECOMMENDED_LINE = "2–3+ photos help you get better matches.";

export const CONNECT_PHOTOS_REQUIRED_MESSAGE = `${CONNECT_PHOTO_REQUIRED_LINE} ${CONNECT_PHOTO_RECOMMENDED_LINE}`;

export function profileEnhancementPhotoLabel(photoCount: number): string {
  if (photoCount < MIN_PHOTOS_TO_CONNECT) {
    return CONNECT_PHOTO_REQUIRED_LINE.replace(/\.$/, "");
  }
  return "Add 2+ photos (3+ recommended)";
}

export function profileEnhancementPhotoHint(photoCount: number): string | undefined {
  if (photoCount >= PROFILE_ENHANCEMENT_PHOTO_TARGET) return undefined;
  return CONNECT_PHOTO_RECOMMENDED_LINE;
}
