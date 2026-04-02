import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

let configureOnce: Promise<boolean> | null = null;

function revenueCatApiKey(): string | undefined {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return undefined;
  const isExpoGo = Constants.appOwnership === 'expo';
  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const fallbackKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  const testStoreKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY;
  if (isExpoGo) return testStoreKey;
  return Platform.OS === 'ios' ? iosKey || fallbackKey : androidKey || fallbackKey;
}

/**
 * Configure RevenueCat once and await before getOfferings / purchasePackage.
 * Avoids races where review (or fast taps) hit IAP before configure() finishes.
 */
export function ensurePurchasesConfigured(): Promise<boolean> {
  if (configureOnce) return configureOnce;
  configureOnce = (async () => {
    const apiKey = revenueCatApiKey();
    if (!apiKey) {
      if (__DEV__) {
        console.warn('[RevenueCat] No API key; IAP disabled until EXPO_PUBLIC_REVENUECAT_* is set.');
      }
      return false;
    }
    try {
      const result = Purchases.configure({ apiKey }) as Promise<void> | void;
      if (result && typeof (result as Promise<void>).then === 'function') {
        await (result as Promise<void>);
      }
      if (__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
      try {
        await Purchases.getCustomerInfo();
      } catch {
        /* native bridge warm-up; purchase path will retry */
      }
      return true;
    } catch (err) {
      console.warn('[RevenueCat] configure failed:', err);
      configureOnce = null;
      return false;
    }
  })();
  return configureOnce;
}

export function pickCurrentOfferingPackages(offerings: PurchasesOfferings): PurchasesPackage[] {
  const current =
    offerings.current ??
    (offerings as { all?: Record<string, { availablePackages: PurchasesPackage[] }> }).all?.['default'] ??
    Object.values(
      (offerings as { all?: Record<string, { availablePackages: PurchasesPackage[] }> }).all ?? {}
    )[0];
  return current?.availablePackages ?? [];
}

export function findRevenueCatPackage(
  packages: PurchasesPackage[],
  productId: string
): PurchasesPackage | undefined {
  return packages.find((p) => {
    const id = p.product.identifier;
    return (
      id === productId ||
      id?.toLowerCase() === productId?.toLowerCase() ||
      (typeof id === 'string' && productId && id.endsWith(productId))
    );
  });
}

/** Fresh StoreKit package for product id (avoids stale ref map during review). */
export async function getRevenueCatPackageForProductId(
  productId: string
): Promise<PurchasesPackage | null> {
  if (!(await ensurePurchasesConfigured())) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const pkgs = pickCurrentOfferingPackages(offerings);
    return findRevenueCatPackage(pkgs, productId) ?? null;
  } catch (err) {
    console.warn('[RevenueCat] getOfferings failed:', err);
    return null;
  }
}

export function formatPurchasesError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong. Please try again.';
  const e = err as Record<string, unknown>;
  if (e.userCancelled) return '';
  const parts = [
    typeof e.readableErrorCode === 'string' ? e.readableErrorCode : null,
    typeof e.code === 'string' && e.code !== e.readableErrorCode ? String(e.code) : null,
    typeof e.message === 'string' ? e.message : null,
  ].filter(Boolean) as string[];
  return parts.join(' — ') || 'Something went wrong. Please try again.';
}
