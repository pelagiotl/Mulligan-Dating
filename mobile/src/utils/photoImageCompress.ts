import { requireOptionalNativeModule } from 'expo-modules-core';

const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.85;

/** Skip recompression for already-small JPEGs (picker output under ~900 KB). */
const SKIP_IF_BYTES_UNDER = 900_000;

function mimeForUri(uri: string): string {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

function filenameForUri(uri: string): string {
  const base = uri.split('/').pop()?.split('?')[0];
  if (base && /\.[a-z0-9]+$/i.test(base)) return base;
  return `photo-${Date.now()}.jpg`;
}

function passthrough(uri: string): { uri: string; mimeType: string; name: string } {
  return {
    uri,
    mimeType: mimeForUri(uri),
    name: filenameForUri(uri),
  };
}

async function estimateUriBytes(uri: string): Promise<number | null> {
  try {
    const { getInfoAsync } = await import('expo-file-system');
    const info = await getInfoAsync(uri, { size: true });
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {
    // ignore
  }
  return null;
}

let manipulatorUnavailable = false;

function imageManipulatorNativeAvailable(): boolean {
  return requireOptionalNativeModule('ExpoImageManipulator') != null;
}

function warnManipulatorUnavailable(): void {
  if (__DEV__) {
    console.warn(
      'Photo compression unavailable in this build — uploading original. Rebuild the app to enable expo-image-manipulator.',
    );
  }
}

/**
 * Resize and compress a local image URI before upload (matches web profile photo pipeline).
 * Falls back to the original URI when the native module is not in the current build yet.
 */
export async function compressPhotoUriForUpload(
  uri: string,
): Promise<{ uri: string; mimeType: string; name: string }> {
  const size = await estimateUriBytes(uri);
  const isJpeg = /\.jpe?g(\?|$)/i.test(uri);
  if (size != null && size <= SKIP_IF_BYTES_UNDER && isJpeg) {
    return passthrough(uri);
  }

  if (manipulatorUnavailable || !imageManipulatorNativeAvailable()) {
    if (!manipulatorUnavailable) {
      manipulatorUnavailable = true;
      warnManipulatorUnavailable();
    }
    return passthrough(uri);
  }

  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_EDGE } }],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    return {
      uri: result.uri,
      mimeType: 'image/jpeg',
      name: `photo-${Date.now()}.jpg`,
    };
  } catch (err) {
    manipulatorUnavailable = true;
    if (__DEV__) {
      console.warn(
        'Photo compression unavailable in this build — uploading original. Rebuild the app to enable expo-image-manipulator.',
        err instanceof Error ? err.message : err,
      );
    }
    return passthrough(uri);
  }
}

/** Compress multiple URIs in parallel before a batch upload. */
export async function compressPhotoUrisForUpload(
  uris: string[],
): Promise<Array<{ uri: string; mimeType: string; name: string }>> {
  return Promise.all(uris.map((uri) => compressPhotoUriForUpload(uri)));
}
