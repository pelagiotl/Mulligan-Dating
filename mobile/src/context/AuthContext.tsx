/**
 * Authentication Context
 * Converted from web version - uses AsyncStorage instead of localStorage
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Alert, AppState, AppStateStatus, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { api, clearTokenCache, setTokenCache } from '../utils/api';
import { User, Profile } from '../types';
import { registerForPushNotificationsAsync, clearPushToken } from '../utils/pushNotifications';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '../navigation/navigationRef';
import { playMessageSound, playMatchSound } from '../utils/sounds';
import { setPendingGameRequest } from '../utils/pendingGameRequest';
import { currentMatchIdRef } from '../utils/currentMatchView';

export type MessageNotification = { senderName: string; preview: string; matchId: string } | null;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  messageNotification: MessageNotification;
  clearMessageNotification: () => void;
  phoneLogin: (phoneNumber: string, code: string, referralCode?: string) => Promise<{ hasProfile: boolean }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const MESSAGE_NOTIFICATION_DURATION_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageNotification, setMessageNotificationState] = useState<MessageNotification>(null);
  const messageNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const messageNotificationSocketRef = useRef<Socket | null>(null);

  const clearMessageNotification = useCallback(() => {
    if (messageNotificationTimeoutRef.current) {
      clearTimeout(messageNotificationTimeoutRef.current);
      messageNotificationTimeoutRef.current = null;
    }
    setMessageNotificationState(null);
  }, []);

  const showMessageNotification = useCallback((senderName: string, preview: string, matchId: string) => {
    if (messageNotificationTimeoutRef.current) clearTimeout(messageNotificationTimeoutRef.current);
    setMessageNotificationState({ senderName, preview, matchId });
    messageNotificationTimeoutRef.current = setTimeout(() => {
      messageNotificationTimeoutRef.current = null;
      setMessageNotificationState(null);
    }, MESSAGE_NOTIFICATION_DURATION_MS);
  }, []);

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

      socket.on('new_message', (data: { matchId?: string; senderId: string; senderName?: string; content?: string }) => {
        try {
          if (data.senderId === user?.id) return;
          // Don't show if user is already viewing this match's chat (MatchesScreen keeps currentMatchIdRef in sync)
          if (data.matchId && currentMatchIdRef.current === data.matchId) {
            if (__DEV__) console.log('💬 In-app notification skipped: already viewing this chat');
            return;
          }
          const senderName = data.senderName || 'Someone';
          const preview = (data.content ?? '').substring(0, 50) || '📷 Photo';
          const displayPreview = data.content && data.content.length > 50 ? preview + '...' : preview;
          if (data.matchId) showMessageNotification(senderName, displayPreview, data.matchId);
          playMessageSound().catch(() => {});
          if (__DEV__) console.log('💬 In-app new message alert:', senderName, displayPreview.substring(0, 30));
          Alert.alert(
            '💬 New Message',
            `${senderName}: ${displayPreview}`,
            [
              {
                text: 'View',
                onPress: () => {
                  if (data.matchId && navigationRef.current?.isReady()) {
                    navigationRef.current.navigate('MainTabs' as never, {
                      screen: 'Matches',
                      params: { matchId: data.matchId },
                    } as never);
                  }
                },
              },
              { text: 'OK', style: 'cancel' },
            ]
          );
        } catch (err) {
          console.warn('⚠️ AuthContext new_message handler error:', err);
        }
      });
    };

    initMessageNotificationSocket();

    return () => {
      cancelled = true;
      if (messageNotificationSocketRef.current) {
        messageNotificationSocketRef.current.off('new_message');
        messageNotificationSocketRef.current.disconnect();
        messageNotificationSocketRef.current = null;
      }
    };
  }, [user?.id, showMessageNotification]);

  // Set up notification listeners for incoming push notifications
  useEffect(() => {
    // Only set up listeners if user is logged in
    if (!user) {
      return;
    }

    // Handle notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('📬 Notification received (foreground):', notification);
      const data = notification.request.content.data;
      
      // Show in-app notification for new messages (same as match: banner + sound + Alert)
      if (data?.type === 'new_message') {
        console.log('💬 New message notification:', {
          senderName: data.senderName,
          matchId: data.matchId,
          preview: notification.request.content.body,
        });
        const senderName = data.senderName || 'Someone';
        const messagePreview = notification.request.content.body || 'sent you a message';
        if (data?.matchId) showMessageNotification(senderName, messagePreview, data.matchId);
        playMessageSound().catch(() => {
          console.log('Message sound not available');
        });
        Alert.alert(
          '💬 New Message',
          `${senderName}: ${messagePreview}`,
          [
            {
              text: 'View',
              onPress: () => {
                // Navigate to the match if matchId is available
                if (data?.matchId) {
                  const attemptNavigation = (attemptNumber: number = 0) => {
                    const maxAttempts = 10; // Try for up to 5 seconds (10 attempts * 500ms)
                    
                    if (navigationRef.current?.isReady()) {
                      try {
                        navigationRef.current.navigate('MainTabs', {
                          screen: 'Matches',
                          params: { matchId: data.matchId },
                        });
                        console.log('✅ Navigated to message from in-app notification');
                      } catch (error) {
                        console.error('❌ Error navigating to match from notification:', error);
                      }
                    } else if (attemptNumber < maxAttempts) {
                      console.warn(`⚠️ Navigation not ready yet (attempt ${attemptNumber + 1}/${maxAttempts}), retrying...`);
                      setTimeout(() => {
                        attemptNavigation(attemptNumber + 1);
                      }, 500);
                    } else {
                      console.error('❌ Failed to navigate after max attempts');
                    }
                  };
                  
                  attemptNavigation();
                }
              },
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }
      
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

      // Show in-app notification for new matches
      if (data?.type === 'new_match') {
        console.log('🎉 New match notification:', {
          matchId: data.matchId,
          matchName: data.matchName,
        });
        
        // Play match sound
        playMatchSound().catch(() => {
          console.log('Match sound not available');
        });
        
        // Show in-app alert
        const matchName = data.matchName || 'Someone';
        Alert.alert(
          '🎉 New Match!',
          `${matchName} matched with you. Start chatting now!`,
          [
            {
              text: 'View',
              onPress: () => {
                // Navigate to the match if matchId is available (show MatchCelebration for User B)
                if (data?.matchId) {
                  const attemptNavigation = (attemptNumber: number = 0) => {
                    const maxAttempts = 10; // Try for up to 5 seconds (10 attempts * 500ms)
                    
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
                        console.log('✅ Navigated to match from in-app notification');
                      } catch (error) {
                        console.error('❌ Error navigating to match from notification:', error);
                      }
                    } else if (attemptNumber < maxAttempts) {
                      console.warn(`⚠️ Navigation not ready yet (attempt ${attemptNumber + 1}/${maxAttempts}), retrying...`);
                      setTimeout(() => {
                        attemptNavigation(attemptNumber + 1);
                      }, 500);
                    } else {
                      console.error('❌ Failed to navigate after max attempts');
                    }
                  };
                  
                  attemptNavigation();
                }
              },
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }
    });

    // Handle notification taps (when user taps notification)
    // This works even when app is closed - will trigger when app opens
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response);
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

  // Re-register push when app comes to foreground (ensures token is saved if initial registration failed or was delayed)
  const lastPushRegisterRef = useRef<number>(0);
  const PUSH_REREGISTER_DEBOUNCE_MS = 60000; // at most once per minute when foregrounding
  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      const now = Date.now();
      if (now - lastPushRegisterRef.current < PUSH_REREGISTER_DEBOUNCE_MS) return;
      lastPushRegisterRef.current = now;
      registerForPushNotificationsAsync().catch((e) => {
        console.warn('⚠️ Push re-register on foreground (non-critical):', e?.message || e);
      });
    });
    return () => subscription.remove();
  }, [user]);

  const checkAuth = async () => {
    try {
      // Wrap AsyncStorage in try-catch in case it fails to initialize
      let token: string | null = null;
      try {
        token = await AsyncStorage.getItem('token');
      } catch (storageError) {
        console.warn('⚠️ AsyncStorage error (non-critical):', storageError);
        // Continue without token - user will need to login again
        setLoading(false);
        return;
      }
      
      if (token) {
        setTokenCache(token);
        await fetchUser();
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

  const fetchUser = async () => {
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
        data = await api.get('/auth/me');
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
      });
      setProfile(data.profile || null);
      
      // Register for push notifications if user is logged in
      // (this handles the case where user refreshes the app and is already logged in)
      // Run this asynchronously after a delay to ensure app is fully initialized
      // This prevents any native module errors from crashing the app during startup
      if (data.user) {
        // Use setTimeout to defer push notification registration even more
        // The nativeModuleGuard will also wait for app initialization
        setTimeout(async () => {
          try {
            await registerForPushNotificationsAsync();
          } catch (pushError) {
            // Non-critical error, don't fail user fetch if push registration fails
            console.warn('⚠️  Failed to register for push notifications (non-critical):', pushError);
          }
        }, 3000); // Increased to 3 seconds delay + nativeModuleGuard will wait further if needed
      }
    } catch (error: any) {
      console.error('Fetch user error:', error);
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

  const phoneLogin = async (phoneNumber: string, code: string, referralCode?: string) => {
    try {
      const data: {
        token: string;
        userId: string;
        hasProfile: boolean;
        isNewUser: boolean;
        referralCode?: string;
      } = await api.post('/sms/verify-code', {
        phoneNumber,
        code,
        referralCode: referralCode || undefined,
        acceptTerms: true,
        acceptPrivacy: true,
      });

      await AsyncStorage.setItem('token', data.token);
      setTokenCache(data.token);
      await fetchUser();
      
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
    // Clear push token from backend before logout
    try {
      await clearPushToken();
    } catch (pushError) {
      // Non-critical error, continue with logout
      console.warn('⚠️  Failed to clear push token (non-critical):', pushError);
    }
    
    clearTokenCache();
    await AsyncStorage.removeItem('token');
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        messageNotification,
        clearMessageNotification,
        phoneLogin,
        logout,
        refreshProfile,
      }}
    >
      {messageNotification && (
        <TouchableOpacity
          style={messageNotificationStyles.banner}
          onPress={() => {
            clearMessageNotification();
            if (messageNotification.matchId && navigationRef.current?.isReady()) {
              navigationRef.current.navigate('MainTabs' as never, {
                screen: 'Matches',
                params: { matchId: messageNotification.matchId },
              } as never);
            }
          }}
          activeOpacity={0.9}
        >
          <Text style={messageNotificationStyles.bannerText} numberOfLines={2}>
            💬 {messageNotification.senderName}: {messageNotification.preview}
          </Text>
        </TouchableOpacity>
      )}
      {children}
    </AuthContext.Provider>
  );
}

const messageNotificationStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  bannerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

