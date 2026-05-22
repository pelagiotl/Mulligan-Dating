import { getToken } from './api';

export type UploadedPhotoResult = { id: string; url: string };

function mimeForFilename(filename: string): string {
  const match = /\.(\w+)$/.exec(filename.toLowerCase());
  if (!match) return 'image/jpeg';
  const ext = match[1].toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/** Upload one or more local image URIs in a single multipart request. */
export async function uploadPhotoUris(uris: string[]): Promise<UploadedPhotoResult[]> {
  if (uris.length === 0) return [];

  const token = await getToken();
  if (!token?.trim()) {
    throw new Error('No authentication token found. Please log in again.');
  }

  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
  const formData = new FormData();

  for (const uri of uris) {
    const filename = uri.split('/').pop() || 'photo.jpg';
    formData.append('photos', {
      uri,
      type: mimeForFilename(filename),
      name: filename,
    } as unknown as Blob);
  }

  const response = await fetch(`${API_URL}/api/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    let errorData: { error?: string; message?: string };
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText || `Upload failed with status ${response.status}` };
    }
    throw new Error(errorData.error || errorData.message || `Upload failed with status ${response.status}`);
  }

  const result = (await response.json()) as { photos?: UploadedPhotoResult[] };
  if (!result.photos?.length) {
    throw new Error('Invalid response from server');
  }
  return result.photos;
}
