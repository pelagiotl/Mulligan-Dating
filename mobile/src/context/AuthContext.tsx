/**
 * Authentication Context
 * Converted from web version - uses AsyncStorage instead of localStorage
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Alert, AppState, AppStateStatus, View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { api, clearTokenCache, setTokenCache, setOnSessionExpired } from '../utils/api';
import { User, Profile } from '../types';
import { registerForPushNotificationsAsync, clearPushToken, refreshAndSendPushTokenOnBackground } from '../utils/pushNotifications';
import { getStoredPushToken, hydrateStoredPushToken, shouldSendTokenToServer } from '../utils/pushTokenStore';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../navigation/navigationRef';
import { playMessageSound, playMatchSound } from '../utils/sounds';
import { setPendingGameRequest } from '../utils/pendingGameRequest';
import { currentMatchIdRef } from '../utils/currentMatchView';
import Purchases from 'react-native-purchases';

export type MessageNotificationItem = {
  id: string;
  senderName: string;
  preview: string;
  matchId: string;
  /** When 'message_liked', show "Message loved" and "❤️ {senderName} loved your message" */
  notificationType?: 'message' | 'message_liked';
};
/** @deprecated Use messageNotifications (array); kept for compatibility as first item or null */
export type MessageNotification = MessageNotificationItem | null;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  /** Stack of in-app message notifications (newest first). */
  messageNotifications: MessageNotificationItem[];
  /** Single notification for backward compat; first in stack or null. */
  messageNotification: MessageNotification;
  clearMessageNotification: (id?: string) => void;
  /** Register a callback to refresh the match list when new_match is received (e.g. from another tab). Call with null to unregister. */
  registerMatchListRefresh: (callback: (() => void) | null) => void;
  phoneLogin: (phoneNumber: string, code: string) => Promise<{ hasProfile: boolean }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  /** TokenDisplay registers; call after IAP (e.g. Settings) so Browse header balance updates. */
  registerTokensBalanceRefresh: (callback: (() => Promise<void>) | null) => void;
  refreshTokensBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MESSAGE_NOTIFICATION_DURATION_MS = 5000;
const MAX_STACKED_MESSAGE_NOTIFICATIONS = 5;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageNotifications, setMessageNotifications] = useState<MessageNotificationItem[]>([]);
  const messageNotificationTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const messageNotificationSocketRef = useRef<Socket | null>(null);
  const lastMessageDedupeRef = useRef<{ matchId: string; at: number } | null>(null);
  const onNewMatchRef = useRef<(() => void) | null>(null);
  const logoutRef = useRef<(() => Promise<void>) | null>(null);
  const tokensBalanceRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const registerMatchListRefresh = useCallback((callback: (() => void) | null) => {
    onNewMatchRef.current = callback;
  }, []);

  const clearMessageNotification = useCallback((id?: string) => {
    if (id) {
      const t = messageNotificationTimeoutsRef.current.get(id);
      if (t) {
        clearTimeout(t);
        messageNotificationTimeoutsRef.current.delete(id);
      }
      setMessageNotifications((prev) => prev.filter((n) => n.id !== id));
    } else {
      messageNotificationTimeoutsRef.current.forEach((t) => clearTimeout(t));
      messageNotificationTimeoutsRef.current.clear();
      setMessageNotifications([]);
    }
  }, []);

  const showMessageNotification = useCallback((senderName: string, preview: string, matchId: string, notificationType: 'message' | 'message_liked' = 'message') => {
    const id = `${Date.now()}-${matchId}-${Math.random().toString(36).slice(2, 9)}`;
    const item: MessageNotificationItem = { id, senderName, preview, matchId, notificationType };
    setMessageNotifications((prev) => {
      const next = [item, ...prev].slice(0, MAX_STACKED_MESSAGE_NOTIFICATIONS);
      return next;
    });
    const timeoutId = setTimeout(() => {
      messageNotificationTimeoutsRef.current.delete(id);
      setMessageNotifications((prev) => prev.filter((n) => n.id !== id));
    }, MESSAGE_NOTIFICATION_DURATION_MS);
    messageNotificationTimeoutsRef.current.set(id, timeoutId);
  }, []);

  const showMessageLikedNotification = useCallback((likerName: string, matchId: string) => {
    showMessageNotification(likerName, 'loved your message', matchId, 'message_liked');
  }, [showMessageNotification]);

  useEffect(() => {
    checkAuth();
  }, []);

  // Dedicated socket for in-app message notifications (always active when logged in, like match notification)
  // Backend emits new_message to user:${userId}, so we receive it regardless of which tab is focused
  useEffect(() => {
    if (!user?.id) {
      if (messageNotificationSocketRef.current) {
        messageNotificationSocketRef.current.disconnect();
        messageNotificationSocketRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let connectRetryCount = 0;
    const MAX_CONNECT_RETRIES = 1;

    const initMessageNotificationSocket = async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token || cancelled) return;

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mulligan-backend.onrender.com';
      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      if (cancelled) {
        socket.disconnect();
        return;
      }
      messageNotificationSocketRef.current = socket;

      socket.on('connect', () => {
        if (!cancelled) console.log('✅ AuthContext: Message notification socket connected');
      });

      socket.on('connect_error', (err) => {
        if (!cancelled) {
          console.warn('⚠️ AuthContext: Message notification socket connect_error:', err?.message || err);
          if (connectRetryCount < MAX_CONNECT_RETRIES) {
            connectRetryCount++;
            setTimeout(() => {
              if (!cancelled && messageNotificationSocketRef.current === socket) {
                socket.disconnect();
                messageNotificationSocketRef.current = null;
                initMessageNotificationSocket();
              }
            }, 2000);
          }
        }
      });

      socket.on('disconnect', (reason) => {
        if (!cancelled && reason !== 'io client disconnect') {
          console.warn('⚠️ AuthContext: Message notification socket disconnected:', reason);
        }
      });

      socket.on('new_match', () => {
        // Do not play match sound here. It plays only when the "It's a match" card reveals in MatchCelebration
        // (after "Finding your curated match..."). That way the sound never plays when the loading card opens.
        api.clearCache('/tokens');
        api.clearCache('/matches');
        // Refresh match list so User A sees the new match even when on another tab (MatchesScreen registers this callback)
        onNewMatchRef.current?.();
      });

      socket.on('new_message', (data: { matchId?: string; senderId: string; senderName?: string; content?: string; id?: string }) => {
        try {
          if (data.senderId === user?.id) return;
          // Don't show if user is already viewing this match's chat (MatchesScreen keeps currentMatchIdRef in sync)
          if (data.matchId && currentMatchIdRef.current === data.matchId) {
            if (__DEV__) console.log('💬 In-app notification skipped: already viewing this chat');
            return;
          }
          // Dedupe: backend emits to both match room and user room, so we can get the same message twice
          const now = Date.now();
          const last = lastMessageDedupeRef.current;
          if (data.matchId && last?.matchId === data.matchId && now - last.at < 2500) {
            if (__DEV__) console.log('💬 In-app notification skipped: duplicate (same match within 2.5s)');
            return;
          }
          if (data.matchId) lastMessageDedupeRef.current = { matchId: data.matchId, at: now };
          const senderName = data.senderName || 'Someone';
          const preview = (data.content ?? '').substring(0, 50) || '📷 Photo';
          const displayPreview = data.content && data.content.length > 50 ? preview + '...' : preview;
          if (data.matchId) showMessageNotification(senderName, displayPreview, data.matchId);
          playMessageSound().catch(() => {});
          if (__DEV__) console.log('💬 In-app new message alert:', senderName, displayPreview.substring(0, 30));
        } catch (err) {
          console.warn('⚠️ AuthContext new_message handler error:', err);
        }
      });

      socket.on('message_liked', (data: { matchId: string; messageId?: string; likedBy: string; likerName?: string; senderId?: string }) => {
        try {
          // Only notify when our message was liked (we are the sender of the message)
          if (data.senderId !== user?.id) return;
          if (!data.matchId) return;
          if (currentMatchIdRef.current === data.matchId) {
            if (__DEV__) console.log('❤️ Message liked in-app notification skipped: already viewing this chat');
            return;
          }
          const likerName = data.likerName || 'Someone';
          showMessageLikedNotification(likerName, data.matchId);
          playMessageSound().catch(() => {});
          if (__DEV__) console.log('❤️ In-app message liked alert:', likerName);
        } catch (err) {
          console.warn('⚠️ AuthContext message_liked handler error:', err);
        }
      });
    };

    initMessageNotificationSocket();

    return () => {
      cancelled = true;
      if (messageNotificationSocketRef.current) {
        messageNotificationSocketRef.current.off('new_match');
        messageNotificationSocketRef.current.off('new_message');
        messageNotificationSocketRef.current.off('message_liked');
        messageNotificationSocketRef.current.disconnect();
        messageNotificationSocketRef.current = null;
      }
    };
  }, [user?.id, showMessageNotification, showMessageLikedNotification]);

  // Reconnect message notification socket when app comes to foreground (Android often drops socket in background)
  useEffect(() => {
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const socket = messageNotificationSocketRef.current;
      if (socket && !socket.connected) {
        if (__DEV__) console.log('🔄 AuthContext: Reconnecting message notification socket after app resume');
        socket.connect();
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  // Set up notification listeners for incoming push notifications
  useEffect(() => {
    // Only set up listeners if user is logged in
    if (!user) {
      return;
    }

    // Handle notifications received (foreground; sometimes background on iOS)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('📬 Notification received (foreground):', notification);
      const data = notification.request.content.data;
      // After first push, token may rotate on some devices (e.g. iPhone 15 Pro Max); refresh and send so 2nd+ pushes work
      if (data?.type === 'new_message') {
        refreshAndSendPushTokenOnBackground().catch(() => {});
      }
      // Do NOT show in-app banner/sound for new_message when in foreground - the socket already
      // delivered new_message and we showed the banner once. Showing here too caused duplicate notifications.
      // Push is for when app is backgrounded/closed (OS shows it); when foreground we rely on socket only.
      
      // Show in-app notification for game request
      if (data?.type === 'game_request') {
        playMessageSound().catch(() => {});
        const fromUserName = data.fromUserName || 'Someone';
        const gameLabel = data.gameType === 'truth_or_dare' ? 'Truth or Dare' : 'Never Have I Ever';
        setPendingGameRequest({
          requestId: data.requestId,
          matchId: data.matchId,
          fromUserId: data.fromUserId,
          fromUserName,
          gameType: data.gameType,
        });
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10;
          if (navigationRef.current?.isReady() && data?.matchId) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: { matchId: data.matchId, showGameRequest: true },
              });
            } catch (e) {
              console.error('Navigate to game request failed:', e);
            }
          } else if (attemptNumber < maxAttempts) {
            setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
          }
        };
        attemptNavigation();
        Alert.alert(
          '🎲 Game Invite',
          `${fromUserName} wants to play ${gameLabel} with you!`,
          [
            { text: 'View', onPress: () => attemptNavigation(0) },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }

      // New match: go straight to big MatchCelebration (no small alert). Sound plays when MatchCelebration mounts.
      if (data?.type === 'new_match') {
        console.log('🎉 New match notification:', {
          matchId: data.matchId,
          matchName: data.matchName,
        });
        if (data?.matchId) {
          const attemptNavigation = (attemptNumber: number = 0) => {
            const maxAttempts = 10;
            if (navigationRef.current?.isReady()) {
              try {
                navigationRef.current.navigate('MainTabs', {
                  screen: 'Matches',
                  params: {
                    matchId: data.matchId,
                    showMatchCelebration: true,
                    matchName: data.matchName || 'Someone',
                  },
                });
                console.log('✅ Navigated to match celebration');
              } catch (error) {
                console.error('❌ Error navigating to match:', error);
              }
            } else if (attemptNumber < maxAttempts) {
              setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
            }
          };
          attemptNavigation();
        }
      }
    });

    // Handle notification taps (when user taps notification)
    // This works even when app is closed - will trigger when app opens
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response);
      // Refresh and send push token when opening from notification so backend has latest token
      // (FCM/APNs may have rotated it; avoids notifications stopping after 15–30s)
      registerForPushNotificationsAsync().catch(() => {});
      const data = response.notification.request.content.data;
      
      // If it's a game request, set pending and navigate
      if (data?.type === 'game_request' && data?.matchId && data?.requestId) {
        setPendingGameRequest({
          requestId: data.requestId,
          matchId: data.matchId,
          fromUserId: data.fromUserId || '',
          fromUserName: data.fromUserName || 'Someone',
          gameType: data.gameType || 'truth_or_dare',
        });
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10;
          if (navigationRef.current?.isReady()) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: { matchId: data.matchId, showGameRequest: true },
              });
            } catch (e) {
              console.error('Navigate to game request failed:', e);
            }
          } else if (attemptNumber < maxAttempts) {
            setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
          }
        };
        attemptNavigation();
      }

      // If it's a new match, navigate to that match and show MatchCelebration for User B
      if (data?.type === 'new_match' && data?.matchId) {
        console.log('🎉 Navigating to match from notification tap:', data.matchId);
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10;
          if (navigationRef.current?.isReady()) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: {
                  matchId: data.matchId,
                  showMatchCelebration: true,
                  matchName: data.matchName || 'Someone',
                },
              });
              console.log('✅ Navigated to match from notification tap');
            } catch (error) {
              console.error('❌ Error navigating to match:', error);
            }
          } else if (attemptNumber < maxAttempts) {
            setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
          }
        };
        attemptNavigation();
      }

      // If it's a message liked notification, navigate to that match
      if (data?.type === 'message_liked' && data?.matchId) {
        console.log('❤️ Navigating to match from message liked notification:', data.matchId);
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10;
          if (navigationRef.current?.isReady() && user) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: { matchId: data.matchId },
              });
              console.log('✅ Navigated to match from message liked');
            } catch (error) {
              console.error('❌ Error navigating to match:', error);
            }
          } else if (attemptNumber < maxAttempts) {
            setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
          }
        };
        attemptNavigation();
      }

      // If it's a message liked notification, navigate to that match
      if (data?.type === 'message_liked' && data?.matchId) {
        console.log('❤️ Navigating to match from message liked notification:', data.matchId);
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10;
          if (navigationRef.current?.isReady() && user) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: { matchId: data.matchId },
              });
              console.log('✅ Navigated to match from message liked');
            } catch (error) {
              console.error('❌ Error navigating to match:', error);
            }
          } else if (attemptNumber < maxAttempts) {
            setTimeout(() => attemptNavigation(attemptNumber + 1), 500);
          }
        };
        attemptNavigation();
      }

      // If it's a message or date plan notification, navigate to that match
      if (data?.type === 'new_message' && data?.matchId) {
        console.log('💬 Navigating to match:', data.matchId);
        
        // Function to attempt navigation
        const attemptNavigation = (attemptNumber: number = 0) => {
          const maxAttempts = 10; // Try for up to 5 seconds (10 attempts * 500ms)
          
          if (navigationRef.current?.isReady() && user) {
            try {
              navigationRef.current.navigate('MainTabs', {
                screen: 'Matches',
                params: { matchId: data.matchId },
              });
              console.log('✅ Navigated to Matches screen with matchId:', data.matchId);
            } catch (error) {
              console.error('❌ Error navigating to match:', error);
            }
          } else if (attemptNumber < maxAttempts) {
            console.warn(`⚠️ Navigation not ready yet (attempt ${attemptNumber + 1}/${maxAttempts}), retrying...`);
            // Retry after a delay - longer delay for later attempts
            setTimeout(() => {
              attemptNavigation(attemptNumber + 1);
            }, 500);
          } else {
            console.error('❌ Failed to navigate after max attempts - navigation may not be ready');
          }
        };
        
        // Start navigation attempt
        attemptNavigation();
      }
    });

    return () => {
      // Clean up listeners
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user, showMessageNotification]);

  // Handle cold start: app opened by tapping a notification (e.g. message when app was closed)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      // Refresh and send push token so backend has latest token after cold start from notification
      registerForPushNotificationsAsync().catch(() => {});
      const data = response.notification.request.content.data;
      const attemptNavigation = (attempt: number = 0) => {
        if (attempt >= 15) return;
        if (!navigationRef.current?.isReady()) {
          setTimeout(() => attemptNavigation(attempt + 1), 400);
          return;
        }
        try {
          if (data?.type === 'new_message' && data?.matchId) {
            navigationRef.current.navigate('MainTabs' as never, {
              screen: 'Matches',
              params: { matchId: data.matchId },
            } as never);
          } else if (data?.type === 'message_liked' && data?.matchId) {
            navigationRef.current.navigate('MainTabs' as never, {
              screen: 'Matches',
              params: { matchId: data.matchId },
            } as never);
          } else if (data?.type === 'new_match' && data?.matchId) {
            navigationRef.current.navigate('MainTabs' as never, {
              screen: 'Matches',
              params: {
                matchId: data.matchId,
                showMatchCelebration: true,
                matchName: data.matchName || 'Someone',
              },
            } as never);
          } else if (data?.type === 'game_request' && data?.matchId && data?.requestId) {
            setPendingGameRequest({
              requestId: data.requestId,
              matchId: data.matchId,
              fromUserId: data.fromUserId || '',
              fromUserName: data.fromUserName || 'Someone',
              gameType: data.gameType || 'truth_or_dare',
            });
            navigationRef.current.navigate('MainTabs' as never, {
              screen: 'Matches',
              params: { matchId: data.matchId, showGameRequest: true },
            } as never);
          }
        } catch (_) {}
      };
      setTimeout(() => attemptNavigation(), 500);
    });
    return () => { cancelled = true; };
  }, [user]);

  // Re-register push when app comes to foreground (ensures token is saved if initial registration failed or was delayed)
  const lastPushRegisterRef = useRef<number>(0);
  const PUSH_REREGISTER_DEBOUNCE_MS = 20000; // at most once per 20s when foregrounding (keeps token fresh so pushes don't stop after 15–30s)
  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background') {
        // Refresh and send push token when leaving app so backend has latest token;
        // avoids second+ message pushes failing after ~10s when FCM/OS may have refreshed the token.
        refreshAndSendPushTokenOnBackground().catch(() => {});
        return;
      }
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastPushRegisterRef.current < PUSH_REREGISTER_DEBOUNCE_MS) return;
      lastPushRegisterRef.current = now;
      const stored = getStoredPushToken();
      if (stored && stored.trim()) {
        api.post('/auth/push-token', { pushToken: stored }).then(() => {
          if (__DEV__) console.log('📲 Push token sent to backend on foreground');
        }).catch(() => {});
      }
      registerForPushNotificationsAsync().catch((e) => {
        console.warn('⚠️ Push re-register on foreground (non-critical):', e?.message || e);
      });
      // iOS (e.g. iPhone 15 Pro Max): token may be rotated after first push; refresh again after 2s so backend gets latest
      if (Platform.OS === 'ios') {
        setTimeout(() => refreshAndSendPushTokenOnBackground().catch(() => {}), 2000);
      }
    });
    return () => subscription.remove();
  }, [user]);

  // Fallback: 3s after login, if we have a token from storage but never got a fresh one this session,
  // POST it once so the server has a token even if the user backgrounds before 5s/10s registration runs.
  const sentHydratedTokenRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      if (sentHydratedTokenRef.current) return;
      const stored = getStoredPushToken();
      if (stored?.trim() && !shouldSendTokenToServer()) {
        sentHydratedTokenRef.current = true;
        api.post('/auth/push-token', { pushToken: stored }).then(() => {
          if (__DEV__) console.log('📲 Push token (from storage) sent to backend — fallback so notifications work after close.');
        }).catch(() => {});
      }
    }, 3000);
    return () => clearTimeout(t);
  }, [user?.id]);

  // Second push registration attempt on cold start (5s after user is set). The first is at 1.5s in fetchUser;
  // if native modules weren't ready, this gives the recipient's device another chance to save the token.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      registerForPushNotificationsAsync().catch((e) => {
        console.warn('⚠️ Push re-register on cold start (non-critical):', e?.message || e);
      });
    }, 5000);
    return () => clearTimeout(t);
  }, [user?.id]);

  // Android: third registration attempt at 15s (FCM can be slow to initialize on some devices).
  // If we still have no fresh token, send the stored (hydrated) token to the server once so pushes can work.
  useEffect(() => {
    if (!user || Platform.OS !== 'android') return;
    const t = setTimeout(async () => {
      try {
        const fresh = await registerForPushNotificationsAsync();
        if (!fresh) {
          const stored = getStoredPushToken();
          if (stored?.trim()) {
            await api.post('/auth/push-token', { pushToken: stored });
            if (__DEV__) console.log('📲 Push: Android — sent stored token to server (fresh token unavailable)');
          }
        }
      } catch (_) {}
    }, 15000);
    return () => clearTimeout(t);
  }, [user?.id]);

  // iOS: some devices (e.g. iPhone 15 Pro Max) may not provide push token until later; retry at 10s so token is sent before user backgrounds
  useEffect(() => {
    if (!user || Platform.OS !== 'ios') return;
    const t = setTimeout(() => {
      registerForPushNotificationsAsync().catch(() => {});
    }, 10000);
    return () => clearTimeout(t);
  }, [user?.id]);

  const checkAuth = async () => {
    try {
      // Wrap AsyncStorage in try-catch in case it fails to initialize
      let token: string | null = null;
      try {
        token = await AsyncStorage.getItem('token');
        // On some devices AsyncStorage can be slow on first read; retry once after a short delay
        if (!token) {
          await new Promise((r) => setTimeout(r, 300));
          token = await AsyncStorage.getItem('token');
        }
      } catch (storageError) {
        console.warn('⚠️ AsyncStorage error (non-critical):', storageError);
        // Continue without token - user will need to login again
        setLoading(false);
        return;
      }
      
      if (token) {
        setTokenCache(token);
        // Restore last session's push token so the very first request sends it (fixes notifications for recipient).
        await hydrateStoredPushToken();
        // Don't block on push registration — fetch user immediately for a faster open. Push runs in parallel;
        // the first API request will send X-Push-Token from the store, and we re-register after 500ms in fetchUser.
        registerForPushNotificationsAsync().catch((e) => {
          console.warn('⚠️ Push register on auth (non-critical):', e?.message || e);
        });
        await fetchUser(false);
      } else {
        // No token found - show login screen
        setLoading(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      // Always set loading to false to prevent infinite loading
      setLoading(false);
    }
  };

  const fetchUser = async (useCache: boolean = true) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      let data: any;
      try {
        data = await api.get('/auth/me', useCache);
      } catch (apiError: any) {
        // Handle network/connection errors gracefully
        if (apiError?.status === 0 || 
            apiError?.message?.includes('Failed to fetch') || 
            apiError?.message?.includes('NetworkError') ||
            apiError?.message?.includes('timeout')) {
          console.warn('⚠️ Backend not accessible. App will work in offline mode.');
          // Don't clear token - user might just be offline or backend is starting
          // Allow user to still use the app, they'll just need to login again when backend is up
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        // For auth errors (401, 403), clear token
        if (apiError?.status === 401 || apiError?.status === 403) {
          await AsyncStorage.removeItem('token');
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        throw apiError; // Re-throw other errors
      }
      
      if (!data || !data.user) {
        throw new Error('Invalid response from server');
      }

      setUser({
        id: data.user.id,
        email: data.user.email,
        phoneNumber: data.user.phoneNumber,
        isAdmin: data.user.isAdmin || false,
        hasPushToken: data.user.hasPushToken ?? false,
      });
      setProfile(data.profile || null);

      // Identify user to RevenueCat for in-app purchase attribution (no-op in Expo Go)
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          const p = Purchases.logIn(data.user.id);
          if (p && typeof p.catch === 'function') p.catch((err: unknown) => console.warn('RevenueCat logIn failed:', err));
        } catch (_) {}
      }

      // Register for push notifications if user is logged in
      // (this handles the case where user refreshes the app and is already logged in)
      // Run this asynchronously after a delay to ensure app is fully initialized
      // This prevents any native module errors from crashing the app during startup
      if (data.user) {
        // Second registration attempt after fetchUser (native modules should be ready by now)
        setTimeout(async () => {
          try {
            await registerForPushNotificationsAsync();
          } catch (pushError) {
            console.warn('⚠️  Push registration failed:', pushError);
          }
        }, 500);
      }
    } catch (error: any) {
      if (error?.status !== 429) {
        console.error('Fetch user error:', error);
      }
      // Only clear token for auth errors, not network errors
      if (error?.status === 401 || error?.status === 403) {
        await AsyncStorage.removeItem('token');
      }
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const phoneLogin = async (phoneNumber: string, code: string) => {
    try {
      const data: {
        token: string;
        userId: string;
        hasProfile: boolean;
        isNewUser: boolean;
      } = await api.post('/sms/verify-code', {
        phoneNumber,
        code,
        acceptTerms: true,
        acceptPrivacy: true,
      });

      await AsyncStorage.setItem('token', data.token);
      setTokenCache(data.token);
      await fetchUser(false);
      
      // Register for push notifications after login
      // Run asynchronously after a delay to ensure app is fully initialized
      // This prevents any native module errors from crashing the app
      setTimeout(async () => {
        try {
          await registerForPushNotificationsAsync();
        } catch (pushError) {
          // Non-critical error, don't fail login if push registration fails
          console.warn('⚠️  Failed to register for push notifications (non-critical):', pushError);
        }
      }, 1000); // 1 second delay to ensure app is fully initialized
      
      return { hasProfile: data.hasProfile };
    } catch (error) {
      clearTokenCache();
      await AsyncStorage.removeItem('token');
      setUser(null);
      setProfile(null);
      throw error;
    }
  };

  const logout = async () => {
    clearMessageNotification();
    try {
      await clearPushToken();
    } catch (pushError) {
      console.warn('⚠️  Failed to clear push token (non-critical):', pushError);
    }
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const p = Purchases.logOut();
        if (p && typeof p.catch === 'function') p.catch((err: unknown) => console.warn('RevenueCat logOut failed:', err));
      } catch (_) {}
    }
    clearTokenCache();
    api.clearCache(); // Prevent next account from seeing previous user's cached profile/data
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('AGE_GATE_ACCEPTED'); // So next login shows age gate again
    setUser(null);
    setProfile(null);
  };

  logoutRef.current = logout;

  // When API client clears token (401/403 invalid or expired), logout and show login so we don't spam requests
  useEffect(() => {
    setOnSessionExpired(() => {
      logoutRef.current?.();
    });
    return () => setOnSessionExpired(null);
  }, []);

  const refreshProfile = async () => {
    // Always bypass cache after profile mutations so navigation decisions
    // are based on fresh server state.
    api.clearCache('/auth/me');
    await fetchUser(false);
  };

  const registerTokensBalanceRefresh = useCallback((callback: (() => Promise<void>) | null) => {
    tokensBalanceRefreshRef.current = callback;
  }, []);

  const refreshTokensBalance = useCallback(async () => {
    await tokensBalanceRefreshRef.current?.();
  }, []);

  const insets = useSafeAreaInsets();
  const messageSlideAnim = useRef(new Animated.Value(-120)).current;
  const hasNotifications = messageNotifications.length > 0;
  const messageNotification = hasNotifications ? messageNotifications[0] : null;

  useEffect(() => {
    if (hasNotifications) {
      messageSlideAnim.setValue(-120);
      Animated.spring(messageSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 72,
        friction: 12,
      }).start();
    } else {
      messageSlideAnim.setValue(-120);
    }
  }, [hasNotifications, messageSlideAnim]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        messageNotifications,
        messageNotification,
        clearMessageNotification,
        registerMatchListRefresh,
        phoneLogin,
        logout,
        refreshProfile,
        registerTokensBalanceRefresh,
        refreshTokensBalance,
      }}
    >
      {hasNotifications && (
        <Animated.View
          style={[
            messageNotificationStyles.bannerWrap,
            { paddingTop: Math.max(insets.top, 8) },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View style={[messageNotificationStyles.stack, { transform: [{ translateY: messageSlideAnim }] }]}>
            {messageNotifications.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.92}
                onPress={() => {
                  clearMessageNotification(item.id);
                  if (item.matchId && navigationRef.current?.isReady()) {
                    navigationRef.current.navigate('MainTabs' as never, {
                      screen: 'Matches',
                      params: { matchId: item.matchId },
                    } as never);
                  }
                }}
                style={[
                  messageNotificationStyles.bannerTouchable,
                  index > 0 && messageNotificationStyles.bannerTouchableStacked,
                ]}
              >
                <LinearGradient
                  colors={['#8b5cf6', '#a855f7', '#c026d3', '#be185d']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={messageNotificationStyles.gradient}
                >
                  <View style={messageNotificationStyles.bannerContent}>
                    <View style={messageNotificationStyles.iconCircle}>
                      <Text style={messageNotificationStyles.iconText}>{item.notificationType === 'message_liked' ? '❤️' : '💬'}</Text>
                    </View>
                    <View style={messageNotificationStyles.textBlock}>
                      <Text style={messageNotificationStyles.label}>{item.notificationType === 'message_liked' ? 'Message loved' : 'New message'}</Text>
                      <Text style={messageNotificationStyles.senderName} numberOfLines={1}>
                        {item.notificationType === 'message_liked' ? `❤️ ${item.senderName} ${item.preview}` : item.senderName}
                      </Text>
                      {item.notificationType !== 'message_liked' && (
                        <Text style={messageNotificationStyles.preview} numberOfLines={1}>
                          {item.preview}
                        </Text>
                      )}
                    </View>
                    <View style={messageNotificationStyles.viewPill}>
                      <Text style={messageNotificationStyles.viewPillText}>View</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </Animated.View>
      )}
      {children}
    </AuthContext.Provider>
  );
}

const messageNotificationStyles = StyleSheet.create({
  bannerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  stack: {},
  bannerTouchable: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  bannerTouchableStacked: {
    marginTop: 8,
  },
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 22,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  senderName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 1,
  },
  preview: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  viewPill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginLeft: 10,
  },
  viewPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7c3aed',
  },
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

