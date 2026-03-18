/**
 * Location input helpers: require "City, State" and auto-insert comma after city.
 */

/** Returns true if trimmed value has at least one comma with non-empty city and state. */
export function hasCityAndState(location: string): boolean {
  const t = location.trim();
  const commaIdx = t.indexOf(',');
  if (commaIdx === -1) return false;
  const city = t.slice(0, commaIdx).trim();
  const state = t.slice(commaIdx + 1).trim();
  return city.length > 0 && state.length > 0;
}

/**
 * Use as onChangeText for location fields. When the user types a space after the city
 * (and there's no comma yet), replaces that space with ", " so they get "City, " and can type state.
 */
export function handleLocationChange(newValue: string, setValue: (v: string) => void): void {
  if (newValue.endsWith(' ') && !newValue.slice(0, -1).includes(',')) {
    setValue(newValue.slice(0, -1).trimEnd() + ', ');
  } else {
    setValue(newValue);
  }
}
