import { getToken } from './api';
import { getPhotoUrl } from './photoUrl';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
const BASE_URL = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');

export function resolveIntroVideoUrl(url: string | null | undefined): string {
  return getPhotoUrl(url);
}

export async function uploadProfileIntroVideo(localUri: string): Promise<string> {
  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Session expired. Please log in again.');
  }

  const filename = localUri.split('/').pop() || 'intro.mp4';
  const ext = filename.toLowerCase().match(/\.(\w+)$/)?.[1] || 'mp4';
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };
  const mimeType = mimeTypes[ext] || 'video/mp4';

  const formData = new FormData();
  formData.append('video', { uri: localUri, type: mimeType, name: filename } as unknown as Blob);

  const response = await fetch(`${BASE_URL}/api/profile/intro-video`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Upload failed (${response.status})`);
  }
  if (!data.introVideoUrl) {
    throw new Error('Upload succeeded but no video URL was returned.');
  }
  return data.introVideoUrl as string;
}

/** Bundled founder/example clip for onboarding Step 3. */
export const INTRO_VIDEO_EXAMPLE_SOURCE = require('../../assets/intro-video/intro-example.mp4');
