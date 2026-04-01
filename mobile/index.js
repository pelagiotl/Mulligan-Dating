/**
 * Metro entry (replaces expo/AppEntry.js).
 * Order: gesture-handler → timer patch → LogBox ignores → Expo root.
 */
import 'react-native-gesture-handler';
import './src/utils/installHermesTimerPatch';

import { LogBox } from 'react-native';

if (__DEV__) {
  LogBox.ignoreLogs([
    /Possible unhandled promise rejection/i,
    /Possible Unhandled Promise Rejection/i,
    /Native is disabled/i,
    /clearTimeout called with an invalid handle/i,
    /clearInterval called with an invalid handle/i,
  ]);
}

import { registerRootComponent } from 'expo';
import App from './App';

if (__DEV__) {
  const origWarn = console.warn.bind(console);
  console.warn = (...args) => {
    try {
      const text = args
        .map((a) => {
          if (typeof a === 'string') return a;
          if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
          return String(a);
        })
        .join(' ');
      if (
        /native is disabled/i.test(text) ||
        /clearTimeout called with an invalid handle/i.test(text) ||
        /clearInterval called with an invalid handle/i.test(text) ||
        /Possible .*handled [Pp]romise [Rr]ejection/i.test(text)
      ) {
        return;
      }
    } catch (_) {
      /* ignore */
    }
    origWarn(...args);
  };
}

registerRootComponent(App);
