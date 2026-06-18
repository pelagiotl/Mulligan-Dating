import * as ImageManipulator from 'expo-image-manipulator';

const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.85;

/** Skip recompression for already-small JPEGs (picker output under ~900 KB). */
const SKIP_IF_BYTES_UNDER = 900_000;

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

/**
 * Resize and compress a local image URI before upload (matches web profile photo pipeline).
 */
export async function compressPhotoUriForUpload(
  uri: string,
): Promise<{ uri: string; mimeType: string; name: string }> {
  const size = await estimateUriBytes(uri);
  const isJpeg = /\.jpe?g(\?|$)/i.test(uri);
  if (size != null && size <= SKIP_IF_BYTES_UNDER && isJpeg) {
    const name = uri.split('/').pop()?.split('?')[0] || `photo-${Date.now()}.jpg`;
    return { uri, mimeType: 'image/jpeg', name };
  }

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
}

/** Compress multiple URIs in parallel before a batch upload. */
export async function compressPhotoUrisForUpload(
  uris: string[],
): Promise<Array<{ uri: string; mimeType: string; name: string }>> {
  return Promise.all(uris.map((uri) => compressPhotoUriForUpload(uri)));
}
