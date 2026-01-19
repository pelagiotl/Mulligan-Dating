/**
 * Main App Entry Point
 * Sets up navigation and authentication
 */

// IMPORTANT: react-native-gesture-handler must be imported FIRST
// This is required for React Navigation to work properly
import 'react-native-gesture-handler';

import React from 'react';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// Note: Stripe PaymentSheet requires a development build (not Expo Go)
// For now, using web-based payment flow that works with Expo Go
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ErrorBoundary>
  );
}

