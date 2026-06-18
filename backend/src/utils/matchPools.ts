export const MATCH_POOL_CONNECT = 'connect';
export const MATCH_POOL_SOBER_CIRCLE = 'sober_circle';

/** SQL fragment — append after matches alias is in scope (e.g. `FROM matches m`). */
export function sqlMatchesInPool(soberPool: boolean, matchAlias = 'm'): string {
  const via = soberPool ? MATCH_POOL_SOBER_CIRCLE : MATCH_POOL_CONNECT;
  return ` AND COALESCE(${matchAlias}.connected_via, '${MATCH_POOL_CONNECT}') = '${via}'`;
}

export function normalizeConnectSource(source: unknown): typeof MATCH_POOL_CONNECT | typeof MATCH_POOL_SOBER_CIRCLE {
  return source === MATCH_POOL_SOBER_CIRCLE ? MATCH_POOL_SOBER_CIRCLE : MATCH_POOL_CONNECT;
}
