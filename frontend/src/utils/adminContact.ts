/** Phone for admin directory (always from phone_number, not settings email). */
export function adminPhoneLabel(phone: string | null | undefined): string {
  const p = phone?.trim();
  return p || '—';
}

/** Account email when set in settings; ignores phone fallback used in legacy `email` field. */
export function adminEmailLabel(
  email: string | null | undefined,
  phone: string | null | undefined,
): string {
  const e = email?.trim();
  if (!e || e === 'N/A') return '—';
  if (phone && e === phone.trim()) return '—';
  if (!e.includes('@')) return '—';
  return e;
}
