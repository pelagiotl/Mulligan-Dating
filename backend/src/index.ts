// Load environment variables from .env file
import 'dotenv/config';

import express from "express";
import cors from "cors";
import { securityHeaders, rateLimitAPI, rateLimitAuth, validateJWTSecret, resetAuthRateLimit } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { usersRouter } from "./routes/users.js";
import { tokensRouter } from "./routes/tokens.js";
import { matchesRouter } from "./routes/matches.js";
import { blocksRouter } from "./routes/blocks.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { photosRouter } from "./routes/photos.js";
import { adminRouter } from "./routes/admin.js";
import { smsRouter } from "./routes/sms.js";
import { smsWebhookRouter } from "./routes/smsWebhook.js";
import { paymentsRouter } from "./routes/payments.js";
import { connectionQualityRouter } from "./routes/connectionQuality.js";
import { matchMemoryBankRouter } from "./routes/matchMemoryBank.js";
import { initDatabase, db } from "./database.js";
import { generateWeeklyMatchesForAll } from "./services/matching.js";
import path from "path";
import fs from "fs";

// Initialize cron scheduler (optional - won't crash if node-cron isn't installed)
async function initCronScheduler() {
  try {
    const cron = (await import("node-cron")).default;
    
    // DISABLED: Weekly match generation - matches are now only created when users use tokens to connect
    // Schedule weekly match generation (runs every Monday at 9 AM)
    // Cron format: minute hour day-of-month month day-of-week
    // cron.schedule("0 9 * * 1", async () => {
    //   console.log("🔄 Running weekly match generation for all users...");
    //   try {
    //     const result = await generateWeeklyMatchesForAll();
    //     console.log(
    //       `✅ Weekly matches generated: ${result.totalMatches} matches for ${result.totalUsers} users`
    //     );
    //   } catch (error) {
    //     console.error("❌ Error generating weekly matches:", error);
    //   }
    // });
    // console.log("✅ Weekly match generation scheduled");
    console.log("ℹ️  Weekly match generation is disabled. Matches are only created when users use tokens to connect.");
  } catch (error) {
    console.warn("⚠️  node-cron not installed. Weekly match generation will be disabled.");
    console.warn("   To enable: cd backend && npm install");
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.io
import { createServer } from 'http';
const server = createServer(app);

// Security middleware (apply first)
app.use(securityHeaders);

// Public privacy policy page (for Google Play, App Store, etc.)
app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy - Mulligan Dating</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #333; }
    h1 { color: #8B1538; margin-bottom: 8px; }
    h2 { font-size: 1.25rem; margin-top: 24px; margin-bottom: 12px; }
    h3 { font-size: 1.1rem; margin-top: 16px; margin-bottom: 8px; }
    .meta { color: #666; margin-bottom: 32px; }
    .footer { margin-top: 32px; padding: 16px; background: #fef2f2; border-radius: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p class="meta"><strong>Last Updated:</strong> ${new Date().toLocaleDateString()}</p>

  <h2>1. Introduction</h2>
  <p>Mulligan Dating ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our dating service.</p>

  <h2>2. Information We Collect</h2>
  <h3>2.1 Information You Provide</h3>
  <p>We collect information you provide directly to us, including:</p>
  <ul>
    <li><strong>Account Information:</strong> Phone number, email, password (hashed)</li>
    <li><strong>Profile Information:</strong> Display name, bio, photos, location, age, gender, interests, lifestyle preferences, relationship goals</li>
    <li><strong>Matching Preferences:</strong> Age range, gender preferences, distance preferences</li>
    <li><strong>Communication:</strong> Messages sent through the Service</li>
  </ul>
  <h3>2.2 Automatically Collected Information</h3>
  <p>We automatically collect certain information when you use the Service:</p>
  <ul>
    <li>Device information (IP address, device type, operating system)</li>
    <li>Usage data (features used, time spent)</li>
    <li>Location data (if you provide location information)</li>
  </ul>

  <h2>3. How We Use Your Information</h2>
  <p>We use the information we collect to create and manage your account, provide matching services, facilitate communication, improve the app, detect and prevent fraud, and comply with legal obligations.</p>

  <h2>4. Camera and Photos</h2>
  <p>We request access to your camera and photo library to allow you to take and upload profile photos and send photos in chat. Photos are stored securely and are only shared with other users as part of your profile or in private messages.</p>

  <h2>5. How We Share Your Information</h2>
  <p>We do not sell your personal information. We may share your profile information with other users for matching purposes. We may share information with service providers (e.g., hosting) and when required by law.</p>

  <h2>6. Data Security</h2>
  <p>We implement encryption, secure storage, and HTTPS for data transmission. No method of transmission over the Internet is 100% secure.</p>

  <h2>7. Your Rights</h2>
  <p>You can access and update your profile, delete your account and data, or contact us for a data export. EU users have additional rights under GDPR.</p>

  <h2>8. Contact Us</h2>
  <p>If you have questions about this Privacy Policy, contact us at <strong>Mulligandating@gmail.com</strong></p>

  <div class="footer">
    By using Mulligan Dating, you acknowledge that you have read, understood, and agree to this Privacy Policy.
  </div>
</body>
</html>`);
});

// Delete account instructions (for Google Play / App Store "delete account URL" requirement)
app.get("/delete-account", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Delete Your Account - Mulligan Dating</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #333; }
    h1 { color: #8B1538; margin-bottom: 8px; }
    .steps { background: #f8f8f8; padding: 16px 20px; border-radius: 8px; margin: 20px 0; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin-bottom: 8px; }
    .contact { margin-top: 24px; padding: 16px; background: #fef2f2; border-radius: 8px; font-size: 14px; }
    a { color: #8B1538; }
  </style>
</head>
<body>
  <h1>Delete Your Account</h1>
  <p>You can permanently delete your Mulligan Dating account and all associated data at any time from within the app.</p>
  <div class="steps">
    <strong>How to delete your account:</strong>
    <ol>
      <li>Open the Mulligan Dating app.</li>
      <li>Go to <strong>Settings</strong> (gear icon or Settings tab).</li>
      <li>Scroll to the <strong>Danger Zone</strong> section.</li>
      <li>Tap <strong>Delete Account</strong> and confirm.</li>
    </ol>
  </div>
  <p>After you confirm, your account, profile, matches, and messages are permanently removed and cannot be recovered.</p>
  <div class="contact">
    <strong>Need help?</strong> Contact us at <a href="mailto:Mulligandating@gmail.com">Mulligandating@gmail.com</a> and we can assist with account deletion or data questions.
  </div>
</body>
</html>`);
});

// Child safety & CSAE policy HTML (for Google Play "externally published standards" link)
const childSafetyHtml = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Child Safety &amp; CSAE Policy - Mulligan Dating</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #333; }
    h1 { color: #8B1538; margin-bottom: 8px; }
    h2 { font-size: 1.2rem; margin-top: 24px; margin-bottom: 10px; }
    .meta { color: #666; margin-bottom: 24px; }
    .footer { margin-top: 32px; padding: 16px; background: #f8f8f8; border-radius: 8px; font-size: 14px; }
    a { color: #8B1538; }
  </style>
</head>
<body>
  <h1>Child Safety &amp; Standards Against Child Sexual Abuse and Exploitation (CSAE)</h1>
  <p class="meta"><strong>Mulligan Dating</strong> · Last updated: ${new Date().toLocaleDateString()}</p>

  <h2>1. Zero tolerance</h2>
  <p>Mulligan Dating has zero tolerance for child sexual abuse and exploitation (CSAE). We do not permit content or conduct that exploits or endangers minors in any way. Our service is intended for adults only (18+).</p>

  <h2>2. Reporting child safety concerns in the app</h2>
  <p>Users can report concerns—including possible child safety or CSAE-related issues—directly in the app. To report:</p>
  <ul>
    <li>Open the profile or conversation of the user you wish to report.</li>
    <li>Use the <strong>Report</strong> option and choose the appropriate reason (including safety-related reasons).</li>
    <li>Submit the report; our team receives it and will take action in line with this policy and applicable law.</li>
  </ul>
  <p>Reports are reviewed promptly. We may remove content, suspend or terminate accounts, and report to authorities when required or appropriate.</p>

  <h2>3. Compliance with laws and reporting to authorities</h2>
  <p>We comply with all applicable child safety laws and regulations. When we become aware of content or conduct that may constitute child sexual abuse or exploitation, we report it to the relevant regional and national authorities as required by law and in accordance with our legal obligations.</p>

  <h2>4. Contact</h2>
  <p>For child safety or CSAE-related concerns, or to request a copy of this policy, contact us at <strong><a href="mailto:Mulligandating@gmail.com">Mulligandating@gmail.com</a></strong>.</p>

  <div class="footer">
    This page sets out Mulligan Dating's publicly available standards against child sexual abuse and exploitation. By using our service, you agree to follow these standards and our Terms of Service.
  </div>
</body>
</html>`;

app.get("/child-safety", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(childSafetyHtml());
});

// CORS configuration — merge ALLOWED_ORIGINS + FRONTEND_URL (+ www/non-www variants)
const MULLIGAN_WEB_HOST_SUFFIXES = [
  'mulligan-frontend.onrender.com',
  'mulligandating.app',
  'mulligandating.com',
];

function isMulliganWebOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      MULLIGAN_WEB_HOST_SUFFIXES.some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      )
    ) {
      return true;
    }
    // Render preview / branch deploys for Mulligan frontend
    if (/^mulligan[-a-z0-9]*\.onrender\.com$/.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildAllowedOrigins(): string[] {
  const origins = new Set<string>();
  for (const raw of (process.env.ALLOWED_ORIGINS || '').split(',')) {
    const o = raw.trim();
    if (o) origins.add(o);
  }
  const frontend = process.env.FRONTEND_URL?.trim();
  if (frontend) {
    origins.add(frontend);
    try {
      const u = new URL(frontend);
      const altHost = u.hostname.startsWith('www.')
        ? u.hostname.slice(4)
        : `www.${u.hostname}`;
      origins.add(`${u.protocol}//${altHost}`);
    } catch {
      /* ignore invalid FRONTEND_URL */
    }
  }
  return [...origins];
}

const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? buildAllowedOrigins()
    : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.) in development
      if (!origin && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      // Allow ngrok URLs in development
      if (origin && process.env.NODE_ENV !== 'production' && origin.includes('ngrok')) {
        return callback(null, true);
      }
      // Allow localhost and 127.0.0.1 in development
      if (origin && process.env.NODE_ENV !== 'production' && (
        origin.includes('localhost') || origin.includes('127.0.0.1')
      )) {
        return callback(null, true);
      }
      if (!origin || allowedOrigins.includes(origin) || isMulliganWebOrigin(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ') || '(none configured)'}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Mulligan-Client'],
  })
);

// Body parsing with size limits (increased for large image uploads)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting for API endpoints
app.use('/api', rateLimitAPI);
// Serve uploaded images
// Try process.cwd() first (backend directory), then try backend/uploads
let uploadsPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  const backendUploads = path.join(process.cwd(), 'backend', 'uploads');
  if (fs.existsSync(backendUploads)) {
    uploadsPath = backendUploads;
  }
}
app.use('/uploads', express.static(uploadsPath));
console.log('📁 Serving uploads from:', uploadsPath);

// Resolve built web app (when frontend is built alongside backend on Render)
function resolveWebDist(): string | null {
  const candidates = [
    path.join(process.cwd(), '../frontend/dist'),
    path.join(process.cwd(), 'frontend/dist'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

const webDist = process.env.NODE_ENV === 'production' ? resolveWebDist() : null;
if (webDist) {
  console.log('🌐 Web app static files:', webDist);
}


// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production - log and continue
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  Continuing despite unhandled rejection');
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Exit on uncaught exceptions as they indicate a serious problem
  process.exit(1);
});

// Initialize Socket.io (import at top level)
import { initializeSocket } from './socket.js';

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  // Log all PUT and POST requests
  if (req.method === 'PUT' || req.method === 'POST') {
    console.log(`📥 ${req.method} ${req.path} - Body keys:`, Object.keys(req.body || {}));
  }
  // Also log 404s to see what's being requested
  if (req.method === 'PUT' && req.path.includes('/profile/')) {
    console.log(`🔍 PUT request to profile route: ${req.path}`);
  }
  next();
});

// Health check for Render / load balancers (no auth, no rate limit)
// Use https://your-app.onrender.com/health for Render's health check path
app.get("/health", (req, res) => res.status(200).json({ ok: true, service: "Mulligan API", timestamp: new Date().toISOString() }));
app.get("/", (req, res) => {
  if (webDist) {
    res.sendFile(path.join(webDist, 'index.html'));
    return;
  }
  res.status(200).json({ ok: true, service: "Mulligan API" });
});
app.head("/", (req, res) => res.status(200).end());

// Routes with rate limiting (set up before server starts)
app.use("/api/auth", rateLimitAuth, authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/blocks", blocksRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/photos", photosRouter);
app.use("/api/sms", smsRouter);
app.use("/api/sms/webhook", smsWebhookRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/connection-quality", connectionQualityRouter);
app.use("/api/memory-bank", matchMemoryBankRouter);

// Public admin endpoints (no auth required) - must be BEFORE the protected admin router
app.get("/api/admin/check-admin", async (req, res) => {
  try {
    const email = req.query.email as string;
    
    if (!email) {
      return res.status(400).json({ error: "Email query parameter is required" });
    }
    
    const userStmt = db.prepare("SELECT id, email, is_admin FROM users WHERE email = ?");
    const user = await (userStmt.get([email]) as Promise<{ id: string; email: string; is_admin: number } | null>);
    
    if (!user) {
      return res.status(404).json({ error: "User not found with that email" });
    }
    
    res.json({ 
      email: user.email,
      userId: user.id,
      isAdmin: user.is_admin === 1,
      isAdminValue: user.is_admin
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check admin status", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/admin/force-admin", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const userStmt = db.prepare("SELECT id, email, is_admin FROM users WHERE email = ?");
    const user = await (userStmt.get([email]) as Promise<{ id: string; email: string; is_admin: number } | null>);
    
    if (!user) {
      return res.status(404).json({ error: "User not found with that email" });
    }

    const updateStmt = db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?");
    await (updateStmt.run([user.id]) as Promise<any>);
    
    const verifyStmt = db.prepare("SELECT id, email, is_admin FROM users WHERE email = ?");
    const updated = await (verifyStmt.get(email) as Promise<{ id: string; email: string; is_admin: number } | null>);
    
    res.json({ 
      success: true, 
      message: `User ${email} has been granted admin access`,
      userId: user.id,
      wasAdmin: user.is_admin === 1,
      isAdminNow: updated?.is_admin === 1
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to set up admin", details: error instanceof Error ? error.message : String(error) });
  }
});

app.use("/api/admin", adminRouter);

// Dev-only endpoints: disabled in production (security)
if (process.env.NODE_ENV !== 'production') {
  // Make user admin by phone (for local/testing only)
  app.post("/api/make-admin-by-phone", async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+1${phoneNumber.replace(/\D/g, '')}`;
      const userStmt = db.prepare('SELECT id, phone_number FROM users WHERE phone_number = ?');
      const user = await (userStmt.get([formattedPhone]) as Promise<{ id: string; phone_number: string } | undefined>);
      if (!user) return res.status(404).json({ error: `User with phone number ${formattedPhone} not found` });
      const updateStmt = db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?');
      await (updateStmt.run([user.id]) as Promise<any>);
      const verifyStmt = db.prepare('SELECT id, phone_number, is_admin FROM users WHERE id = ?');
      const updated = await (verifyStmt.get([user.id]) as Promise<{ id: string; phone_number: string; is_admin: number } | undefined>);
      res.json({ success: true, message: `User ${formattedPhone} is now an admin`, userId: user.id, isAdmin: updated?.is_admin === 1 });
    } catch (error) {
      console.error('Error making user admin:', error);
      res.status(500).json({ error: 'Failed to make user admin' });
    }
  });

  // Create test users (for local/testing only)
  app.post("/api/create-test-users", async (req, res) => {
  try {
    const testUsers = [
      {
        name: 'Alex', age: 28, gender: 'Man', location: 'San Francisco, CA',
        bio: 'Love hiking, coffee, and good conversations. Looking for someone to explore the city with!',
        lookingFor: 'Long-term relationship',
        interests: ['Hiking', 'Coffee', 'Photography', 'Travel', 'Yoga'],
        phone: '+15551234567'
      },
      {
        name: 'Jordan', age: 26, gender: 'Woman', location: 'Los Angeles, CA',
        bio: 'Foodie, bookworm, and adventure seeker. Always up for trying something new!',
        lookingFor: 'Friendship or more',
        interests: ['Reading', 'Cooking', 'Travel', 'Movies', 'Fitness'],
        phone: '+15551234568'
      },
      {
        name: 'Sam', age: 30, gender: 'Non-binary', location: 'New York, NY',
        bio: 'Artist, musician, and creative soul. Love deep conversations and meaningful connections.',
        lookingFor: 'Meaningful connection',
        interests: ['Art', 'Music', 'Writing', 'Meditation', 'Dancing'],
        phone: '+15551234569'
      },
      {
        name: 'Taylor', age: 25, gender: 'Woman', location: 'Austin, TX',
        bio: 'Tech enthusiast, dog lover, and weekend explorer. Let\'s build something amazing together!',
        lookingFor: 'Long-term relationship',
        interests: ['Technology', 'Dogs', 'Outdoor Activities', 'Gaming', 'Cooking'],
        phone: '+15551234570'
      },
      {
        name: 'Casey', age: 29, gender: 'Man', location: 'Seattle, WA',
        bio: 'Coffee snob, music producer, and nature enthusiast. Looking for my person!',
        lookingFor: 'Serious relationship',
        interests: ['Music', 'Coffee', 'Nature', 'Photography', 'Cooking'],
        phone: '+15551234571'
      }
    ];

    const { v4: uuidv4 } = await import('uuid');
    const createdUsers = [];

    for (const userData of testUsers) {
      try {
        const userId = uuidv4();
        const profileId = uuidv4();
        const now = new Date().toISOString();

        // Check if user already exists
        const existingUserStmt = db.prepare('SELECT id FROM users WHERE phone_number = ?');
        const existingUser = await (existingUserStmt.get([userData.phone]) as Promise<{ id: string } | undefined>);

        if (existingUser) {
          console.log(`⏭️  User ${userData.name} (${userData.phone}) already exists, skipping...`);
          continue; // Skip if already exists
        }

        console.log(`🔄 Creating test user: ${userData.name} (${userData.phone})...`);

        // Create user (phone-based users use empty string for password)
        const userStmt = db.prepare(`
          INSERT INTO users (
            id, email, phone_number, phone_verified, password, browse_unlocked_at, 
            tos_accepted_at, privacy_accepted_at, created_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const userParams = [userId, null, userData.phone, 1, '', now, now, now, now, now];
        console.log(`   📝 User INSERT params: ${userParams.length} values`);
        console.log(`   📝 User ID: ${userId}, Phone: ${userData.phone}`);
        
        try {
          await (userStmt.run(userParams) as Promise<any>);
          console.log(`   ✅ User created successfully: ${userId}`);
        } catch (userError: any) {
          console.error(`   ❌ User creation failed:`, userError);
          console.error(`   ❌ Error details:`, {
            message: userError.message,
            code: userError.code,
            name: userError.name
          });
          throw userError; // Re-throw to be caught by outer catch
        }

        // Create profile
        const profileStmt = db.prepare(`
          INSERT INTO profiles (
            id, user_id, display_name, age, gender, location, bio, looking_for, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await (profileStmt.run([
          profileId, userId, userData.name, userData.age, userData.gender,
          userData.location, userData.bio, userData.lookingFor, now, now
        ]) as Promise<any>);

        // Create preferences (very open to match anyone)
        const preferencesId = uuidv4();
        const preferencesStmt = db.prepare(`
          INSERT INTO preferences (
            id, profile_id, min_age, max_age, preferred_genders, max_distance
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        // Very open preferences: age 18-99, all genders, 10000 miles (US-wide)
        const minAge = 18;
        const maxAge = 99;
        const preferredGenders = JSON.stringify(['Male', 'Female', 'Non-binary']);
        await (preferencesStmt.run([
          preferencesId, profileId, minAge, maxAge, preferredGenders, 10000
        ]) as Promise<any>);
        console.log(`   ✅ Preferences created: age ${minAge}-${maxAge}, all genders, 500mi`);

        // Create interests
        for (const interest of userData.interests) {
          const interestId = uuidv4();
          const interestStmt = db.prepare(`
            INSERT INTO interests (id, profile_id, name, category) VALUES (?, ?, ?, 'general')
          `);
          await (interestStmt.run([interestId, profileId, interest]) as Promise<any>);
        }

        // Grant a token
        const tokenId = uuidv4();
        const tokenStmt = db.prepare(`
          INSERT INTO mulligan_tokens (id, user_id, granted_at, source) VALUES (?, ?, ?, 'test_account')
        `);
        await (tokenStmt.run([tokenId, userId, now, 'test_account']) as Promise<any>);

        createdUsers.push(userData.name);
        console.log(`✅ Successfully created test user: ${userData.name} (${userData.phone})`);
      } catch (error: any) {
        console.error(`❌ Error creating user ${userData.name} (${userData.phone}):`, error);
        console.error(`   Error message:`, error.message);
        console.error(`   Error name:`, error.name);
        console.error(`   Error code:`, error.code);
        if (error.stack) {
          console.error(`   Error stack:`, error.stack);
        }
        // Include error details in response for debugging
        // Don't silently fail - log the error but continue with next user
      }
    }

    console.log(`📊 Test user creation summary: ${createdUsers.length} created out of ${testUsers.length} attempted`);

    const skipped = testUsers.length - createdUsers.length;
    const errors = testUsers.length - createdUsers.length - skipped;
    
    res.json({
      message: `Successfully created ${createdUsers.length} test user accounts${skipped > 0 ? ` (${skipped} skipped - may already exist)` : ''}${errors > 0 ? ` (${errors} failed)` : ''}`,
      createdUsers,
      total: testUsers.length,
      skipped,
      errors,
      success: createdUsers.length > 0
    });
  } catch (error: any) {
    console.error('Error creating test users:', error);
    res.status(500).json({ 
      error: 'Failed to create test users',
      details: error.message || String(error)
    });
  }
  });
}

// Health check
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const test = await (db.prepare("SELECT 1 as test").get([]) as Promise<any>);
    res.json({ 
      status: "ok", 
      message: "Mulligan API is running 💘",
      database: "connected"
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "Database connection failed",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Endpoint to reset rate limits (works in both dev and production)
// In production, this helps users who get rate limited during testing
app.post("/api/reset-rate-limit", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || '';
  const ipString = Array.isArray(ip) ? ip[0] : String(ip);
  await resetAuthRateLimit(ipString);
  res.json({ 
    message: "Rate limit reset for your IP",
    ip: ipString
  });
});

// Also allow GET for easier access
app.get("/api/reset-rate-limit", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || '';
  const ipString = Array.isArray(ip) ? ip[0] : String(ip);
  await resetAuthRateLimit(ipString);
  res.json({ 
    message: "Rate limit reset for your IP",
    ip: ipString
  });
});

// Child safety policy (also at /api/child-safety for alternate access / Play Store)
app.get("/api/child-safety", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(childSafetyHtml());
});

// SPA fallback when frontend dist is bundled with the API (same-origin /api — no CORS issues)
if (webDist) {
  app.use(express.static(webDist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path === '/health' ||
      req.path === '/privacy' ||
      req.path === '/delete-account' ||
      req.path === '/child-safety'
    ) {
      return next();
    }
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// 404 handler - must be after all routes
app.use((req: express.Request, res: express.Response) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  console.log(`❌ Request headers:`, req.headers);
  res.status(404).json({ 
    error: "Route not found",
    method: req.method,
    path: req.path,
    message: `The route ${req.method} ${req.path} does not exist`
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  
  // Handle multer errors specifically
  if (err.name === 'MulterError') {
    return res.status(400).json({ 
      error: "File upload error",
      message: err.message
    });
  }
  
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize database (async for PostgreSQL support) - MUST complete before server starts
async function startServer() {
  try {
    console.log('🔄 Initializing database...');
    await initDatabase();
    console.log('✅ Database initialized successfully');

    const { initWebPushFromEnv } = await import("./services/webPushDelivery.js");
    initWebPushFromEnv();

    const { isApplePayWebConfigured } = await import("./lib/applePayWeb.js");
    const { isAuthorizeNetConfigured } = await import("./lib/authorizenet.js");
    if (isAuthorizeNetConfigured() && isApplePayWebConfigured()) {
      console.log("✅ Apple Pay on the Web: /payments/apple-pay/* enabled");
    } else if (isAuthorizeNetConfigured()) {
      console.log(
        "ℹ️  Apple Pay web: add APPLE_PAY_MERCHANT_ID + APPLE_PAY_IDENTITY_CERT_PEM + APPLE_PAY_IDENTITY_KEY_PEM (+ domain association file on frontend) to enable in-app Apple Pay checkout"
      );
    }

    // Initialize cron scheduler (async, won't block server startup)
    initCronScheduler();
    
    // Initialize Socket.io AFTER database is ready but BEFORE server starts listening
    initializeSocket(server);
    
    // Start server only after database is ready
    server.listen(PORT, () => {
      console.log(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║   💘 Mulligan API Server                  ║
  ║   Running on http://localhost:${PORT}        ║
  ║   🔌 WebSocket Server Ready              ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
  `);
    }).on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`
  ❌ Port ${PORT} is already in use!
  
  To fix this, run in your terminal:
  
  kill -9 $(lsof -ti:${PORT})
  
  Or find the process manually:
  lsof -i:${PORT}
  
  Then kill it with:
  kill -9 <PID>
    `);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  }
}

// Start the server
startServer();
