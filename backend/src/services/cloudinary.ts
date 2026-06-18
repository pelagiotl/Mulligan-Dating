import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';

const INTRO_VIDEO_CLOUDINARY_FOLDER = 'profile-intro-videos';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file buffer to Cloudinary
 * @param buffer - File buffer
 * @param folder - Folder path in Cloudinary (optional)
 * @param publicId - Public ID for the file (optional, will be auto-generated if not provided)
 * @returns Promise with the uploaded file's secure URL
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string = 'mulligan-photos',
  publicId?: string
): Promise<string> {
  // Validate Cloudinary configuration before attempting upload
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not properly configured. Missing environment variables.');
  }

  return new Promise((resolve, reject) => {
    // Validate buffer
    if (!buffer || buffer.length === 0) {
      reject(new Error('Invalid buffer: buffer is empty or undefined'));
      return;
    }

    if (buffer.length > 10 * 1024 * 1024) { // 10MB - warn for large files
      console.warn('⚠️  Large file detected:', (buffer.length / (1024 * 1024)).toFixed(2), 'MB');
    }

    const uploadOptions: any = {
      folder,
      resource_type: 'image',
      // Don't set format on upload - Cloudinary will detect it automatically
      // Use fetch_format: 'auto' for delivery transformations (applied when serving)
      quality: 'auto', // Auto-optimize quality
      timeout: 300000, // 5 minute timeout for large files
      chunk_size: 6000000, // 6MB chunks for large file uploads
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error: any, result: any) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', {
            message: error.message,
            http_code: error.http_code,
            name: error.name,
            error: error,
            // Include more details for debugging
            request_id: error.request_id,
            rate_limit_allowed: error.rate_limit_allowed,
            rate_limit_reset_at: error.rate_limit_reset_at
          });
          
          // Extract error message as string (handle objects)
          let errorMsg = 'Cloudinary upload failed';
          if (error.message) {
            if (typeof error.message === 'string') {
              errorMsg = error.message;
            } else {
              // If message is an object, try to extract useful info
              try {
                errorMsg = JSON.stringify(error.message);
              } catch {
                errorMsg = String(error.message);
              }
            }
          }
          
          // Preserve the original error object with all details
          const enhancedError: any = new Error(errorMsg);
          enhancedError.http_code = error.http_code;
          enhancedError.request_id = error.request_id;
          enhancedError.rate_limit_allowed = error.rate_limit_allowed;
          enhancedError.rate_limit_reset_at = error.rate_limit_reset_at;
          enhancedError.originalError = error; // Keep original for debugging
          
          // Provide more helpful error messages
          if (error.http_code === 401) {
            enhancedError.message = 'Cloudinary authentication failed. Please check your API credentials.';
          } else if (error.http_code === 400) {
            enhancedError.message = `Cloudinary upload rejected: ${errorMsg}`;
          } else if (error.http_code === 403) {
            enhancedError.message = 'Cloudinary access forbidden. Please check your account permissions.';
          } else if (error.http_code === 429) {
            enhancedError.message = 'Cloudinary rate limit exceeded. Please try again later.';
          } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
            enhancedError.message = 'Cloudinary upload timed out. Please try again.';
          } else if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED')) {
            enhancedError.message = 'Cannot connect to Cloudinary. Please check your network connection.';
          } else {
            enhancedError.message = `Cloudinary upload failed: ${errorMsg}`;
          }
          
          reject(enhancedError);
        } else if (result) {
          console.log('✅ Cloudinary upload successful:', result.secure_url);
          resolve(result.secure_url);
        } else {
          reject(new Error('Upload failed: No result returned from Cloudinary'));
        }
      }
    );

    // Handle stream errors
    uploadStream.on('error', (streamError: any) => {
      console.error('❌ Cloudinary stream error:', streamError);
      reject(new Error(`Stream error: ${streamError.message || 'Unknown stream error'}`));
    });

    // Convert buffer to stream
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

export type CloudinaryMediaUploadResult = {
  secureUrl: string;
  durationSec?: number;
};

/**
 * Upload a non-image file (video or raw/audio) to Cloudinary
 */
export async function uploadToCloudinaryMedia(
  buffer: Buffer,
  folder: string,
  resourceType: 'video' | 'raw' = 'video',
  publicId?: string
): Promise<CloudinaryMediaUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not properly configured.');
  }
  if (!buffer || buffer.length === 0) {
    throw new Error('Invalid buffer');
  }
  const maxSize = resourceType === 'video' ? 100 * 1024 * 1024 : 25 * 1024 * 1024; // 100MB video, 25MB audio
  if (buffer.length > maxSize) {
    throw new Error(`File too large (max ${maxSize / (1024 * 1024)}MB)`);
  }
  return new Promise((resolve, reject) => {
    const uploadOptions: any = {
      folder,
      resource_type: resourceType,
      timeout: 300000,
    };
    if (publicId) uploadOptions.public_id = publicId.replace(/^\//, ''); // Cloudinary expects no leading slash
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error: any, result: any) => {
        if (error) {
          reject(new Error(error.message || 'Upload failed'));
          return;
        }
        if (result?.secure_url) {
          resolve({
            secureUrl: result.secure_url,
            durationSec: typeof result.duration === 'number' ? result.duration : undefined,
          });
        } else reject(new Error('No URL returned'));
      }
    );
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

/**
 * Delete a file from Cloudinary by URL
 * @param url - The Cloudinary URL of the file to delete
 * @returns Promise<boolean> - true if deleted successfully
 */
function parseCloudinaryPublicId(url: string): string | null {
  const urlParts = url.split('/');
  const filenameWithExt = urlParts[urlParts.length - 1];
  const publicId = filenameWithExt.split('.')[0];
  const uploadIndex = urlParts.indexOf('upload');
  let fullPublicId = publicId;
  if (uploadIndex !== -1 && uploadIndex < urlParts.length - 2) {
    const versionIndex = uploadIndex + 1;
    const folderIndex = versionIndex + 1;
    if (urlParts[versionIndex]?.match(/^v\d+$/)) {
      if (folderIndex < urlParts.length - 1) {
        const folder = urlParts.slice(folderIndex, -1).join('/');
        fullPublicId = `${folder}/${publicId}`;
      }
    } else if (versionIndex < urlParts.length - 1) {
      const folder = urlParts.slice(versionIndex, -1).join('/');
      fullPublicId = `${folder}/${publicId}`;
    }
  }
  return fullPublicId;
}

export async function deleteFromCloudinary(
  url: string,
  resourceType: 'image' | 'video' | 'raw' = 'image',
): Promise<boolean> {
  try {
    const fullPublicId = parseCloudinaryPublicId(url);
    if (!fullPublicId) return false;

    const result = await cloudinary.uploader.destroy(fullPublicId, {
      resource_type: resourceType,
    });

    if (result.result === 'ok') {
      console.log('✅ Cloudinary delete successful:', fullPublicId);
      return true;
    } else {
      console.warn('⚠️ Cloudinary delete result:', result.result, 'for:', fullPublicId);
      return false;
    }
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
    return false;
  }
}

/** JPG snapshot at `offsetSec` into a hosted Cloudinary video (for moderation). */
export function buildCloudinaryVideoFrameUrl(videoUrl: string, offsetSec: number): string | null {
  const match = videoUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/i);
  if (!match) return null;
  const pathWithoutExt = match[2].replace(/\.[a-z0-9]+$/i, '');
  return `${match[1]}so_${offsetSec}/${pathWithoutExt}.jpg`;
}

export type IntroVideoDirectUploadParams = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadUrl: string;
};

/** Signed params so the app uploads intro clips directly to Cloudinary (skips proxying through Render). */
export function createIntroVideoDirectUploadParams(): IntroVideoDirectUploadParams {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const publicId = uuidv4();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = INTRO_VIDEO_CLOUDINARY_FOLDER;
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId },
    process.env.CLOUDINARY_API_SECRET!,
  );
  return {
    cloudName,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
  };
}

export function isAllowedIntroVideoCloudinaryUrl(url: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloud) return false;
  return (
    url.startsWith(`https://res.cloudinary.com/${cloud}/video/upload/`) &&
    url.includes(`/${INTRO_VIDEO_CLOUDINARY_FOLDER}/`)
  );
}

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
  const hasCloudName = !!process.env.CLOUDINARY_CLOUD_NAME;
  const hasApiKey = !!process.env.CLOUDINARY_API_KEY;
  const hasApiSecret = !!process.env.CLOUDINARY_API_SECRET;
  
  if (!hasCloudName || !hasApiKey || !hasApiSecret) {
    console.warn('⚠️  Cloudinary not fully configured. Missing:', {
      cloudName: !hasCloudName,
      apiKey: !hasApiKey,
      apiSecret: !hasApiSecret
    });
    return false;
  }
  
  return true;
}

