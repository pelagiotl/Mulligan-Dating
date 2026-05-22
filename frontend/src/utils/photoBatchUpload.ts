import { compressImage } from "./photoImageCompress";

function getApiBase(): string {
  const API_URL =
    (import.meta.env as { VITE_API_URL?: string; VITE_NGROK_URL?: string }).VITE_API_URL ||
    (import.meta.env as { VITE_NGROK_URL?: string }).VITE_NGROK_URL ||
    "";
  return API_URL ? `${API_URL}/api` : "/api";
}

export type UploadedPhoto = { id: string; url: string };

export async function compressImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    try {
      out.push(await compressImage(file));
    } catch {
      out.push(file);
    }
  }
  return out;
}

/** Upload one or more photos in a single multipart request. */
export async function uploadPhotoFiles(
  files: File[],
  options?: {
    onCompressProgress?: (index: number, total: number) => void;
    onUploadProgress?: (percent: number) => void;
  }
): Promise<UploadedPhoto[]> {
  if (files.length === 0) return [];

  const compressed: File[] = [];
  for (let i = 0; i < files.length; i++) {
    options?.onCompressProgress?.(i, files.length);
    try {
      compressed.push(await compressImage(files[i]));
    } catch {
      compressed.push(files[i]);
    }
  }

  const formData = new FormData();
  compressed.forEach((file) => formData.append("photos", file));

  const token = localStorage.getItem("token");
  const BASE_URL = getApiBase();

  const data = await new Promise<{ photos?: UploadedPhoto[]; error?: string; message?: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();

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
              resolve(JSON.parse(xhr.responseText));
            } else {
              resolve({ message: "Photo uploaded successfully" });
            }
          } catch {
            resolve({ message: "Photo uploaded successfully" });
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
        reject(new Error(errorMessage));
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `${BASE_URL}/photos`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    }
  );

  if (!data.photos?.length) {
    throw new Error(data.error || "Invalid response from server");
  }
  return data.photos;
}
