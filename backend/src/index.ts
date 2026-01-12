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
import { initDatabase, db } from "./database.js";
import { generateWeeklyMatchesForAll } from "./services/matching.js";
import path from "path";
import fs from "fs";

// Initialize cron scheduler (optional - won't crash if node-cron isn't installed)
async function initCronScheduler() {
  try {
    const cron = (await import("node-cron")).default;
    
    // Schedule weekly match generation (runs every Monday at 9 AM)
    // Cron format: minute hour day-of-month month day-of-week
    cron.schedule("0 9 * * 1", async () => {
      console.log("🔄 Running weekly match generation for all users...");
      try {
        const result = await generateWeeklyMatchesForAll();
        console.log(
          `✅ Weekly matches generated: ${result.totalMatches} matches for ${result.totalUsers} users`
        );
      } catch (error) {
        console.error("❌ Error generating weekly matches:", error);
      }
    });
    console.log("✅ Weekly match generation scheduled");
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
  : ["http://localhost:5173", "http://localhost:5174"];

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

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
