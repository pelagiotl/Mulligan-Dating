import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { uploadMultiple, uploadSingle } from "../middleware/upload.js";
import fs from "fs";
import path from "path";

export const photosRouter = Router();

// Helper function to clean up orphaned photos (database records without files)
async function cleanupOrphanedPhotos(profileId: string): Promise<number> {
  try {
    const photosResult = await (db
      .prepare("SELECT id, url FROM photos WHERE profile_id = ?")
      .all([profileId]) as Promise<{ id: string; url: string }[]>);
    
    const photos = Array.isArray(photosResult) ? photosResult : [];
    let cleanedCount = 0;
    
    for (const photo of photos) {
      const filePath = path.join(process.cwd(), photo.url);
      if (!fs.existsSync(filePath)) {
        // File doesn't exist, delete the database record
        console.log(`Cleaning up orphaned photo: ${photo.id} (file missing: ${photo.url})`);
        await (db.prepare("DELETE FROM photos WHERE id = ?").run([photo.id]) as Promise<any>);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} orphaned photo(s) for profile ${profileId}`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error("Error cleaning up orphaned photos:", error);
    return 0;
  }
}

// Upload multiple photos for a profile
photosRouter.post("/", authenticateToken, uploadMultiple, async (req: AuthRequest, res) => {
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
      : currentPhotoCountResult) as { count: number };

    console.log('Photo upload: Current photo count (after cleanup):', currentPhotoCount.count);

    const maxPhotos = 6;
    if (currentPhotoCount.count + files.length > maxPhotos) {
      return res.status(400).json({ 
        error: `Maximum ${maxPhotos} photos allowed. You currently have ${currentPhotoCount.count} photos.` 
      });
    }

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
    let isFirst = currentPhotoCount.count === 0; // First photo becomes primary if no photos exist

    for (const file of files) {
      const photoId = uuidv4();
      const photoUrl = `/uploads/${file.filename}`;

      console.log('Photo upload: Inserting photo:', { photoId, profileId: profile.id, photoUrl, displayOrder: nextOrder, isPrimary: isFirst });

      const insertResult = db.prepare(
        `INSERT INTO photos (id, profile_id, url, display_order, is_primary) 
         VALUES (?, ?, ?, ?, ?)`
      ).run([photoId, profile.id, photoUrl, nextOrder, isFirst ? 1 : 0]);
      if (insertResult instanceof Promise) {
        await insertResult;
      }

      console.log('Photo upload: Photo inserted successfully:', photoId);

      uploadedPhotos.push({
        id: photoId,
        url: photoUrl,
        displayOrder: nextOrder,
        isPrimary: isFirst,
      });

      nextOrder++;
      isFirst = false;
    }

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

    // Filter out photos where files don't exist (double-check)
    const validPhotos = photos.filter((p) => {
      const filePath = path.join(process.cwd(), p.url);
      return fs.existsSync(filePath);
    });

    res.json({
      photos: validPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        displayOrder: p.display_order,
        isPrimary: p.is_primary === 1,
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

    // Filter out photos where files don't exist (double-check)
    const validPhotos = photos.filter((p) => {
      const filePath = path.join(process.cwd(), p.url);
      return fs.existsSync(filePath);
    });

    res.json({
      photos: validPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        displayOrder: p.display_order,
        isPrimary: p.is_primary === 1,
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

    // Verify photo belongs to user
    const photo = await (db
      .prepare("SELECT id FROM photos WHERE id = ? AND profile_id = ?")
      .get([photoId, profile.id]) as Promise<{ id: string } | undefined>);

    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    // Remove primary from all photos
    await (db.prepare("UPDATE photos SET is_primary = 0 WHERE profile_id = ?").run([profile.id]) as Promise<any>);

    // Set this photo as primary
    await (db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ?").run([photoId]) as Promise<any>);

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
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), photo.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
    const { photoIds } = req.body; // Array of photo IDs in desired order

    if (!Array.isArray(photoIds)) {
      return res.status(400).json({ error: "photoIds must be an array" });
    }

    // Get profile
    const profile = await (db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get([userId]) as Promise<{ id: string } | undefined>);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Update display order - PostgreSQL doesn't support transactions the same way
    // So we'll do it sequentially
    const stmt = db.prepare("UPDATE photos SET display_order = ? WHERE id = ? AND profile_id = ?");
    for (let i = 0; i < photoIds.length; i++) {
      await (stmt.run([i, photoIds[i], profile.id]) as Promise<any>);
    }

    res.json({ message: "Photos reordered successfully" });
  } catch (error) {
    console.error("Reorder photos error:", error);
    res.status(500).json({ error: "Failed to reorder photos" });
  }
});

