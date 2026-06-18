import * as FileSystem from 'expo-file-system';
import { getToken, resolveApiUrl } from './api';
import { getPhotoUrl } from './photoUrl';

const UPLOAD_TIMEOUT_MS = 180_000;

export function resolveIntroVideoUrl(url: string | null | undefined): string {
  return getPhotoUrl(url);
}

function mimeForExtension(ext: string): string {
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };
  return mimeTypes[ext] || 'video/mp4';
}

/** Copy to cache with a safe name — avoids iOS upload failures on `#`, spaces, or odd paths. */
async function prepareIntroVideoUri(localUri: string): Promise<{ uri: string; mimeType: string; name: string }> {
  const rawExt = localUri.toLowerCase().match(/\.(\w+)(?:\?|$)/)?.[1] || 'mp4';
  const ext = ['mp4', 'mov', 'm4v'].includes(rawExt) ? rawExt : 'mp4';
  const mimeType = mimeForExtension(ext);
  const name = `intro-${Date.now()}.${ext}`;

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error('Video file not found on your device. Please record or choose it again.');
  }

  const dest = `${FileSystem.cacheDirectory}${name}`;
  try {
    await FileSystem.copyAsync({ from: localUri, to: dest });
    return { uri: dest, mimeType, name };
  } catch {
    // Fall back to the original URI if copy fails (e.g. already in cache).
    return { uri: localUri, mimeType, name };
  }
}

function formatUploadError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return new Error('Upload timed out. Try a shorter clip or a stronger Wi‑Fi connection.');
    }
    if (/network request failed/i.test(err.message)) {
      return new Error(
        'Could not reach the server. Check your internet connection and try again.',
      );
    }
    return err;
  }
  return new Error('Upload failed. Please try again.');
}

export async function uploadProfileIntroVideo(localUri: string): Promise<string> {
  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Session expired. Please log in again.');
  }

  const { uri, mimeType, name } = await prepareIntroVideoUri(localUri);

  const formData = new FormData();
  formData.append('video', { uri, type: mimeType, name } as unknown as Blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(resolveApiUrl('/profile/intro-video'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    throw formatUploadError(err);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string' ? data.error : `Upload failed (${response.status})`,
    );
  }
  if (!data.introVideoUrl) {
    throw new Error('Upload succeeded but no video URL was returned.');
  }
  return data.introVideoUrl as string;
}

/** Bundled founder/example clip for onboarding Step 3. */
export const INTRO_VIDEO_EXAMPLE_SOURCE = require('../../assets/intro-video/intro-example.mp4');

/** Matches Luke's example clip (1080×720 landscape, same framing as the original recording). */
export const INTRO_VIDEO_EXAMPLE_ASPECT = 1080 / 720;
