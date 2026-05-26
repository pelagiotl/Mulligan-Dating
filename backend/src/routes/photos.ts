import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { uploadMultiple, uploadSingle } from "../middleware/upload.js";
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from "../services/cloudinary.js";
import { compressImageForCloudinary } from "../services/imageCompression.js";
import { notifyPartnersProfileChanged } from "../services/partnerProfileBroadcast.js";
import fs from "fs";
import path from "path";

export const photosRouter = Router();

/** Normalize is_primary from SQLite (0/1) or Postgres (boolean). */
function rowIsPrimary(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

/** Row shape from photos table SELECT used by list endpoints. */
type PhotoListRow = {
  id: string;
  url: string;
  display_order: number;
  is_primary: unknown;
  created_at: string;
};

/**
 * When Cloudinary is enabled, URLs may be https, protocol-relative, or legacy
 * relative paths — do not drop rows just because they lack an "http" prefix.
 */
function filterPhotosForResponse(photos: PhotoListRow[]): PhotoListRow[] {
  const nonEmpty = photos.filter((p) => typeof p.url === "string" && p.url.length > 0);
  if (isCloudinaryConfigured()) {
    return nonEmpty;
  }
  return nonEmpty.filter((p) => {
    if (p.url.startsWith("http://") || p.url.startsWith("https://") || p.url.startsWith("//")) {
      return true;
    }
    const filePath = path.join(process.cwd(), p.url);
    return fs.existsSync(filePath);
  });
}

// Helper function to clean up orphaned photos (database records without files)
async function cleanupOrphanedPhotos(profileId: string): Promise<number> {
  try {
    const photosResult = await (db
      .prepare("SELECT id, url FROM photos WHERE profile_id = ?")
      .all([profileId]) as Promise<{ id: string; url: string }[]>);
    
    const photos = Array.isArray(photosResult) ? photosResult : [];
    console.log(`Cleanup: Found ${photos.length} photo record(s) in database for profile ${profileId}`);
    
    // Skip cleanup if using Cloudinary (URLs are always valid)
    if (isCloudinaryConfigured()) {
      console.log(`Cleanup: Using Cloudinary - skipping file existence checks`);
      return 0;
    }
    
    let cleanedCount = 0;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    console.log(`Cleanup: Checking files in directory: ${uploadsDir}`);
    
    for (const photo of photos) {
      // Skip Cloudinary URLs
      if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
        continue;
      }
      
      const filePath = path.join(process.cwd(), photo.url);
      const fileExists = fs.existsSync(filePath);
      console.log(`Cleanup: Photo ${photo.id} - URL: ${photo.url}, Path: ${filePath}, Exists: ${fileExists}`);
      
      if (!fileExists) {
        // File doesn't exist, delete the database record
        console.log(`Cleanup: Removing orphaned photo record: ${photo.id} (file missing: ${photo.url})`);
        await (db.prepare("DELETE FROM photos WHERE id = ?").run([photo.id]) as Promise<any>);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleanup: Removed ${cleanedCount} orphaned photo record(s) for profile ${profileId}`);
    } else {
      console.log(`Cleanup: No orphaned photos found for profile ${profileId}`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error("Error cleaning up orphaned photos:", error);
    return 0;
  }
}

// Manual cleanup endpoint (for debugging)
photosRouter.post("/cleanup", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const cleanedCount = await cleanupOrphanedPhotos(profile.id);
    res.json({ 
      message: `Cleaned up ${cleanedCount} orphaned photo(s)`,
      cleanedCount 
    });
  } catch (error) {
    console.error("Manual cleanup error:", error);
    res.status(500).json({ error: "Failed to clean up photos" });
  }
});

// Upload multiple photos for a profile
photosRouter.post("/", authenticateToken, (req: AuthRequest, res, next) => {
  // Handle multer errors
  uploadMultiple(req, res, (err) => {
    if (err) {
      console.error("Multer upload error:", err);
      if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: "File upload error" });
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Get user's profile
    const profileResult = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]);
    const profile = (profileResult instanceof Promise
      ? await profileResult
      : profileResult) as { id: string } | undefined;

    if (!profile) {
      console.error('Photo upload: Profile not found for user:', userId);
      return res.status(404).json({ error: "Profile not found. Please create a profile first." });
    }

    console.log('Photo upload: Profile found:', profile.id);

    // Clean up orphaned photos (database records without files)
    await cleanupOrphanedPhotos(profile.id);

    // Check current photo count (after cleanup)
    const currentPhotoCountResult = db
      .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
      .get([profile.id]);
    const currentPhotoCount = (currentPhotoCountResult instanceof Promise
      ? await currentPhotoCountResult
      : currentPhotoCountResult) as { count: number | string };

    // Also get actual photo records to verify
    const actualPhotosResult = db
      .prepare("SELECT id, url FROM photos WHERE profile_id = ?")
      .all([profile.id]);
    const actualPhotosArray = (actualPhotosResult instanceof Promise
      ? await actualPhotosResult
      : actualPhotosResult) as { id: string; url: string }[];
    const actualPhotos = Array.isArray(actualPhotosArray) ? actualPhotosArray : [];
    
    // Ensure count is a number (some DBs return strings)
    const photoCount = typeof currentPhotoCount.count === 'string' 
      ? parseInt(currentPhotoCount.count, 10) 
      : currentPhotoCount.count;
    
    console.log('Photo upload: Current photo count (after cleanup):', photoCount, '(type:', typeof photoCount, ')');
    console.log('Photo upload: Actual photo records in DB:', actualPhotos.length);
    console.log('Photo upload: Photo records:', actualPhotos.map(p => ({ id: p.id, url: p.url })));
    console.log('Photo upload: Attempting to upload', files.length, 'file(s)');

    const maxPhotos = 6;
    const totalAfterUpload = photoCount + files.length;
    console.log('Photo upload: Math check -', photoCount, '+', files.length, '=', totalAfterUpload);
    console.log('Photo upload: Total photos after upload would be:', totalAfterUpload, '/', maxPhotos);
    console.log('Photo upload: Would exceed max?', totalAfterUpload > maxPhotos);
    
    if (totalAfterUpload > maxPhotos) {
      console.log('Photo upload: BLOCKED - would exceed max photos');
      return res.status(400).json({ 
        error: `Maximum ${maxPhotos} photos allowed. You currently have ${photoCount} photos.` 
      });
    }
    
    console.log('Photo upload: ALLOWED - proceeding with upload');

    // Get the next display order
    const lastPhotoResult = db
      .prepare("SELECT display_order FROM photos WHERE profile_id = ? ORDER BY display_order DESC LIMIT 1")
      .get([profile.id]);
    const lastPhoto = (lastPhotoResult instanceof Promise
      ? await lastPhotoResult
      : lastPhotoResult) as { display_order: number } | undefined;

    let nextOrder = lastPhoto ? lastPhoto.display_order + 1 : 0;

    // Insert photos
    const uploadedPhotos = [];
    let isFirst = photoCount === 0; // First photo becomes primary if no photos exist
    let primaryPhotoUrl: string | null = null;
    const useCloudinary = isCloudinaryConfigured();

    for (const file of files) {
      const photoId = uuidv4();
      let photoUrl: string;

      // Validate file
      if (!file) {
        console.error('Photo upload: File is undefined');
        return res.status(400).json({ error: 'Invalid file upload' });
      }

      console.log('📸 Processing file:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        hasBuffer: !!file.buffer,
        bufferLength: file.buffer?.length,
        filename: file.filename
      });

      if (useCloudinary) {
        // Upload to Cloudinary
        if (!file.buffer) {
          console.error('Photo upload: No buffer available for Cloudinary upload');
          return res.status(500).json({ 
            error: 'File buffer not available. This may be a server configuration issue.',
            suggestion: 'Please try uploading the photo again.'
          });
        }

        // Validate buffer
        if (file.buffer.length === 0) {
          console.error('Photo upload: Buffer is empty');
          return res.status(400).json({ error: 'File is empty' });
        }

        try {
          const originalSize = file.buffer.length;
          const originalSizeMB = (originalSize / (1024 * 1024)).toFixed(2);
          
          console.log('☁️  Preparing image for Cloudinary:', { 
            photoId, 
            size: originalSize, 
            sizeMB: originalSizeMB,
            mimetype: file.mimetype,
            originalname: file.originalname
          });

          // Compress image if needed (Cloudinary free tier has 10MB limit)
          let imageBuffer = file.buffer;
          if (originalSize > 10 * 1024 * 1024) {
            console.log('📦 Image exceeds 10MB, compressing...');
            imageBuffer = await compressImageForCloudinary(file.buffer, 10 * 1024 * 1024);
            const compressedSizeMB = (imageBuffer.length / (1024 * 1024)).toFixed(2);
            console.log(`✅ Compression complete: ${originalSizeMB} MB → ${compressedSizeMB} MB`);
          }

          console.log('☁️  Uploading to Cloudinary...');
          photoUrl = await uploadToCloudinary(imageBuffer, 'mulligan-photos', photoId);
          console.log('✅ Cloudinary upload successful:', photoUrl);
        } catch (error: any) {
            // Log the raw error first
            console.error('❌ Cloudinary upload failed - RAW ERROR:', error);
            console.error('❌ Error type:', typeof error);
            console.error('❌ Error constructor:', error?.constructor?.name);
            console.error('❌ Error keys:', Object.keys(error || {}));
            
            // Try to extract all possible error information
            const errorInfo: any = {
              message: error?.message,
              http_code: error?.http_code,
              name: error?.name,
              code: error?.code,
              request_id: error?.request_id,
              rate_limit_allowed: error?.rate_limit_allowed,
              rate_limit_reset_at: error?.rate_limit_reset_at,
            };
            
            // Log all properties
            if (error) {
              for (const key in error) {
                if (error.hasOwnProperty(key)) {
                  const value = error[key];
                  errorInfo[key] = typeof value === 'object' ? JSON.stringify(value) : value;
                }
              }
            }
            
            console.error('❌ Cloudinary error details:', JSON.stringify(errorInfo, null, 2));
            
            // Extract error message properly (handle nested objects and Error instances)
            let errorMessage = 'Unknown error';
            let httpCode = null;
            
            try {
              // First, try to get http_code
              httpCode = error?.http_code || null;
              
              // Extract message - try multiple strategies
              if (typeof error === 'string') {
                errorMessage = error;
              } else if (error instanceof Error) {
                errorMessage = error.message || 'Unknown error';
                // If message is still an object somehow, try to extract more
                if (errorMessage === '[object Object]') {
                  errorMessage = 'Cloudinary upload failed - check server logs';
                }
              } else if (error?.message) {
                // Handle case where error.message might be an object
                if (typeof error.message === 'string') {
                  errorMessage = error.message;
                } else if (error.message instanceof Error) {
                  errorMessage = error.message.message || 'Unknown error';
                } else {
                  // Try to extract useful info from the message object
                  try {
                    // If message has a message property
                    if (error.message.message && typeof error.message.message === 'string') {
                      errorMessage = error.message.message;
                    } else {
                      // Try to stringify with replacer to avoid circular refs
                      errorMessage = JSON.stringify(error.message, (key, value) => {
                        if (key === 'stack' || key === 'originalError') return undefined;
                        if (typeof value === 'object' && value !== null) {
                          // For objects, try to get string properties
                          const stringProps: any = {};
                          for (const k in value) {
                            if (typeof value[k] === 'string') {
                              stringProps[k] = value[k];
                            }
                          }
                          return Object.keys(stringProps).length > 0 ? stringProps : value;
                        }
                        return value;
                      }, 2);
                    }
                  } catch {
                    // If stringify fails, try to get any string property
                    const msgKeys = Object.keys(error.message || {});
                    const stringVals = msgKeys
                      .filter(k => typeof error.message[k] === 'string')
                      .map(k => `${k}: ${error.message[k]}`)
                      .join(', ');
                    errorMessage = stringVals || 'Cloudinary upload failed';
                  }
                }
              } else {
                // Last resort - try to extract any useful string information
                const errorKeys = Object.keys(error || {});
                const stringProps = errorKeys
                  .filter(key => {
                    const val = error[key];
                    return typeof val === 'string' && val.length > 0 && val !== '[object Object]';
                  })
                  .map(key => `${key}: ${error[key]}`)
                  .join(', ');
                
                if (stringProps) {
                  errorMessage = stringProps;
                } else {
                  // Try to stringify with safe replacer
                  try {
                    errorMessage = JSON.stringify(error, (key, value) => {
                      if (key === 'stack' || key === 'originalError') return undefined;
                      if (typeof value === 'function') return '[Function]';
                      return value;
                    }, 2);
                  } catch {
                    errorMessage = 'Cloudinary upload failed - check server logs for details';
                  }
                }
              }
              
              // Final check - if we still have "[object Object]", use a generic message
              if (errorMessage === '[object Object]' || errorMessage.includes('[object Object]')) {
                errorMessage = httpCode 
                  ? `Cloudinary upload failed (HTTP ${httpCode}) - check server logs for details`
                  : 'Cloudinary upload failed - check server logs for details';
              }
            } catch (stringifyError) {
              // If even stringifying fails, use a fallback
              console.error('Error extracting error message:', stringifyError);
              errorMessage = httpCode 
                ? `Cloudinary upload failed (HTTP ${httpCode})`
                : 'Cloudinary upload failed';
            }
            
            // Check if this is a Render-specific issue (no local storage on Render)
            const isRender = process.env.RENDER || process.env.NODE_ENV === 'production';
            
            if (isRender) {
              // On Render, we can't use local storage fallback
              // Return detailed error to help debug
              return res.status(500).json({ 
                error: 'Failed to upload photo to cloud storage',
                details: errorMessage,
                http_code: httpCode,
                suggestion: 'Please check Cloudinary configuration and network connectivity. If the file is very large, try compressing it first.'
              });
            } else {
              // Fallback to local storage if Cloudinary fails (only in development)
              console.log('⚠️  Cloudinary upload failed, falling back to local storage');
              try {
                // Save file to local storage as fallback
                const uploadsDir = path.join(process.cwd(), 'uploads');
                if (!fs.existsSync(uploadsDir)) {
                  fs.mkdirSync(uploadsDir, { recursive: true });
                }
                
                const localFilename = `${photoId}${path.extname(file.originalname || '.jpg')}`;
                const localPath = path.join(uploadsDir, localFilename);
                
                // Write buffer to file
                fs.writeFileSync(localPath, file.buffer);
                photoUrl = `/uploads/${localFilename}`;
                console.log('✅ Fallback to local storage successful:', photoUrl);
              } catch (fallbackError) {
                console.error('❌ Fallback to local storage also failed:', fallbackError);
                return res.status(500).json({ 
                  error: 'Failed to upload photo. Please try again.',
                  details: error?.message || String(error),
                  http_code: error?.http_code
                });
              }
            }
        }
      } else {
        // Use local filesystem
        photoUrl = `/uploads/${file.filename}`;
        
        // Verify file exists after insert (only for local storage)
        const filePath = path.join(process.cwd(), photoUrl);
        const fileExists = fs.existsSync(filePath);
        console.log('Photo upload: File verification - Path:', filePath, 'Exists:', fileExists);
        
        if (!fileExists) {
          console.error('Photo upload: WARNING - File does not exist after upload! This indicates an upload failure.');
        }
      }

      console.log('Photo upload: Inserting photo:', { photoId, profileId: profile.id, photoUrl, displayOrder: nextOrder, isPrimary: isFirst });

      const insertResult = db.prepare(
        `INSERT INTO photos (id, profile_id, url, display_order, is_primary) 
         VALUES (?, ?, ?, ?, ?)`
      ).run([photoId, profile.id, photoUrl, nextOrder, isFirst ? 1 : 0]);
      if (insertResult instanceof Promise) {
        await insertResult;
      }

      // If this is the primary photo, save the URL to update profile
      if (isFirst) {
        primaryPhotoUrl = photoUrl;
      }

      console.log('Photo upload: Photo inserted successfully:', photoId);

      uploadedPhotos.push({
        id: photoId,
        url: photoUrl,
        displayOrder: nextOrder,
        isPrimary: isFirst,
      });

      nextOrder++;
      isFirst = false; // Only the first photo in this batch is primary
    }

    // Update profile's photo_url if we set a primary photo
    if (primaryPhotoUrl) {
      await (db.prepare("UPDATE profiles SET photo_url = ? WHERE id = ?").run([primaryPhotoUrl, profile.id]) as Promise<any>);
      console.log('✅ Profile photo_url updated to primary photo:', primaryPhotoUrl);
    }

    notifyPartnersProfileChanged(userId);
    res.json({
      message: `Successfully uploaded ${files.length} photo(s)`,
      photos: uploadedPhotos,
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error details:", errorMessage);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: `Failed to upload photos: ${errorMessage}` });
  }
});

// Get all photos for a profile
photosRouter.get("/profile/:profileId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { profileId } = req.params;

    // Clean up orphaned photos before fetching
    await cleanupOrphanedPhotos(profileId);

    const photosResult = await (db
      .prepare(
        `SELECT id, url, display_order, is_primary, created_at 
         FROM photos 
         WHERE profile_id = ? 
         ORDER BY display_order ASC`
      )
      .all([profileId]) as Promise<any[]>);

    // Ensure photos is always an array
    const photos = Array.isArray(photosResult) ? photosResult : [];

    const validPhotos = filterPhotosForResponse(photos);

    res.json({
      photos: validPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        displayOrder: p.display_order,
        isPrimary: rowIsPrimary(p.is_primary),
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error("Photos /profile/:profileId error:", error);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

// Get current user's photos
photosRouter.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.json({ photos: [] });
    }

    // Clean up orphaned photos before fetching
    await cleanupOrphanedPhotos(profile.id);

    const photosResult = await (db
      .prepare(
        `SELECT id, url, display_order, is_primary, created_at 
         FROM photos 
         WHERE profile_id = ? 
         ORDER BY display_order ASC`
      )
      .all([profile.id]) as Promise<any[]>);

    // Ensure photos is always an array
    const photos = Array.isArray(photosResult) ? photosResult : [];

    const validPhotos = filterPhotosForResponse(photos);

    res.json({
      photos: validPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        displayOrder: p.display_order,
        isPrimary: rowIsPrimary(p.is_primary),
        createdAt: p.created_at,
      })),
    });
  } catch (error) {
    console.error("Photos /me error:", error);
    res.json({ photos: [] }); // Return empty array on error
  }
});

// Set primary photo
photosRouter.put("/:photoId/primary", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { photoId } = req.params;

    // Get profile
    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Get the photo URL and verify it belongs to user
    const photoResult = db
      .prepare("SELECT id, url FROM photos WHERE id = ? AND profile_id = ?")
      .get([photoId, profile.id]);
    const photo = (photoResult instanceof Promise
      ? await photoResult
      : photoResult) as { id: string; url: string } | undefined;

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    // Remove primary from all photos
    await (db.prepare("UPDATE photos SET is_primary = 0 WHERE profile_id = ?").run([profile.id]) as Promise<any>);

    // Set this photo as primary
    await (db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ?").run([photoId]) as Promise<any>);

    // Update profile's photo_url to match the primary photo
    await (db.prepare("UPDATE profiles SET photo_url = ? WHERE id = ?").run([photo.url, profile.id]) as Promise<any>);

    console.log('✅ Primary photo updated and profile photo_url synced:', photo.url);
    notifyPartnersProfileChanged(userId);
    res.json({ message: "Primary photo updated" });
  } catch (error) {
    console.error("Set primary photo error:", error);
    res.status(500).json({ error: "Failed to update primary photo" });
  }
});

// Delete a photo
photosRouter.delete("/:photoId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { photoId } = req.params;

    // Get profile
    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Get photo to delete
    const photo = await (db
      .prepare("SELECT id, url, is_primary FROM photos WHERE id = ? AND profile_id = ?")
      .get([photoId, profile.id]) as Promise<{ id: string; url: string; is_primary: number } | undefined>);

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    // Delete photo file
    if (isCloudinaryConfigured() && (photo.url.startsWith('http://') || photo.url.startsWith('https://'))) {
      // Delete from Cloudinary
      console.log('☁️  Deleting from Cloudinary:', photo.url);
      await deleteFromCloudinary(photo.url);
    } else {
      // Delete from local filesystem
      const filePath = path.join(process.cwd(), photo.url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('📁 Deleted local file:', filePath);
      }
    }

    // Delete from database
    await (db.prepare("DELETE FROM photos WHERE id = ?").run([photoId]) as Promise<any>);

    // If this was the primary photo, set another one as primary
    if (photo.is_primary === 1) {
      const nextPhoto = await (db
        .prepare("SELECT id FROM photos WHERE profile_id = ? ORDER BY display_order ASC LIMIT 1")
        .get([profile.id]) as Promise<{ id: string } | undefined>);

      if (nextPhoto) {
        await (db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ?").run([nextPhoto.id]) as Promise<any>);
      }
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: "Photo deleted successfully" });
  } catch (error) {
    console.error("Delete photo error:", error);
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

// Reorder photos
photosRouter.put("/reorder", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { photoIds, displayOrders } = req.body as {
      photoIds?: string[];
      displayOrders?: Record<string, number>;
    };

    // Get profile
    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const stmt = db.prepare("UPDATE photos SET display_order = ? WHERE id = ? AND profile_id = ?");
    let primaryPhotoId: string | null = null;
    let primarySlot = Number.POSITIVE_INFINITY;

    if (displayOrders && typeof displayOrders === "object" && !Array.isArray(displayOrders)) {
      const entries = Object.entries(displayOrders);
      if (entries.length === 0) {
        return res.status(400).json({ error: "displayOrders must include at least one photo" });
      }

      for (const [photoId, rawSlot] of entries) {
        const slot = Number(rawSlot);
        if (!Number.isInteger(slot) || slot < 0 || slot > 5) {
          return res.status(400).json({ error: "displayOrders slot indices must be integers from 0 to 5" });
        }
        await (stmt.run([slot, photoId, profile.id]) as Promise<any>);
        if (slot < primarySlot) {
          primarySlot = slot;
          primaryPhotoId = photoId;
        }
      }
    } else if (Array.isArray(photoIds)) {
      if (photoIds.length === 0) {
        return res.status(400).json({ error: "photoIds must be a non-empty array" });
      }
      for (let i = 0; i < photoIds.length; i++) {
        await (stmt.run([i, photoIds[i], profile.id]) as Promise<any>);
      }
      primaryPhotoId = photoIds[0] ?? null;
    } else {
      return res.status(400).json({ error: "Provide photoIds or displayOrders" });
    }

    if (primaryPhotoId) {
      await (db.prepare("UPDATE photos SET is_primary = 0 WHERE profile_id = ?").run([profile.id]) as Promise<any>);
      await (db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ? AND profile_id = ?").run([
        primaryPhotoId,
        profile.id,
      ]) as Promise<any>);
      const primaryRow = await (db
        .prepare("SELECT url FROM photos WHERE id = ? AND profile_id = ?")
        .get([primaryPhotoId, profile.id]) as Promise<{ url: string } | undefined>);
      if (primaryRow) {
        await (db
          .prepare("UPDATE profiles SET photo_url = ? WHERE id = ?")
          .run([primaryRow.url, profile.id]) as Promise<any>);
      }
    }

    notifyPartnersProfileChanged(userId);
    res.json({ message: "Photos reordered successfully" });
  } catch (error) {
    console.error("Reorder photos error:", error);
    res.status(500).json({ error: "Failed to reorder photos" });
  }
});

