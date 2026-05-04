/**
 * Dynamic Expo config. `config` is the resolved static config from `app.json`.
 *
 * When EXPO_NO_SENTRY_PLUGIN=1, the @sentry/react-native config plugin is skipped
 * (can slow local `expo start` on some machines). Do not set on EAS production.
 *
 * If `expo start` hangs silently after `env: export` (before "Starting project at"),
 * that is usually native URI scheme resolution — use `npm run start:quick` instead.
 */
module.exports = ({ config }) => {
  if (process.env.EXPO_NO_SENTRY_PLUGIN !== '1') {
    return config;
  }
  const plugins = (config.plugins || []).filter((p) => {
    if (p === '@sentry/react-native') return false;
    if (Array.isArray(p) && p[0] === '@sentry/react-native') return false;
    return true;
  });
  return { ...config, plugins };
};
