/** Normalize iOS/autofill punctuation so server location validation matches the client. */
export function normalizeLocationInput(location: string): string {
  return location
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\uFF0C\u201A\u201E]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns true if trimmed value has at least one comma with non-empty city and state. */
export function hasCityAndState(location: string): boolean {
  const t = normalizeLocationInput(location);
  const commaIdx = t.indexOf(",");
  if (commaIdx === -1) return false;
  const city = t.slice(0, commaIdx).trim();
  const state = t.slice(commaIdx + 1).trim();
  return city.length > 0 && state.length > 0;
}

/**
 * When the user types a space after the city (no comma yet), replace with ", "
 * so they get "City, " and can type state.
 */
export function handleLocationChange(newValue: string, setValue: (v: string) => void): void {
  if (newValue.endsWith(" ") && !newValue.slice(0, -1).includes(",")) {
    setValue(newValue.slice(0, -1).trimEnd() + ", ");
  } else {
    setValue(newValue);
  }
}
