import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from './database.js';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'mulligan-secret-key-change-in-production';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

// Store typing indicators: matchId -> Set of userIds who are typing
const typingUsers = new Map<string, Set<string>>();

let ioInstance: SocketIOServer | null = null;

export function initializeSocket(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow: no origin (mobile/native apps), localhost, ngrok, or production
        const allowed =
          !origin ||
          origin.includes('localhost') ||
          origin.includes('ngrok') ||
          origin === 'null' ||
          origin.includes('render.com') ||
          origin.includes('expo');
        callback(null, allowed);
      },
      credentials: true,
    },
  });
  
  ioInstance = io;

  // Authentication middleware for Socket.io
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      
      // Update last active timestamp
      if (socket.userId) {
        db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
      }
      
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`✅ User ${userId} connected via WebSocket`);

    // Join user's personal room for notifications
    socket.join(`user:${userId}`);

    // Auto-join all active match rooms so user receives new_message for any match (in-app notification)
    try {
      const matchesRaw = await db
        .prepare(
          `SELECT id FROM matches WHERE (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
        )
        .all(userId, userId);
      const list = Array.isArray(matchesRaw) ? matchesRaw : [];
      for (const m of list) {
        socket.join(`match:${m.id}`);
      }
      if (list.length > 0) {
        console.log(`✅ User ${userId} joined ${list.length} match room(s)`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to auto-join match rooms:', err);
    }

    // Join match room (when user selects a chat - keeps typing/leave_match working)
    socket.on('join_match', (matchId: string) => {
      // Verify user is part of this match
      const match = db
        .prepare(
          `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
        )
        .get(matchId, userId, userId) as any;

      if (match) {
        socket.join(`match:${matchId}`);
        console.log(`✅ User ${userId} joined match room: ${matchId}`);
      } else {
        socket.emit('error', { message: 'Match not found or access denied' });
      }
    });

    // Leave match room
    socket.on('leave_match', (matchId: string) => {
      socket.leave(`match:${matchId}`);
      // Clear typing indicator when leaving
      const typingSet = typingUsers.get(matchId);
      if (typingSet) {
        typingSet.delete(userId);
        if (typingSet.size === 0) {
          typingUsers.delete(matchId);
        } else {
          // Notify others that user stopped typing
          socket.to(`match:${matchId}`).emit('typing_stopped', { userId, matchId });
        }
      }
    });

    // Send message
    socket.on('send_message', async (data: { matchId: string; content: string }) => {
      const { matchId, content } = data;

      if (!content || !content.trim()) {
        socket.emit('error', { message: 'Message content required' });
        return;
      }

      // Verify user is part of this match
      const match = db
        .prepare(
          `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
        )
        .get(matchId, userId, userId) as any;

      if (!match) {
        socket.emit('error', { message: 'Match not found or access denied' });
        return;
      }

      // Check for message spam - limit consecutive messages without a reply
      const recentMessages = db
        .prepare(
          `SELECT sender_id, sent_at FROM messages 
           WHERE match_id = ? 
           ORDER BY sent_at DESC 
           LIMIT 3`
        )
        .all(matchId) as Array<{ sender_id: string; sent_at: string }>;

      // Count how many consecutive messages the current user has sent
      let consecutiveCount = 0;
      for (const msg of recentMessages) {
        if (msg.sender_id === userId) {
          consecutiveCount++;
        } else {
          // Found a message from the other user, break the streak
          break;
        }
      }

      // Allow up to 2 consecutive messages, then require a reply
      const MAX_CONSECUTIVE_MESSAGES = 2;
      if (consecutiveCount >= MAX_CONSECUTIVE_MESSAGES) {
        socket.emit('error', { 
          message: `Please wait for a reply before sending more messages. You've sent ${consecutiveCount} message${consecutiveCount > 1 ? 's' : ''} in a row.`
        });
        return;
      }

      // Get sender's display name
      const profile = db
        .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
        .get(userId) as { display_name: string } | undefined;

      if (!profile) {
        socket.emit('error', { message: 'Profile not found' });
        return;
      }

      // Get the other user's ID (needed for success tracking)
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

      // Save message to database
      const messageId = uuidv4();
      db.prepare(
        `INSERT INTO messages (id, match_id, sender_id, content) VALUES (?, ?, ?, ?)`
      ).run(messageId, matchId, userId, content.trim());

      // Track success signal: message exchanged (engagement)
      // Saved to PostgreSQL database - persists across logouts/redeploys
      const { recordSuccessSignal } = await import("./utils/successTracking.js");
      await recordSuccessSignal(userId, otherUserId, matchId, "message_exchanged");

      // Don't mark sender's own messages as read - they should only be marked
      // as read when the recipient actually views them

      // Create message object (include matchId for client routing)
      const message = {
        id: messageId,
        matchId,
        content: content.trim(),
        senderId: userId,
        senderName: profile.display_name,
        sentAt: new Date().toISOString(),
        readAt: null,
        isOwn: false, // Will be set correctly on client side
      };

      // Emit to all users in the match room (including sender)
      io.to(`match:${matchId}`).emit('new_message', message);
      // Also emit to recipient's user room (reliable delivery - user room always joined on connect)
      io.to(`user:${otherUserId}`).emit('new_message', message);

      // Send push notification to the other user (if they're not in the app)
      try {
        const { sendPushNotification, isPushNotificationConfigured, isExpoPushToken } = await import('./services/pushNotifications.js');
        
        if (!isPushNotificationConfigured()) {
          console.warn('⚠️  Push notification service not configured, skipping message notification');
        } else {
          // Get the other user's push token
          const otherUserPushTokenResult = db
            .prepare("SELECT push_token FROM users WHERE id = ?")
            .get(otherUserId) as { push_token: string | null } | undefined;
          
          if (otherUserPushTokenResult?.push_token && isExpoPushToken(otherUserPushTokenResult.push_token)) {
            const messagePreview = content.trim().length > 50 ? content.trim().substring(0, 50) + '...' : content.trim();
            const { sendMessagePushNotification } = await import('./services/pushNotifications.js');
            await sendMessagePushNotification(
              otherUserPushTokenResult.push_token,
              profile.display_name,
              messagePreview,
              matchId,
              userId
            );
            console.log(`✅ Sent push notification with message sound to ${otherUserId}`);
          } else {
            console.warn(`⚠️  No valid push token for user ${otherUserId}, skipping message notification`);
          }
        }
      } catch (pushError) {
        // Push notifications are optional, don't fail message sending if push fails
        console.warn('⚠️  Failed to send push notification for message (non-critical):', pushError);
      }

      // Don't mark messages as read here - they should only be marked as read
      // when the recipient actually views them (via mark_read event)

      // Update Compatibility Pulse score after new message
      try {
        const { updateCompatibilityScore } = await import('./services/compatibilityPulse.js');
        await updateCompatibilityScore(matchId, userId, otherUserId);
        
        // Get updated score and emit to both users
        const { getCompatibilityScore } = await import('./services/compatibilityPulse.js');
        const score = await getCompatibilityScore(matchId);
        if (score) {
          io.to(`match:${matchId}`).emit('compatibility_score_updated', {
            matchId,
            score: score.score,
            engagementLevel: score.engagementLevel,
            responseTimeAvg: score.responseTimeAvg,
            messageLengthAvg: score.messageLengthAvg,
          });
        }
      } catch (pulseError) {
        // Non-critical, don't fail message sending
        console.warn('⚠️  Failed to update compatibility pulse (non-critical):', pulseError);
      }

      // Check if we should auto-advance to stage2 (both users have sent at least 2 messages each)
      let autoAdvanced = false;
      if (match.stage === "stage1") {
        const countResult = db
          .prepare(`SELECT sender_id, COUNT(*) as count FROM messages WHERE match_id = ? GROUP BY sender_id`)
          .all(matchId) as Array<{ sender_id: string; count: number }>;
        const user1Count = countResult.find((c: { sender_id: string }) => c.sender_id === match.user1_id)?.count ?? 0;
        const user2Count = countResult.find((c: { sender_id: string }) => c.sender_id === match.user2_id)?.count ?? 0;

        if (user1Count >= 2 && user2Count >= 2) {
          // Auto-advance to stage2
          db.prepare(
            `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).run(matchId);
          autoAdvanced = true;

          // Track success signal: stage advanced (strong engagement)
          // Saved to PostgreSQL database - persists across logouts/redeploys
          const { recordSuccessSignal } = await import("./utils/successTracking.js");
          await recordSuccessSignal(match.user1_id, match.user2_id, matchId, "stage_advanced");
          await recordSuccessSignal(match.user2_id, match.user1_id, matchId, "stage_advanced");

          // Notify both users that stage advanced
          io.to(`match:${matchId}`).emit('stage_advanced', {
            matchId,
            stage: 'stage2',
            message: '🎉 You\'ve both sent 2+ messages! All photos are now revealed!',
            autoAdvanced: true,
          });
        }
      }

      // Don't emit messages_read here - that should only happen when recipient actually views messages

      // Clear typing indicator
      const typingSet = typingUsers.get(matchId);
      if (typingSet) {
        typingSet.delete(userId);
        if (typingSet.size === 0) {
          typingUsers.delete(matchId);
        }
        socket.to(`match:${matchId}`).emit('typing_stopped', { userId, matchId });
      }
    });

    // Typing indicator
    socket.on('typing', (data: { matchId: string }) => {
      const { matchId } = data;

      // Verify user is part of this match
      const match = db
        .prepare(
          `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
        )
        .get(matchId, userId, userId) as any;

      if (!match) {
        return;
      }

      // Add user to typing set
      if (!typingUsers.has(matchId)) {
        typingUsers.set(matchId, new Set());
      }
      typingUsers.get(matchId)!.add(userId);

      // Notify others in the match room
      socket.to(`match:${matchId}`).emit('user_typing', {
        userId,
        matchId,
        displayName: db.prepare('SELECT display_name FROM profiles WHERE user_id = ?').get(userId) as { display_name: string } | undefined,
      });
    });

    // Stop typing indicator
    socket.on('stop_typing', (data: { matchId: string }) => {
      const { matchId } = data;
      const typingSet = typingUsers.get(matchId);
      
      if (typingSet) {
        typingSet.delete(userId);
        if (typingSet.size === 0) {
          typingUsers.delete(matchId);
        }
        socket.to(`match:${matchId}`).emit('typing_stopped', { userId, matchId });
      }
    });

    // Mark messages as read
    socket.on('mark_read', (data: { matchId: string }) => {
      const { matchId } = data;

      // Verify user is part of this match
      const match = db
        .prepare(
          `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
        )
        .get(matchId, userId, userId) as any;

      if (!match) {
        return;
      }

      // Mark messages as read
      db.prepare(
        `UPDATE messages SET read_at = CURRENT_TIMESTAMP 
         WHERE match_id = ? AND sender_id != ? AND read_at IS NULL`
      ).run(matchId, userId);

      // Notify sender that messages were read
      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;
      io.to(`user:${otherUserId}`).emit('messages_read', { matchId });
    });

    // Request to reveal photos
    socket.on('request_reveal', (data: { matchId: string }) => {
      const { matchId } = data;

      // Verify user is part of this match
      const match = db
        .prepare(
          `SELECT * FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?) AND stage = 'stage1'`
        )
        .get(matchId, userId, userId) as any;

      if (!match) {
        socket.emit('error', { message: 'Match not found or not in stage1' });
        return;
      }

      const isUser1 = match.user1_id === userId;
      const revealColumn = isUser1 ? 'user1_wants_reveal' : 'user2_wants_reveal';
      const otherRevealColumn = isUser1 ? 'user2_wants_reveal' : 'user1_wants_reveal';

      // Check if already requested
      const currentMatch = db
        .prepare(`SELECT ${revealColumn}, ${otherRevealColumn} FROM matches WHERE id = ?`)
        .get(matchId) as { [key: string]: number } | undefined;

      if (currentMatch && currentMatch[revealColumn] === 1) {
        socket.emit('error', { message: 'You have already requested to reveal photos' });
        return;
      }

      // Set this user's reveal request
      db.prepare(
        `UPDATE matches SET ${revealColumn} = 1 WHERE id = ?`
      ).run(matchId);

      // Get sender's display name
      const profile = db
        .prepare('SELECT display_name FROM profiles WHERE user_id = ?')
        .get(userId) as { display_name: string } | undefined;

      // Check if both users want to reveal
      const updatedMatch = db
        .prepare(`SELECT user1_wants_reveal, user2_wants_reveal FROM matches WHERE id = ?`)
        .get(matchId) as { user1_wants_reveal: number; user2_wants_reveal: number } | undefined;

      const bothWantReveal = updatedMatch && updatedMatch.user1_wants_reveal === 1 && updatedMatch.user2_wants_reveal === 1;

      const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

      if (bothWantReveal) {
        // Both users want to reveal - move to stage 2
        db.prepare(
          `UPDATE matches SET stage = 'stage2', stage2_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(matchId);

        // Notify both users
        io.to(`match:${matchId}`).emit('stage_advanced', {
          matchId,
          stage: 'stage2',
          message: 'Photos revealed! You can now see each other.',
        });
      } else {
        // Only one user wants to reveal - notify the other
        io.to(`user:${otherUserId}`).emit('reveal_requested', {
          matchId,
          fromUserId: userId,
          fromUserName: profile?.display_name || 'Someone',
        });

        // Confirm to requester
        socket.emit('reveal_request_sent', {
          matchId,
          message: 'Reveal request sent! Waiting for the other person to agree.',
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ User ${userId} disconnected from WebSocket`);
      
      // Clean up typing indicators for all matches this user was in
      typingUsers.forEach((userSet, matchId) => {
        if (userSet.has(userId)) {
          userSet.delete(userId);
          if (userSet.size === 0) {
            typingUsers.delete(matchId);
          }
          // Notify others
          socket.to(`match:${matchId}`).emit('typing_stopped', { userId, matchId });
        }
      });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

