/**
 * Navigation Reference
 * Exported separately to avoid circular dependencies
 */

import { NavigationContainerRef } from '@react-navigation/native';

// Define types here to avoid importing from AppNavigator
export type RootStackParamList = {
  PhoneLogin: undefined;
  AgeGate: { nextRoute: 'CreateProfile' | 'MainTabs' } | undefined;
  CreateProfile: {
    startFromBeginning?: boolean;
    initialStep?: number;
    /** Set when routed here after SMS login — allows auto-skip to Connect when profile is already complete. */
    fromPostAuthLogin?: boolean;
  } | undefined;
  MainTabs: { screen?: string; params?: object } | undefined;
  Terms: undefined;
  Privacy: undefined;
  PushNotificationSettings: undefined;
  BlockedUsers: undefined;
};

// Create ref object directly (not using useRef hook since this is module-level)
export const navigationRef: { current: NavigationContainerRef<RootStackParamList> | null } = { current: null };

