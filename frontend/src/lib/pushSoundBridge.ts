/**
 * Plays Mulligan sounds when the service worker receives Web Push while a tab is open.
 * OS notifications still show when the app is backgrounded; open clients get in-app audio too.
 */

import { isIncomingMatchForConnectInitiator } from './connectInitiator';
import { playMatchCelebrationSound, playMessageNotificationSound } from '../utils/matchSound';

export const SW_MSG_NAVIGATE = 'MULLIGAN_NOTIFICATION_NAVIGATE';
export const SW_MSG_PLAY_MATCH_SOUND = 'MULLIGAN_PLAY_MATCH_SOUND';
export const SW_MSG_PLAY_MESSAGE_SOUND = 'MULLIGAN_PLAY_MESSAGE_SOUND';

const MESSAGE_TYPES = new Set([
  'new_message',
  'message_liked',
  'message_laughed',
  'message_heart_eyes',
]);

let registered = false;

export function registerPushSoundBridge(): void {
  if (registered || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  registered = true;

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const d = event.data as { type?: string; url?: string; matchId?: string; pushType?: string } | undefined;
    if (!d?.type) return;

    if (d.type === SW_MSG_NAVIGATE && typeof d.url === 'string' && d.url.trim()) {
      try {
        window.location.assign(d.url);
      } catch {
        /* ignore */
      }
      return;
    }

    if (d.type === SW_MSG_PLAY_MATCH_SOUND) {
      if (isIncomingMatchForConnectInitiator(d.matchId)) return;
      playMatchCelebrationSound();
      return;
    }

    if (d.type === SW_MSG_PLAY_MESSAGE_SOUND) {
      playMessageNotificationSound();
    }
  });
}

export function pushTypePlaysMessageSound(type: string | undefined): boolean {
  return !!type && MESSAGE_TYPES.has(type);
}
