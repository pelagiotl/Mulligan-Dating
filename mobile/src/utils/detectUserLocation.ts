import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { compactCityState } from './locationUtils';

const NOMINATIM_TIMEOUT_MS = 10_000;
const GPS_ATTEMPT_MS = 18_000;
const GEOCODE_TIMEOUT_MS = 8_000;
const IP_GEOCODE_TIMEOUT_MS = 8_000;

const GPS_TIMEOUT_MESSAGE =
  'Could not detect your location. On an emulator, open ⋮ → Location, set a point, and tap Set location. On a phone, turn on Location and try again—or type your city manually.';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function hasValidCoords(loc: Location.LocationObject | null | undefined): loc is Location.LocationObject {
  const lat = loc?.coords?.latitude;
  const lon = loc?.coords?.longitude;
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return false;
  // Ignore null island — common broken emulator default
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
  return true;
}

function formatFromNative(place: Location.LocationGeocodedAddress): string | null {
  const city =
    place.city ||
    place.district ||
    place.subregion ||
    place.name ||
    '';
  const state = place.region || '';
  const country = place.country || '';

  if (
    (country === 'United States' || country === 'USA' || country === 'US' || country === 'Canada') &&
    city &&
    state
  ) {
    return `${city}, ${state}`;
  }
  if (city && country && country !== 'United States' && country !== 'Canada') {
    return `${city}, ${country}`;
  }
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return null;
}

function formatFromNominatim(data: {
  address?: Record<string, string>;
  display_name?: string;
}): string | null {
  const address = data.address || {};
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    '';
  const state =
    address.state ||
    address.region ||
    address.province ||
    (address['ISO3166-2']?.includes('-') ? address['ISO3166-2'].split('-')[1] : '') ||
    '';
  const country = address.country || '';

  if (
    (country === 'United States' || country === 'Canada' || country === 'USA') &&
    city &&
    state
  ) {
    return `${city}, ${state}`;
  }
  if (city && country) return compactCityState(`${city}, ${country}`);
  if (city) return compactCityState(city);
  if (data.display_name) return compactCityState(data.display_name);
  return null;
}

function formatFromIpApi(data: {
  city?: string;
  region?: string;
  region_code?: string;
  country_name?: string;
  country?: string;
}): string | null {
  const city = data.city?.trim();
  const region = (data.region || data.region_code || '').trim();
  const country = (data.country_name || data.country || '').trim();
  if (city && region && (country === 'United States' || country === 'US' || country === 'USA')) {
    return `${city}, ${region}`;
  }
  if (city && region) return `${city}, ${region}`;
  if (city && country) return `${city}, ${country}`;
  return null;
}

async function reverseGeocodeNominatim(latitude: number, longitude: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      {
        headers: { 'User-Agent': 'Mulligan-Dating-App/1.0' },
        signal: controller.signal,
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return formatFromNominatim(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function reverseGeocodeNative(latitude: number, longitude: number): Promise<string | null> {
  const places = await withTimeout(
    Location.reverseGeocodeAsync({ latitude, longitude }),
    GEOCODE_TIMEOUT_MS,
    'Native geocode timed out'
  );
  return places[0] ? formatFromNative(places[0]) : null;
}

function formatFromIpWho(data: {
  success?: boolean;
  city?: string;
  region?: string;
  country?: string;
}): string | null {
  if (data.success === false) return null;
  const city = data.city?.trim();
  const region = data.region?.trim();
  const country = data.country?.trim();
  if (city && region && country === 'United States') return `${city}, ${region}`;
  if (city && region) return `${city}, ${region}`;
  if (city && country) return `${city}, ${country}`;
  return null;
}

/** Approximate city/state from network IP when GPS is unavailable (common on emulators). */
async function geocodeFromApproximateNetwork(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IP_GEOCODE_TIMEOUT_MS);
  try {
    const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    if (response.ok) {
      const data = await response.json();
      const formatted = formatFromIpApi(data);
      if (formatted) return formatted;
    }
  } catch {
    // try backup
  } finally {
    clearTimeout(timeout);
  }

  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => controller2.abort(), IP_GEOCODE_TIMEOUT_MS);
  try {
    const response = await fetch('https://ipwho.is/', { signal: controller2.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return formatFromIpWho(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout2);
  }
}

async function tryEnableAndroidNetworkLocation(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await withTimeout(
      Location.enableNetworkProviderAsync(),
      2500,
      'Network location prompt skipped'
    );
  } catch {
    // Continue without network provider
  }
}

/** Race GPS watch + getCurrentPosition; cancel everything when one wins or time is up. */
function acquireDevicePosition(timeoutMs: number): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    const cleanups: Array<() => void> = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanups.forEach((c) => c());
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(GPS_TIMEOUT_MESSAGE)));
    }, timeoutMs);

    const positionOptions: Location.LocationOptions = {
      accuracy: Location.Accuracy.Lowest,
      mayShowUserSettingsDialog: false,
    };

    Location.getCurrentPositionAsync(positionOptions)
      .then((loc) => {
        if (hasValidCoords(loc)) finish(() => resolve(loc));
      })
      .catch(() => {});

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Lowest,
        distanceInterval: 0,
        timeInterval: 1000,
      },
      (loc) => {
        if (hasValidCoords(loc)) finish(() => resolve(loc));
      }
    )
      .then((sub) => {
        cleanups.push(() => sub.remove());
      })
      .catch(() => {});

    if (Platform.OS === 'android') {
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
        mayShowUserSettingsDialog: false,
      })
        .then((loc) => {
          if (hasValidCoords(loc)) finish(() => resolve(loc));
        })
        .catch(() => {});
    }
  });
}

async function getDevicePosition(): Promise<Location.LocationObject> {
  const cachedLoose = await Location.getLastKnownPositionAsync({ maxAge: 600_000 });
  if (hasValidCoords(cachedLoose)) return cachedLoose;

  const cachedAny = await Location.getLastKnownPositionAsync();
  if (hasValidCoords(cachedAny)) return cachedAny;

  await tryEnableAndroidNetworkLocation();

  return acquireDevicePosition(GPS_ATTEMPT_MS);
}

async function resolveCityState(latitude: number, longitude: number): Promise<string> {
  const nominatim = await reverseGeocodeNominatim(latitude, longitude);
  if (nominatim) return nominatim;

  try {
    const native = await reverseGeocodeNative(latitude, longitude);
    if (native) return native;
  } catch {
    // fall through
  }

  throw new Error('Could not determine your city and state. Please enter them manually.');
}

/** Request GPS + reverse geocode; returns "City, State" or throws. */
export async function detectUserLocation(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to detect your location.');
  }

  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    throw new Error(
      'Location services are turned off. Enable them in device settings, or on an emulator set a mock location (⋮ → Location).'
    );
  }

  try {
    const locationData = await getDevicePosition();
    const { latitude, longitude } = locationData.coords;
    const resolved = await resolveCityState(latitude, longitude);
    return compactCityState(resolved);
  } catch (gpsError) {
    const approximate = await geocodeFromApproximateNetwork();
    if (approximate) return compactCityState(approximate);
    if (gpsError instanceof Error) throw gpsError;
    throw new Error(GPS_TIMEOUT_MESSAGE);
  }
}
