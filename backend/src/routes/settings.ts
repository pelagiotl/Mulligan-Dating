import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../database.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { deleteUserAccountData } from "../services/deleteUserAccount.js";

export const settingsRouter = Router();

// Get user settings/info
settingsRouter.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const user = await (db
      .prepare("SELECT id, email, created_at, last_active_at, show_active_status FROM users WHERE id = ?")
      .get(userId) as Promise<{ id: string; email: string; created_at: string; last_active_at: string | null; show_active_status: number | boolean | null } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const showActiveStatus = user.show_active_status === undefined || user.show_active_status === null
      ? true
      : !!user.show_active_status;

    res.json({
      email: user.email,
      createdAt: user.created_at,
      lastActiveAt: user.last_active_at,
      showActiveStatus,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// Delete account — authenticated session only (phone-first app; no password re-entry)
settingsRouter.post("/delete-account", authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  try {
    const row = await (db
      .prepare("SELECT id FROM users WHERE id = ?")
      .get(userId) as Promise<{ id: string } | undefined>);

    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }

    await deleteUserAccountData(userId);

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// Update email (optional - for phone auth users, password is optional)
settingsRouter.put("/email", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    // Log the request body for debugging
    console.log(`📧 Update email request for user ${userId}:`, { 
      email: req.body?.email, 
      emailType: typeof req.body?.email,
      hasPassword: !!req.body?.password,
      bodyKeys: Object.keys(req.body || {}),
      rawBody: req.body
    });
    
    // Check if email is provided
    if (!req.body || !req.body.email) {
      console.error('❌ Email update error: email field is missing');
      return res.status(400).json({ 
        error: "Email is required" 
      });
    }
    
    const emailSchema = z.object({
      email: z.string().min(1, "Email is required").email("Invalid email format"),
      password: z.string().optional(),
    });
    
    const validationResult = emailSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      console.error('❌ Email update validation error:', firstError);
      console.error('   Full validation errors:', validationResult.error.errors);
      return res.status(400).json({ 
        error: firstError.message || "Invalid email format" 
      });
    }
    
    const { email, password } = validationResult.data;

    // Get user to check if they have a password (phone auth users may not have one)
    const user = await (db
      .prepare("SELECT password FROM users WHERE id = ?")
      .get(userId) as Promise<{ password: string | null } | undefined>);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If user has a password and one was provided, verify it
    // If user doesn't have a password (phone auth), allow update without password
    if (user.password && password) {
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Password is incorrect" });
      }
    } else if (user.password && !password) {
      // User has password but didn't provide one
      return res.status(401).json({ error: "Password required to update email" });
    }
    // If user has no password (phone auth), proceed without password verification

    // Check if email already exists
    const existingUser = await (db
      .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
      .get([email, userId]) as Promise<{ id: string } | undefined>);

    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Update email
    await (db.prepare("UPDATE users SET email = ? WHERE id = ?").run([normalizedEmail, userId]) as Promise<any>);

    res.json({ message: "Email updated successfully", email: normalizedEmail });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Update email error:", error);
    res.status(500).json({ error: "Failed to update email" });
  }
});

// Toggle whether others can see your active status (last active) in matches
const activeStatusSchema = z.object({
  showActiveStatus: z.boolean(),
});

settingsRouter.put("/active-status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { showActiveStatus } = activeStatusSchema.parse(req.body);
    const value = showActiveStatus ? 1 : 0;
    await (db.prepare("UPDATE users SET show_active_status = ? WHERE id = ?").run([value, userId]) as Promise<any>);
    res.json({ message: "Active status updated", showActiveStatus });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Update active status error:", error);
    res.status(500).json({ error: "Failed to update active status" });
  }
});

// Push notification preferences
const notificationPrefsSchema = z.object({
  pushNotifyMatches: z.boolean(),
  pushNotifyMessages: z.boolean(),
});

settingsRouter.get("/notification-preferences", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const row = await (db
      .prepare("SELECT push_notify_matches, push_notify_messages FROM users WHERE id = ?")
      .get(userId) as Promise<{ push_notify_matches: number | null; push_notify_messages: number | null } | undefined>);
    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      pushNotifyMatches: row.push_notify_matches === undefined || row.push_notify_matches === null ? true : !!row.push_notify_matches,
      pushNotifyMessages: row.push_notify_messages === undefined || row.push_notify_messages === null ? true : !!row.push_notify_messages,
    });
  } catch (error) {
    console.error("Get notification preferences error:", error);
    res.status(500).json({ error: "Failed to load notification preferences" });
  }
});

settingsRouter.put("/notification-preferences", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { pushNotifyMatches, pushNotifyMessages } = notificationPrefsSchema.parse(req.body);
    await (db
      .prepare("UPDATE users SET push_notify_matches = ?, push_notify_messages = ? WHERE id = ?")
      .run([pushNotifyMatches ? 1 : 0, pushNotifyMessages ? 1 : 0, userId]) as Promise<any>);
    res.json({
      message: "Notification preferences updated",
      pushNotifyMatches,
      pushNotifyMessages,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Update notification preferences error:", error);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

