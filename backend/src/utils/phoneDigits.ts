/** Normalize phone strings to comparable digit forms (US-focused). */

export function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/** US national 10 digits (strips leading country code 1 when present). */
export function usNational10Digits(phone: string | null | undefined): string | null {
  const d = digitsOnly(phone);
  if (d.length >= 11 && d.startsWith('1')) return d.slice(-10);
  if (d.length === 10) return d.slice(-10);
  return null;
}

/** Display as (541) 555-1234 when 10-digit US; otherwise returns digits with + prefix if longer. */
export function formatPhoneNationalDisplay(phoneNational10: string): string {
  const d = digitsOnly(phoneNational10);
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return d.length > 0 ? `+${d}` : phoneNational10;
}
