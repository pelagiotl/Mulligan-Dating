export const MATCH_POOL_CONNECT = 'connect';
export const MATCH_POOL_SOBER_CIRCLE = 'sober_circle';
export const MATCH_POOL_GOLF_DATE = 'golf_date';

export type MatchPool =
  | typeof MATCH_POOL_CONNECT
  | typeof MATCH_POOL_SOBER_CIRCLE
  | typeof MATCH_POOL_GOLF_DATE;

/**
 * SQL fragment — append after matches alias is in scope (e.g. `FROM matches m`).
 * Main / Play (golf) pools share the intentional dating slot (legacy connect + golf_date).
 * Sober Circle stays isolated.
 */
export function sqlMatchesInPool(soberPool: boolean, matchAlias = 'm'): string {
  if (soberPool) {
    return ` AND COALESCE(${matchAlias}.connected_via, '${MATCH_POOL_CONNECT}') = '${MATCH_POOL_SOBER_CIRCLE}'`;
  }
  return ` AND COALESCE(${matchAlias}.connected_via, '${MATCH_POOL_CONNECT}') IN ('${MATCH_POOL_CONNECT}', '${MATCH_POOL_GOLF_DATE}')`;
}

export function normalizeConnectSource(source: unknown): MatchPool {
  if (source === MATCH_POOL_SOBER_CIRCLE) return MATCH_POOL_SOBER_CIRCLE;
  if (source === MATCH_POOL_GOLF_DATE) return MATCH_POOL_GOLF_DATE;
  return MATCH_POOL_CONNECT;
}

export function formatConnectedVia(value: unknown): MatchPool {
  if (value === MATCH_POOL_SOBER_CIRCLE) return MATCH_POOL_SOBER_CIRCLE;
  if (value === MATCH_POOL_GOLF_DATE) return MATCH_POOL_GOLF_DATE;
  return MATCH_POOL_CONNECT;
}
