import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

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
  return new Promise((resolve, reject) => {
    const uploadOptions: any = {
      folder,
      resource_type: 'image',
      format: 'auto', // Auto-optimize format (WebP when supported)
      quality: 'auto', // Auto-optimize quality
      fetch_format: 'auto',
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error: any, result: any) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else if (result) {
          console.log('✅ Cloudinary upload successful:', result.secure_url);
          resolve(result.secure_url);
        } else {
          reject(new Error('Upload failed: No result returned'));
        }
      }
    );

    // Convert buffer to stream
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
export async function deleteFromCloudinary(url: string): Promise<boolean> {
  try {
    // Extract public_id from Cloudinary URL
    // Cloudinary URLs format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
    const urlParts = url.split('/');
    const filenameWithExt = urlParts[urlParts.length - 1];
    const publicId = filenameWithExt.split('.')[0];
    
    // Get folder from URL if present
    const uploadIndex = urlParts.indexOf('upload');
    let fullPublicId = publicId;
    if (uploadIndex !== -1 && uploadIndex < urlParts.length - 2) {
      // Check if there's a version number (v1234567890)
      const versionIndex = uploadIndex + 1;
      const folderIndex = versionIndex + 1;
      if (urlParts[versionIndex]?.match(/^v\d+$/)) {
        // Has version, folder is after version
        if (folderIndex < urlParts.length - 1) {
          const folder = urlParts.slice(folderIndex, -1).join('/');
          fullPublicId = `${folder}/${publicId}`;
        }
      } else {
        // No version, folder might be at versionIndex
        if (versionIndex < urlParts.length - 1) {
          const folder = urlParts.slice(versionIndex, -1).join('/');
          fullPublicId = `${folder}/${publicId}`;
        }
      }
    }

    const result = await cloudinary.uploader.destroy(fullPublicId, {
      resource_type: 'image',
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

/**
 * Check if Cloudinary is configured
 */
export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

