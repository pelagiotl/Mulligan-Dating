const MAX_CITY_LEN = 36;
const MAX_STATE_LEN = 22;

function trimEndWords(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Shorten geocode strings to "City, State" so inputs and cards fit on all screens. */
export function compactCityState(raw: string): string {
  const t = normalizeLocationInput(raw);
  if (!t) return "";

  // "Gold Hill Oregon" / "Medford OR" (no comma yet) → insert comma before the state.
  if (!t.includes(",")) {
    const stateMatch = t.match(/^(.+?)\s+(or|oregon|ore|ca|california)\.?$/i);
    if (stateMatch) {
      const city = trimEndWords(stateMatch[1].trim(), MAX_CITY_LEN);
      const state = trimEndWords(stateMatch[2].trim(), MAX_STATE_LEN);
      if (city && state) return `${city}, ${state}`;
    }
    return trimEndWords(t, MAX_CITY_LEN + MAX_STATE_LEN + 2);
  }

  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
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

/** Fast local check for known Southern Oregon / nearby service-area cities (mirrors backend). */
function normalizeRegionLocationInput(location: string): string {
  const normalized = normalizeLocationInput(location).toLowerCase();
  if (normalized.includes(",")) return normalized;
  const withoutComma = normalized.match(/^(.+?)\s+(or|oregon|ore)\.?$/i);
  if (withoutComma) {
    return `${withoutComma[1].trim()}, ${withoutComma[2]}`;
  }
  return normalized;
}

const SOUTHERN_OREGON_CITY_PATTERNS: RegExp[] = [
  /\bmedford\b/,
  /\bashland\b/,
  /\bcentral point\b/,
  /\beagle point\b/,
  /\bjacksonville\b/,
  /\bwhite city\b/,
  /\bphoenix\b/,
  /\btalent\b/,
  /\bgrants pass\b/,
  /\bcave junction\b/,
  /\brogue river\b/,
  /\bgold hill\b/,
  /\bklamath falls\b/,
  /\bbrookings\b/,
  /\bcrescent city\b/,
  /\bmerlin\b/,
  /\bwimer\b/,
  /\bshady cove\b/,
  /\btrail\b/,
  /\bbutte falls\b/,
  /\bprospect\b/,
  /\bwilliams\b/,
  /\bapplegate\b/,
  /\bselma\b/,
  /\bwolf creek\b/,
];

export function isLikelyInSouthernOregonByText(location: string | null | undefined): boolean {
  if (!location?.trim()) return false;
  const normalized = normalizeRegionLocationInput(location);

  const hasRegionalCity = SOUTHERN_OREGON_CITY_PATTERNS.some((re) => re.test(normalized));
  const hasOregonMarker = /\b(or|oregon)\b/.test(normalized);
  const hasCountyMarker = /\b(jackson county|josephine county)\b/.test(normalized);
  const hasNorthernCaliforniaMarker = /\b(ca|california)\b/.test(normalized);

  if (hasCountyMarker) return true;
  if (hasRegionalCity && hasOregonMarker) return true;
  if (hasRegionalCity && hasNorthernCaliforniaMarker && /\b(crescent city|brookings)\b/.test(normalized)) {
    return true;
  }
  return hasRegionalCity && !/\b(new jersey|ma|massachusetts)\b/.test(normalized);
}

/**
 * Spaces are kept so multi-word cities (Gold Hill, Central Point, etc.) can be typed.
 * Comma is typed by the user (or added on blur/save via compactCityState when a trailing state is present).
 */
export function handleLocationChange(newValue: string, setValue: (v: string) => void): void {
  setValue(newValue);
}
