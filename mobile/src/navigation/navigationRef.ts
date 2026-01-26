/**
 * Navigation Reference
 * Exported separately to avoid circular dependencies
 */

import { NavigationContainerRef } from '@react-navigation/native';

// Define types here to avoid importing from AppNavigator
export type RootStackParamList = {
  PhoneLogin: undefined;
  CreateProfile: undefined;
  MainTabs: undefined;
  Terms: undefined;
  Privacy: undefined;
};

// Create ref object directly (not using useRef hook since this is module-level)
export const navigationRef: { current: NavigationContainerRef<RootStackParamList> | null } = { current: null };

