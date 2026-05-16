import { db } from '../database.js';

/**
 * Notify everyone in an active chat (stage1/stage2) that this user updated profile-visible data,
 * so clients can refetch GET /matches and refresh partner quick view / drawers.
 */
export async function broadcastPartnerProfileUpdated(editorUserId: string): Promise<void> {
  try {
    const { getIO } = await import('../socket.js');
    const io = getIO();
    if (!io) return;

    const raw = await db
      .prepare(
        `SELECT id, user1_id, user2_id FROM matches
         WHERE (user1_id = ? OR user2_id = ?) AND stage IN ('stage1', 'stage2')`
      )
      .all(editorUserId, editorUserId);
    const list = Array.isArray(raw) ? raw : [];
    for (const row of list as { id: string; user1_id: string; user2_id: string }[]) {
      const otherUserId = row.user1_id === editorUserId ? row.user2_id : row.user1_id;
      io.to(`user:${otherUserId}`).emit('partner_profile_updated', {
        matchId: row.id,
        updatedUserId: editorUserId,
      });
    }
  } catch (err) {
    console.warn('⚠️ broadcastPartnerProfileUpdated failed:', err);
  }
}

/** Fire-and-forget from route handlers (don't block or fail the HTTP response). */
export function notifyPartnersProfileChanged(editorUserId: string): void {
  void broadcastPartnerProfileUpdated(editorUserId);
}
