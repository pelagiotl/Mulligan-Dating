/**
 * Dynamic Expo config. `config` is the resolved static config from `app.json`.
 *
 * When EXPO_NO_SENTRY_PLUGIN=1, the @sentry/react-native config plugin is skipped
 * (can slow local `expo start` on some machines). Do not set on EAS production.
 *
 * If `expo start` hangs silently after `env: export` (before "Starting project at"),
 * that is usually native URI scheme resolution — use `npm run start:quick` instead.
 */

/** Must match `app.json` → `expo.extra.eas.projectId` (EAS credentials / Play uploads). */
const EAS_PROJECT_ID = "ffe7d520-859b-4e18-a2d8-10b607bbf90b";

function withEasProjectId(config) {
  const extra =
    config.extra && typeof config.extra === "object" && !Array.isArray(config.extra)
      ? { ...config.extra }
      : {};
  const eas = extra.eas && typeof extra.eas === "object" ? { ...extra.eas } : {};
  return {
    ...config,
    extra: {
      ...extra,
      eas: {
        ...eas,
        projectId: EAS_PROJECT_ID,
      },
    },
  };
}

module.exports = ({ config }) => {
  if (process.env.EXPO_NO_SENTRY_PLUGIN !== "1") {
    return withEasProjectId(config);
  }
  const plugins = (config.plugins || []).filter((p) => {
    if (p === "@sentry/react-native") return false;
    if (Array.isArray(p) && p[0] === "@sentry/react-native") return false;
    return true;
  });
  return withEasProjectId({ ...config, plugins });
};
