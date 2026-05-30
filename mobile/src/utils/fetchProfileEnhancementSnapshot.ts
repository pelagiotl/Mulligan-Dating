import { api } from './api';
import type { ProfileEnhancementSnapshot } from './profileEnhancementChecklist';

export async function fetchProfileEnhancementSnapshot(
  photoCountFallback: number
): Promise<ProfileEnhancementSnapshot> {
  let resolvedPhotoCount = photoCountFallback;
  try {
    const photosData = await api.get<{ photos?: { id: string }[] }>('/photos/me');
    if (Array.isArray(photosData.photos)) {
      resolvedPhotoCount = photosData.photos.length;
    }
  } catch {
    /* keep fallback */
  }

  try {
    const data = await api.get<{
      profile: { looking_for?: string | null; lookingFor?: string | null };
      interests: unknown[];
      dealbreakers: unknown[];
      lifestyle: ProfileEnhancementSnapshot['lifestyle'];
    }>('/profile');
    const profileRow = data.profile;
    return {
      photoCount: resolvedPhotoCount,
      interestsCount: data.interests?.length ?? 0,
      lookingFor: profileRow?.looking_for ?? profileRow?.lookingFor ?? null,
      lifestyle: data.lifestyle ?? null,
      dealbreakersCount: data.dealbreakers?.length ?? 0,
    };
  } catch {
    return {
      photoCount: resolvedPhotoCount,
      interestsCount: 0,
      lookingFor: null,
      lifestyle: null,
      dealbreakersCount: 0,
    };
  }
}
