export type AdminDisplayPhoto = {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
};

/** Prefer API `photos`; fall back to profile.photo_url (legacy / cached responses). */
export function getAdminDisplayPhotos(
  photos: AdminDisplayPhoto[] | undefined,
  profile: { photo_url?: string | null } | null | undefined,
): AdminDisplayPhoto[] {
  if (photos && photos.length > 0) return photos;
  const legacy = profile?.photo_url;
  if (typeof legacy === 'string' && legacy.trim()) {
    return [
      {
        id: 'profile-photo-url',
        url: legacy.trim(),
        displayOrder: 0,
        isPrimary: true,
      },
    ];
  }
  return [];
}
