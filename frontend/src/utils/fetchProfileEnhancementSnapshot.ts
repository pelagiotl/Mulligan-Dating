import { api } from "./api";
import type { ProfileEnhancementSnapshot } from "./profileEnhancementChecklist";

/** Load checklist fields for Better matches tips / celebration (photos + /profile). */
export async function fetchProfileEnhancementSnapshot(
  photoCountFallback: number
): Promise<ProfileEnhancementSnapshot> {
  let resolvedPhotoCount = photoCountFallback;
  try {
    const photosData = await api.get<{ photos?: unknown[] }>(`/photos/me?_=${Date.now()}`);
    if (Array.isArray(photosData.photos)) {
      resolvedPhotoCount = photosData.photos.length;
    }
  } catch {
    /* keep auth fallback */
  }

  try {
    const data = await api.get<{
      profile: {
        age?: number | null;
        gender?: string | null;
        looking_for?: string | null;
        lookingFor?: string | null;
      };
      interests: unknown[];
      dealbreakers: unknown[];
      lifestyle: ProfileEnhancementSnapshot["lifestyle"];
    }>("/profile");
    const profileRow = data.profile;
    return {
      photoCount: resolvedPhotoCount,
      age: profileRow?.age ?? null,
      gender: profileRow?.gender ?? null,
      interestsCount: data.interests?.length ?? 0,
      lookingFor: profileRow?.looking_for ?? profileRow?.lookingFor ?? null,
      lifestyle: data.lifestyle ?? null,
      dealbreakersCount: data.dealbreakers?.length ?? 0,
    };
  } catch {
    return {
      photoCount: resolvedPhotoCount,
      age: null,
      gender: null,
      interestsCount: 0,
      lookingFor: null,
      lifestyle: null,
      dealbreakersCount: 0,
    };
  }
}
