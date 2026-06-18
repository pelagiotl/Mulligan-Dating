import * as FileSystem from 'expo-file-system';
import { getToken, resolveApiUrl, getMultipartUploadHeaders } from './api';
import { getPhotoUrl } from './photoUrl';

const UPLOAD_TIMEOUT_MS = 180_000;
const MAX_INTRO_VIDEO_BYTES = 28 * 1024 * 1024;

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

  const info = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!info.exists) {
    throw new Error('Video file not found on your device. Please record or choose it again.');
  }
  if (typeof info.size === 'number' && info.size > MAX_INTRO_VIDEO_BYTES) {
    throw new Error(
      'Video is too large. Please record a clip under 15 seconds or choose a smaller file.',
    );
  }

  const dest = `${FileSystem.cacheDirectory}${name}`;
  try {
    await FileSystem.copyAsync({ from: localUri, to: dest });
    const copied = await FileSystem.getInfoAsync(dest, { size: true });
    if (typeof copied.size === 'number' && copied.size > MAX_INTRO_VIDEO_BYTES) {
      throw new Error(
        'Video is too large. Please record a clip under 15 seconds or choose a smaller file.',
      );
    }
    return { uri: dest, mimeType, name };
  } catch (err) {
    if (err instanceof Error && err.message.includes('too large')) throw err;
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

function parseUploadResponse(body: string, status: number): string {
  let data: { introVideoUrl?: string; error?: string } = {};
  try {
    data = JSON.parse(body) as { introVideoUrl?: string; error?: string };
  } catch {
    // ignore
  }
  if (status < 200 || status >= 300) {
    throw new Error(data.error || `Upload failed (${status})`);
  }
  if (!data.introVideoUrl) {
    throw new Error('Upload succeeded but no video URL was returned.');
  }
  return data.introVideoUrl;
}

async function uploadWithFileSystem(
  url: string,
  uri: string,
  mimeType: string,
  token: string,
): Promise<string> {
  const uploadPromise = FileSystem.uploadAsync(url, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'video',
    mimeType,
    headers: getMultipartUploadHeaders(token),
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const err = new Error('Upload timed out');
      err.name = 'AbortError';
      reject(err);
    }, UPLOAD_TIMEOUT_MS);
  });

  const result = await Promise.race([uploadPromise, timeoutPromise]);
  return parseUploadResponse(result.body, result.status);
}

async function uploadWithFetch(
  url: string,
  uri: string,
  mimeType: string,
  name: string,
  token: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('video', { uri, type: mimeType, name } as unknown as Blob);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getMultipartUploadHeaders(token),
      body: formData,
      signal: controller.signal,
    });
    const body = await response.text();
    return parseUploadResponse(body, response.status);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function uploadProfileIntroVideo(localUri: string): Promise<string> {
  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Session expired. Please log in again.');
  }

  const { uri, mimeType, name } = await prepareIntroVideoUri(localUri);
  const url = resolveApiUrl('/profile/intro-video');

  try {
    return await uploadWithFileSystem(url, uri, mimeType, token);
  } catch (fsErr) {
    try {
      return await uploadWithFetch(url, uri, mimeType, name, token);
    } catch (fetchErr) {
      throw formatUploadError(fetchErr ?? fsErr);
    }
  }
}

/** Bundled founder/example clip for onboarding Step 3. */
export const INTRO_VIDEO_EXAMPLE_SOURCE = require('../../assets/intro-video/intro-example.mp4');

/** Matches Luke's example clip (1080×720 landscape, same framing as the original recording). */
export const INTRO_VIDEO_EXAMPLE_ASPECT = 1080 / 720;
