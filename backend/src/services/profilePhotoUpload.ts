import type { Express } from 'express';
import { uploadToCloudinary, deleteFromCloudinary } from './cloudinary.js';
import { compressImageForCloudinary } from './imageCompression.js';
import {
  moderateImageAtUrl,
  moderateImageUpload,
  readUploadBuffer,
  ContentModerationError,
} from './contentModeration.js';

export async function resolvePhotoBuffer(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer?.length) return file.buffer;
  return readUploadBuffer(file);
}

/** Upload to Cloudinary, then moderate via URL (delete asset if rejected). */
export async function uploadProfilePhotoToCloudinary(
  file: Express.Multer.File,
  photoId: string,
): Promise<string> {
  const buffer = await resolvePhotoBuffer(file);
  if (buffer.length === 0) {
    throw new Error('File is empty');
  }

  let imageBuffer = buffer;
  if (buffer.length > 10 * 1024 * 1024) {
    imageBuffer = await compressImageForCloudinary(buffer, 10 * 1024 * 1024);
  }

  const photoUrl = await uploadToCloudinary(imageBuffer, 'mulligan-photos', photoId);

  try {
    await moderateImageAtUrl(photoUrl);
  } catch (err) {
    await deleteFromCloudinary(photoUrl, 'image');
    throw err;
  }

  return photoUrl;
}

/** Chat image — same Cloudinary-first moderation path. */
export async function uploadChatImageToCloudinary(buffer: Buffer, mimeType: string): Promise<string> {
  if (!buffer?.length) throw new Error('File is empty');
  let imageBuffer = buffer;
  if (buffer.length > 10 * 1024 * 1024) {
    imageBuffer = await compressImageForCloudinary(buffer, 10 * 1024 * 1024);
  }
  const imageUrl = await uploadToCloudinary(imageBuffer, 'chat-images');
  try {
    await moderateImageAtUrl(imageUrl);
  } catch (err) {
    await deleteFromCloudinary(imageUrl, 'image');
    throw err;
  }
  return imageUrl;
}

/** Local dev fallback — moderate bytes before persisting to disk. */
export async function moderateLocalPhotoFile(file: Express.Multer.File): Promise<void> {
  const moderationBuffer = await resolvePhotoBuffer(file);
  await moderateImageUpload(moderationBuffer, file.mimetype);
}

export { ContentModerationError };
