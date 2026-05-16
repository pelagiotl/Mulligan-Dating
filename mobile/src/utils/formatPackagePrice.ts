/**
 * Backend GET /payments/packages sets `pricePerToken` to a full phrase like "$1.99 per token".
 * RevenueCat iOS mapping uses "$0.66" (no suffix). UI must not prefix `$` when already present.
 */
export function formatPackagePerTokenLine(pricePerToken: string | undefined | null): string {
  if (!pricePerToken || pricePerToken === '—') return 'Price in app';
  const t = pricePerToken.trim();
  if (t.toLowerCase().includes('per token')) return t;
  const n = t.replace(/^\$+/, '');
  return `$${n} per token`;
}

/** Collapse accidental multiple leading currency symbols from API or concatenation bugs. */
export function normalizePackageFormattedPrice(priceFormatted: string | undefined | null): string {
  if (!priceFormatted || priceFormatted === '—') return priceFormatted || '—';
  return priceFormatted.replace(/^\$\$+/, '$');
}
