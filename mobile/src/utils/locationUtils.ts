/**
 * Location input helpers: require "City, State" and auto-insert comma after city.
 */

const MAX_CITY_LEN = 36;
const MAX_STATE_LEN = 22;

function trimEndWords(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Shorten any geocode result to "City, State" for inputs and profile cards. */
export function compactCityState(raw: string): string {
  const t = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\uFF0C\u201A\u201E]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';

  const parts = t.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = trimEndWords(parts[0], MAX_CITY_LEN);
    const countryIdx = parts.findIndex((p) =>
      /^(united states|usa|u\.s\.a?|canada)$/i.test(p)
    );
    let statePart = parts[1];
    if (countryIdx >= 2) {
      statePart = parts[countryIdx - 1];
    } else if (parts.length >= 3) {
      statePart = parts[2];
    }
    const state = trimEndWords(statePart, MAX_STATE_LEN);
    if (!city) return state;
    if (!state) return city;
    return `${city}, ${state}`;
  }

  return trimEndWords(t, MAX_CITY_LEN + MAX_STATE_LEN + 2);
}

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
