import https from "node:https";
import { URL } from "node:url";

/** Hostnames Apple may return as `validationURL` for merchant session (strict allowlist). */
const ALLOWED_VALIDATION_HOSTNAMES = new Set([
  "apple-pay-gateway.apple.com",
  "apple-pay-gateway-cert.apple.com",
  "cn-apple-pay-gateway.apple.com",
  "cn-apple-pay-gateway-cert.apple.com",
]);

function envMerchantId(): string | undefined {
  return process.env.APPLE_PAY_MERCHANT_ID?.trim();
}

function normalizePem(raw: string): string {
  const t = raw.trim();
  if (t.includes("\\n")) return t.replace(/\\n/g, "\n");
  return t;
}

function envIdentityCert(): string | undefined {
  const c = process.env.APPLE_PAY_IDENTITY_CERT_PEM?.trim();
  return c ? normalizePem(c) : undefined;
}

function envIdentityKey(): string | undefined {
  const k = process.env.APPLE_PAY_IDENTITY_KEY_PEM?.trim();
  return k ? normalizePem(k) : undefined;
}

function initiativeContextHostname(): string | undefined {
  const override = process.env.APPLE_PAY_INITIATIVE_CONTEXT?.trim();
  if (override) return override.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
  const origin =
    process.env.FRONTEND_URL?.trim() ||
    process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();
  if (!origin) return undefined;
  try {
    const host = new URL(origin.startsWith("http") ? origin : `https://${origin}`).hostname;
    return host || undefined;
  } catch {
    return undefined;
  }
}

export function isApplePayWebConfigured(): boolean {
  return !!(
    envMerchantId() &&
    envIdentityCert() &&
    envIdentityKey() &&
    initiativeContextHostname()
  );
}

export function applePayWebMerchantId(): string | undefined {
  return envMerchantId();
}

export function applePayDisplayName(): string {
  return process.env.APPLE_PAY_DISPLAY_NAME?.trim() || "Mulligan";
}

export function isAllowedApplePayValidationUrl(validationURL: string): boolean {
  try {
    const u = new URL(validationURL);
    if (u.protocol !== "https:") return false;
    return ALLOWED_VALIDATION_HOSTNAMES.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Request merchant session from Apple (mTLS with Merchant Identity cert).
 * See: https://developer.apple.com/documentation/apple_pay_on_the_web/apple_pay_js_api/requesting_an_apple_pay_payment_session
 */
export async function requestApplePayMerchantSession(validationURL: string): Promise<unknown> {
  const merchantIdentifier = envMerchantId();
  const certPem = envIdentityCert();
  const keyPem = envIdentityKey();
  const initiativeContext = initiativeContextHostname();
  if (!merchantIdentifier || !certPem || !keyPem || !initiativeContext) {
    throw new Error("Apple Pay web is not configured on this server");
  }
  if (!isAllowedApplePayValidationUrl(validationURL)) {
    throw new Error("Unsupported validation URL");
  }

  const url = new URL(validationURL);
  const body = JSON.stringify({
    merchantIdentifier,
    displayName: applePayDisplayName(),
    initiative: "web",
    initiativeContext,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
        cert: certPem,
        key: keyPem,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Apple merchant session HTTP ${res.statusCode}: ${text.slice(0, 400)}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as unknown);
          } catch {
            reject(new Error("Apple returned non-JSON merchant session"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
