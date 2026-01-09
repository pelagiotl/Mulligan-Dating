import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";

export const settingsRouter = Router();

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// Get user settings/info
settingsRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const user = await (db
      .prepare("SELECT id, email, created_at, last_active_at FROM users WHERE id = ?")
      .get(userId) as Promise<{ id: string; email: string; created_at: string; last_active_at: string | null } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      email: user.email,
      createdAt: user.created_at,
      lastActiveAt: user.last_active_at,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// Change password
settingsRouter.post("/change-password", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    // Get current user
    const user = await (db
      .prepare("SELECT password FROM users WHERE id = ?")
      .get(userId) as Promise<{ password: string } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await (db.prepare("UPDATE users SET password = ? WHERE id = ?").run([hashedPassword, userId]) as Promise<any>);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Delete account
settingsRouter.post("/delete-account", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { password } = req.body as { password?: string };

  if (!password) {
    return res.status(400).json({ error: "Password required to delete account" });
  }

  try {
    // Verify password
    const user = await (db
      .prepare("SELECT password FROM users WHERE id = ?")
      .get(userId) as Promise<{ password: string } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Password is incorrect" });
    }

    // Delete user (cascade will delete profile, matches, messages, etc.)
    await (db.prepare("DELETE FROM users WHERE id = ?").run([userId]) as Promise<any>);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// Update email (optional - if you want to allow email changes)
settingsRouter.put("/email", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string(),
    }).parse(req.body);

    // Verify password
    const user = await (db
      .prepare("SELECT password FROM users WHERE id = ?")
      .get(userId) as Promise<{ password: string } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Password is incorrect" });
    }

    // Check if email already exists
    const existingUser = await (db
      .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
      .get([email, userId]) as Promise<{ id: string } | undefined>);

    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Update email
    await (db.prepare("UPDATE users SET email = ? WHERE id = ?").run([email, userId]) as Promise<any>);

    res.json({ message: "Email updated successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Update email error:", error);
    res.status(500).json({ error: "Failed to update email" });
  }
});

