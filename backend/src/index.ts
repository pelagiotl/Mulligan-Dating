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
import { referralsRouter } from "./routes/referrals.js";
import { blocksRouter } from "./routes/blocks.js";
import { settingsRouter } from "./routes/settings.js";
import { photosRouter } from "./routes/photos.js";
import { adminRouter } from "./routes/admin.js";
import { smsRouter } from "./routes/sms.js";
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

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? (process.env.ALLOWED_ORIGINS?.split(',') || [])
  : ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"];

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
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

// Validate security configuration
validateJWTSecret();

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

// Routes with rate limiting (set up before server starts)
app.use("/api/auth", rateLimitAuth, authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/users", usersRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api/blocks", blocksRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/photos", photosRouter);
app.use("/api/sms", smsRouter);
// Stripe webhook must use raw body for signature verification - register BEFORE other payment routes
app.use("/api/payments/webhook", express.raw({ type: "application/json" }), paymentsRouter);
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

// Public endpoint to make user admin by phone number (for development/testing)
// TODO: Remove or secure this before production launch
app.post("/api/make-admin-by-phone", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Format phone number (add + if not present)
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+1${phoneNumber.replace(/\D/g, '')}`;

    // Find user by phone number
    const userStmt = db.prepare('SELECT id, phone_number FROM users WHERE phone_number = ?');
    const user = await (userStmt.get([formattedPhone]) as Promise<{ id: string; phone_number: string } | undefined>);

    if (!user) {
      return res.status(404).json({ error: `User with phone number ${formattedPhone} not found` });
    }

    // Make user admin
    const updateStmt = db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?');
    await (updateStmt.run([user.id]) as Promise<any>);

    // Verify
    const verifyStmt = db.prepare('SELECT id, phone_number, is_admin FROM users WHERE id = ?');
    const updated = await (verifyStmt.get([user.id]) as Promise<{ id: string; phone_number: string; is_admin: number } | undefined>);

    res.json({
      success: true,
      message: `User ${formattedPhone} is now an admin`,
      userId: user.id,
      isAdmin: updated?.is_admin === 1
    });
  } catch (error) {
    console.error('Error making user admin:', error);
    res.status(500).json({ error: 'Failed to make user admin' });
  }
});

// Public endpoint to create test users (for development/testing only)
// TODO: Remove or secure this before production launch
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
