/**
 * RevenueCat Web Billing (@revenuecat/purchases-js).
 *
 * Dashboard setup (required before prices/purchases work on web):
 * 1. RevenueCat → Apps & providers → add "Web Billing" app, connect Stripe.
 * 2. Copy the Web Billing public API key (sandbox vs production).
 * 3. Create Web Billing products whose identifiers match backend IAP product IDs
 *    (see backend `IAP_PACKAGES` / `REVENUECAT_PRODUCT_TOKENS`), or extend env mapping.
 * 4. Attach products to an Offering and set it as Current (or set VITE_REVENUECAT_WEB_OFFERING).
 * 5. Ensure the RevenueCat webhook URL still receives purchase events and `app_user_id`
 *    matches your logged-in user id (same as mobile `Purchases.logIn`).
 *
 * Env: VITE_REVENUECAT_WEB_API_KEY=rcb_... (Vite prefix required for client exposure)
 */
import { Purchases, ErrorCode, type Package } from "@revenuecat/purchases-js";

const apiKey = (import.meta.env.VITE_REVENUECAT_WEB_API_KEY as string | undefined)?.trim();

let configured = false;
let lastUserId: string | null = null;

export function isRevenueCatWebConfigured(): boolean {
  return Boolean(apiKey);
}

export async function getRevenueCatPurchases(appUserId: string): Promise<Purchases> {
  if (!apiKey) {
    throw new Error("VITE_REVENUECAT_WEB_API_KEY is not set");
  }
  if (!configured) {
    Purchases.configure({ apiKey, appUserId });
    configured = true;
    lastUserId = appUserId;
    return Purchases.getSharedInstance();
  }
  const instance = Purchases.getSharedInstance();
  if (lastUserId !== appUserId) {
    await instance.identifyUser(appUserId);
    lastUserId = appUserId;
  }
  return instance;
}

/** Map backend productId → RC package from current (or named) offering. */
export async function fetchWebPackagesByProductId(
  appUserId: string
): Promise<Record<string, Package>> {
  const purchases = await getRevenueCatPurchases(appUserId);
  const offeringId = (import.meta.env.VITE_REVENUECAT_WEB_OFFERING as string | undefined)?.trim();
  const offerings = offeringId
    ? await purchases.getOfferings({ offeringIdentifier: offeringId })
    : await purchases.getOfferings();

  const current =
    offerings.current ??
    offerings.all?.["default"] ??
    Object.values(offerings.all ?? {})[0] ??
    null;

  const map: Record<string, Package> = {};
  if (!current?.availablePackages?.length) return map;

  for (const rcPkg of current.availablePackages) {
    const id = rcPkg.webBillingProduct.identifier;
    map[id] = rcPkg;
    if (id.includes(":")) {
      const base = id.split(":")[0]?.trim();
      if (base) map[base] = rcPkg;
    }
  }
  return map;
}

export function matchRcPackage(
  byProductId: Record<string, Package>,
  productId: string | undefined
): Package | null {
  if (!productId) return null;
  if (byProductId[productId]) return byProductId[productId];
  const lower = productId.toLowerCase();
  const hit = Object.keys(byProductId).find((k) => k.toLowerCase() === lower);
  return hit ? byProductId[hit] : null;
}

export function formatPricePerToken(pkg: Package, tokenCount: number): string {
  if (tokenCount <= 0) return "—";
  const micros = pkg.webBillingProduct.price.amountMicros;
  const major = micros / 1_000_000;
  const per = major / tokenCount;
  return `$${per.toFixed(2)}`;
}

export function isUserCancelledPurchase(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "errorCode" in err &&
    (err as { errorCode: ErrorCode }).errorCode === ErrorCode.UserCancelledError
  );
}
