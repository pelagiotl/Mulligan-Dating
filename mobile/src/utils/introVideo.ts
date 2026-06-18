import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { getToken, resolveApiUrl, getMultipartUploadHeaders, api, ApiError } from './api';
import { getPhotoUrl } from './photoUrl';
import {
  INTRO_VIDEO_MAX_DURATION_MS,
  introVideoDurationError,
} from '../constants/introVideoCopy';

const UPLOAD_TIMEOUT_MS = 180_000;
const CONFIRM_TIMEOUT_MS = 90_000;
const MAX_INTRO_VIDEO_BYTES = 28 * 1024 * 1024;
const DURATION_TOLERANCE_MS = 500;

export type IntroVideoUploadStage = 'preparing' | 'uploading' | 'finishing';

type UploadOptions = {
  onStage?: (stage: IntroVideoUploadStage) => void;
  knownDurationMs?: number | null;
};

type CloudinaryDirectUploadParams = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  duration?: number;
  error?: { message?: string };
};

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

  if (FileSystem.cacheDirectory && localUri.startsWith(FileSystem.cacheDirectory)) {
    return { uri: localUri, mimeType, name };
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
  if (err instanceof ApiError) {
    return new Error(err.message);
  }
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

/** Reject clips over the intro max before upload (library picks may ignore videoMaxDuration). */
export async function assertIntroVideoDuration(localUri: string): Promise<void> {
  let durationMs: number | null = null;
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: localUri }, { shouldPlay: false });
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis != null) {
        durationMs = status.durationMillis;
      }
    } finally {
      await sound.unloadAsync();
    }
  } catch {
    // If duration can't be read, server-side Cloudinary check still applies.
  }

  if (
    durationMs != null &&
    durationMs > INTRO_VIDEO_MAX_DURATION_MS + DURATION_TOLERANCE_MS
  ) {
    throw new Error(introVideoDurationError(durationMs));
  }
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

async function uploadViaBackendProxy(
  uri: string,
  mimeType: string,
  name: string,
  token: string,
): Promise<string> {
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

async function uploadDirectToCloudinary(
  uri: string,
  mimeType: string,
  params: CloudinaryDirectUploadParams,
): Promise<{ secureUrl: string; durationSec?: number }> {
  const uploadPromise = FileSystem.uploadAsync(params.uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    parameters: {
      api_key: params.apiKey,
      timestamp: String(params.timestamp),
      signature: params.signature,
      folder: params.folder,
      public_id: params.publicId,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const err = new Error('Upload timed out');
      err.name = 'AbortError';
      reject(err);
    }, UPLOAD_TIMEOUT_MS);
  });

  const result = await Promise.race([uploadPromise, timeoutPromise]);
  let data: CloudinaryUploadResponse = {};
  try {
    data = JSON.parse(result.body) as CloudinaryUploadResponse;
  } catch {
    // ignore
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(data.error?.message || `Cloudinary upload failed (${result.status})`);
  }
  if (!data.secure_url) {
    throw new Error('Cloudinary upload succeeded but no URL was returned.');
  }
  return {
    secureUrl: data.secure_url,
    durationSec: typeof data.duration === 'number' ? data.duration : undefined,
  };
}

async function confirmIntroVideoOnServer(secureUrl: string, durationSec?: number): Promise<string> {
  const data = await api.post<{ introVideoUrl?: string }>(
    '/profile/intro-video/confirm',
    { secureUrl, durationSec },
    { timeoutMs: CONFIRM_TIMEOUT_MS },
  );
  if (!data.introVideoUrl) {
    throw new Error('Upload succeeded but no video URL was returned.');
  }
  return data.introVideoUrl;
}

export async function uploadProfileIntroVideo(
  localUri: string,
  options?: UploadOptions,
): Promise<string> {
  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('Session expired. Please log in again.');
  }

  options?.onStage?.('preparing');
  const { uri, mimeType, name } = await prepareIntroVideoUri(localUri);
  if (options?.knownDurationMs != null) {
    if (options.knownDurationMs > INTRO_VIDEO_MAX_DURATION_MS + DURATION_TOLERANCE_MS) {
      throw new Error(introVideoDurationError(options.knownDurationMs));
    }
  } else {
    await assertIntroVideoDuration(uri);
  }

  let params: CloudinaryDirectUploadParams | null = null;
  try {
    params = await api.post<CloudinaryDirectUploadParams>('/profile/intro-video/upload-params', {});
  } catch (paramsErr) {
    if (
      paramsErr instanceof ApiError &&
      (paramsErr.status === 503 || paramsErr.status === 404)
    ) {
      options?.onStage?.('uploading');
      return uploadViaBackendProxy(uri, mimeType, name, token);
    }
    throw formatUploadError(paramsErr);
  }

  options?.onStage?.('uploading');
  const uploaded = await uploadDirectToCloudinary(uri, mimeType, params);
  options?.onStage?.('finishing');
  return confirmIntroVideoOnServer(uploaded.secureUrl, uploaded.durationSec);
}

/** Bundled founder/example clip for onboarding Step 3. */
export const INTRO_VIDEO_EXAMPLE_SOURCE = require('../../assets/intro-video/intro-example.mp4');

/** Matches Luke's example clip (1080×720 landscape, same framing as the original recording). */
export const INTRO_VIDEO_EXAMPLE_ASPECT = 1080 / 720;
