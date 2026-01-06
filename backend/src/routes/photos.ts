import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { uploadMultiple, uploadSingle } from "../middleware/upload.js";

export const photosRouter = Router();

// Upload multiple photos for a profile
photosRouter.post("/", authenticateToken, uploadMultiple, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Get user's profile
    const profile = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get(userId) as { id: string } | undefined;

    if (!profile) {
      return res.status(404).json({ error: "Profile not found. Please create a profile first." });
    }

    // Check current photo count
    const currentPhotoCount = db
      .prepare("SELECT COUNT(*) as count FROM photos WHERE profile_id = ?")
      .get(profile.id) as { count: number };

    const maxPhotos = 6;
    if (currentPhotoCount.count + files.length > maxPhotos) {
      return res.status(400).json({ 
        error: `Maximum ${maxPhotos} photos allowed. You currently have ${currentPhotoCount.count} photos.` 
      });
    }

    // Get the next display order
    const lastPhoto = db
      .prepare("SELECT display_order FROM photos WHERE profile_id = ? ORDER BY display_order DESC LIMIT 1")
      .get(profile.id) as { display_order: number } | undefined;

    let nextOrder = lastPhoto ? lastPhoto.display_order + 1 : 0;

    // Insert photos
    const uploadedPhotos = [];
    let isFirst = currentPhotoCount.count === 0; // First photo becomes primary if no photos exist

    for (const file of files) {
      const photoId = uuidv4();
      const photoUrl = `/uploads/${file.filename}`;

      db.prepare(
        `INSERT INTO photos (id, profile_id, url, display_order, is_primary) 
         VALUES (?, ?, ?, ?, ?)`
      ).run(photoId, profile.id, photoUrl, nextOrder, isFirst ? 1 : 0);

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
    res.status(500).json({ error: `Failed to upload photos: ${errorMessage}` });
  }
});

// Get all photos for a profile
photosRouter.get("/profile/:profileId", authenticateToken, (req: AuthRequest, res) => {
  const { profileId } = req.params;

  const photos = db
    .prepare(
      `SELECT id, url, display_order, is_primary, created_at 
       FROM photos 
       WHERE profile_id = ? 
       ORDER BY display_order ASC`
    )
    .all(profileId) as any[];

  res.json({
    photos: photos.map((p) => ({
      id: p.id,
      url: p.url,
      displayOrder: p.display_order,
      isPrimary: p.is_primary === 1,
      createdAt: p.created_at,
    })),
  });
});

// Get current user's photos
photosRouter.get("/me", authenticateToken, (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const profile = db
      .prepare("SELECT id FROM profiles WHERE user_id = ?")
      .get(userId) as { id: string } | undefined;

    if (!profile) {
      return res.json({ photos: [] });
    }

    const photos = db
      .prepare(
        `SELECT id, url, display_order, is_primary, created_at 
         FROM photos 
         WHERE profile_id = ? 
         ORDER BY display_order ASC`
      )
      .all(profile.id) as any[];

    res.json({
      photos: photos.map((p) => ({
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
photosRouter.put("/:photoId/primary", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { photoId } = req.params;

  // Get profile
  const profile = db
    .prepare("SELECT id FROM profiles WHERE user_id = ?")
    .get(userId) as { id: string } | undefined;

  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }

  // Verify photo belongs to user
  const photo = db
    .prepare("SELECT id FROM photos WHERE id = ? AND profile_id = ?")
    .get(photoId, profile.id) as { id: string } | undefined;

  if (!photo) {
    return res.status(404).json({ error: "Photo not found" });
  }

  // Remove primary from all photos
  db.prepare("UPDATE photos SET is_primary = 0 WHERE profile_id = ?").run(profile.id);

  // Set this photo as primary
  db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ?").run(photoId);

  res.json({ message: "Primary photo updated" });
});

// Delete a photo
photosRouter.delete("/:photoId", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { photoId } = req.params;

  // Get profile
  const profile = db
    .prepare("SELECT id FROM profiles WHERE user_id = ?")
    .get(userId) as { id: string } | undefined;

  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }

  // Get photo to delete
  const photo = db
    .prepare("SELECT id, url, is_primary FROM photos WHERE id = ? AND profile_id = ?")
    .get(photoId, profile.id) as { id: string; url: string; is_primary: number } | undefined;

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
  db.prepare("DELETE FROM photos WHERE id = ?").run(photoId);

  // If this was the primary photo, set another one as primary
  if (photo.is_primary === 1) {
    const nextPhoto = db
      .prepare("SELECT id FROM photos WHERE profile_id = ? ORDER BY display_order ASC LIMIT 1")
      .get(profile.id) as { id: string } | undefined;

    if (nextPhoto) {
      db.prepare("UPDATE photos SET is_primary = 1 WHERE id = ?").run(nextPhoto.id);
    }
  }

  res.json({ message: "Photo deleted successfully" });
});

// Reorder photos
photosRouter.put("/reorder", authenticateToken, (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { photoIds } = req.body; // Array of photo IDs in desired order

  if (!Array.isArray(photoIds)) {
    return res.status(400).json({ error: "photoIds must be an array" });
  }

  // Get profile
  const profile = db
    .prepare("SELECT id FROM profiles WHERE user_id = ?")
    .get(userId) as { id: string } | undefined;

  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }

  // Update display order
  const stmt = db.prepare("UPDATE photos SET display_order = ? WHERE id = ? AND profile_id = ?");
  const updateMany = db.transaction((ids: string[]) => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i], profile.id);
    }
  });

  updateMany(photoIds);

  res.json({ message: "Photos reordered successfully" });
});

