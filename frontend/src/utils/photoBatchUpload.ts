import { api } from "./api";
import { compressImage } from "./photoImageCompress";

function getApiBase(): string {
  const API_URL =
    (import.meta.env as { VITE_API_URL?: string; VITE_NGROK_URL?: string }).VITE_API_URL ||
    (import.meta.env as { VITE_NGROK_URL?: string }).VITE_NGROK_URL ||
    "";
  return API_URL ? `${API_URL}/api` : "/api";
}

const UPLOAD_TIMEOUT_MS = 120_000;

async function recoverPhotosAfterUpload(expectedCount: number): Promise<UploadedPhoto[]> {
  const pm = await api.get<{ photos?: UploadedPhoto[] }>(`/photos/me?_=${Date.now()}`);
  const photos = Array.isArray(pm.photos) ? pm.photos : [];
  if (photos.length >= expectedCount) {
    return photos.slice(-expectedCount);
  }
  throw new Error("Invalid response from server");
}

export type UploadedPhoto = { id: string; url: string };

/** Resize images in parallel before upload. */
export async function compressImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        return await compressImage(file);
      } catch {
        return file;
      }
    })
  );
}

/** Upload already-compressed image files in one multipart request. */
export async function uploadCompressedFiles(
  compressed: File[],
  options?: {
    onUploadProgress?: (percent: number) => void;
  }
): Promise<UploadedPhoto[]> {
  if (compressed.length === 0) return [];

  const formData = new FormData();
  compressed.forEach((file) => formData.append("photos", file));

  const token = localStorage.getItem("token");
  const BASE_URL = getApiBase();

  const data = await new Promise<{ photos?: UploadedPhoto[]; error?: string; message?: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn();
      };

      const timeoutId = setTimeout(() => {
        xhr.abort();
        reject(new Error("UPLOAD_TIMEOUT"));
      }, UPLOAD_TIMEOUT_MS);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          options?.onUploadProgress?.(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const contentType = xhr.getResponseHeader("content-type");
            if (contentType?.includes("application/json")) {
              finish(() => resolve(JSON.parse(xhr.responseText)));
            } else {
              finish(() => resolve({ message: "Photo uploaded successfully" }));
            }
          } catch {
            finish(() => resolve({ message: "Photo uploaded successfully" }));
          }
          return;
        }
        let errorMessage = `Failed to upload photos (${xhr.status})`;
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = xhr.responseText || errorMessage;
        }
        finish(() => reject(new Error(errorMessage)));
      });

      xhr.addEventListener("error", () => finish(() => reject(new Error("Network error during upload"))));
      xhr.addEventListener("abort", () => {
        if (!settled) finish(() => reject(new Error("UPLOAD_TIMEOUT")));
      });

      xhr.open("POST", `${BASE_URL}/photos`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    }
  ).catch(async (err) => {
    if (err instanceof Error && err.message === "UPLOAD_TIMEOUT") {
      return recoverPhotosAfterUpload(compressed.length);
    }
    throw err;
  });

  if (Array.isArray(data)) return data;

  if (data.photos?.length) return data.photos;

  return recoverPhotosAfterUpload(compressed.length);
}

/** Compress (in parallel) then upload one or more photos in a single request. */
export async function uploadPhotoFiles(
  files: File[],
  options?: {
    onCompressProgress?: (index: number, total: number) => void;
    onUploadProgress?: (percent: number) => void;
    /** When set, skip compression (e.g. already compressed while saving profile). */
    precompressed?: File[];
  }
): Promise<UploadedPhoto[]> {
  if (files.length === 0 && !options?.precompressed?.length) return [];

  const compressed = options?.precompressed ?? (await compressImageFiles(files));

  if (options?.onCompressProgress && !options.precompressed) {
    options.onCompressProgress(compressed.length, compressed.length);
  }

  return uploadCompressedFiles(compressed, {
    onUploadProgress: options?.onUploadProgress,
  });
}
