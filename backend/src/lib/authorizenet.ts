import crypto from "crypto";

const SANDBOX_API = "https://apitest.authorize.net/xml/v1/request.api";
const PROD_API = "https://api.authorize.net/xml/v1/request.api";

/** API Login ID (short id from the gateway — not the transaction key). */
function envApiLogin(): string | undefined {
  return (
    process.env.AUTHORIZENET_API_LOGIN?.trim() ||
    process.env.AUTHNET_API_LOGIN?.trim() ||
    process.env.authnet_api_login?.trim()
  );
}

/** Secret transaction key (longer value — different from API Login). */
function envTransactionKey(): string | undefined {
  return (
    process.env.AUTHORIZENET_TRANSACTION_KEY?.trim() ||
    process.env.AUTHNET_TRANSACTION_KEY?.trim() ||
    process.env.authnet_transaction_key?.trim()
  );
}

function useSandbox(): boolean {
  return (
    process.env.AUTHORIZENET_SANDBOX === "true" ||
    process.env.AUTHNET_SANDBOX === "true" ||
    process.env.authnet_sandbox === "true"
  );
}

export function isAuthorizeNetConfigured(): boolean {
  return !!(envApiLogin() && envTransactionKey());
}

export function getAuthorizeNetHostedFormUrl(): string {
  const hosted =
    process.env.AUTHORIZENET_HOSTED_PAYMENT_URL?.trim() ||
    process.env.AUTHNET_HOSTED_PAYMENT_URL?.trim();
  if (hosted) return hosted;
  return useSandbox()
    ? "https://test.authorize.net/payment/payment"
    : "https://accept.authorize.net/payment/payment";
}

function apiEndpoint(): string {
  const override =
    process.env.AUTHORIZENET_API_URL?.trim() || process.env.AUTHNET_API_URL?.trim();
  if (override) return override;
  return useSandbox() ? SANDBOX_API : PROD_API;
}

function merchantAuth() {
  const name = envApiLogin();
  const transactionKey = envTransactionKey();
  if (!name || !transactionKey) {
    throw new Error("Authorize.Net is not configured (missing API login or transaction key)");
  }
  return { name, transactionKey };
}

export async function authorizeNetJsonRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = apiEndpoint();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Authorize.Net HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as Record<string, unknown>;
  return json;
}

function firstMessageText(messages: unknown): string | undefined {
  if (!messages || typeof messages !== "object") return undefined;
  const m = messages as { message?: unknown; resultCode?: string };
  const arr = m.message;
  if (Array.isArray(arr) && arr[0] && typeof arr[0] === "object") {
    const row = arr[0] as { text?: string; code?: string };
    return row.text || row.code;
  }
  if (arr && typeof arr === "object" && !Array.isArray(arr)) {
    const row = arr as { text?: string };
    return row.text;
  }
  return undefined;
}

export function assertAuthorizeNetOk(json: Record<string, unknown>, context: string): void {
  const messages = json.messages as Record<string, unknown> | undefined;
  const code =
    messages && typeof messages === "object" ? (messages as { resultCode?: string }).resultCode : undefined;
  if (code !== "Ok") {
    const detail = firstMessageText(messages) || JSON.stringify(messages);
    throw new Error(`${context}: ${detail}`);
  }
}

export async function createHostedPaymentPageToken(params: {
  amountDollars: string;
  invoiceNumber: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  iframeCommunicatorUrl: string;
  customerEmail?: string;
}): Promise<string> {
  const auth = merchantAuth();
  if (params.invoiceNumber.length > 20) {
    throw new Error("invoiceNumber must be at most 20 characters");
  }

  const hostedPaymentReturnOptions = JSON.stringify({
    showReceipt: false,
    url: params.returnUrl,
    urlText: "Continue",
    cancelUrl: params.cancelUrl,
    cancelUrlText: "Cancel",
  });

  const hostedPaymentIFrameCommunicatorUrl = JSON.stringify({
    url: params.iframeCommunicatorUrl,
  });

  const transactionRequest: Record<string, unknown> = {
    transactionType: "authCaptureTransaction",
    amount: params.amountDollars,
    order: {
      invoiceNumber: params.invoiceNumber,
      description: params.description,
    },
  };
  if (params.customerEmail) {
    transactionRequest.customer = { email: params.customerEmail };
  }

  const body = {
    getHostedPaymentPageRequest: {
      merchantAuthentication: auth,
      transactionRequest,
      hostedPaymentSettings: {
        setting: [
          { settingName: "hostedPaymentReturnOptions", settingValue: hostedPaymentReturnOptions },
          { settingName: "hostedPaymentIFrameCommunicatorUrl", settingValue: hostedPaymentIFrameCommunicatorUrl },
          {
            settingName: "hostedPaymentPaymentOptions",
            settingValue: JSON.stringify({
              cardCodeRequired: false,
              showCreditCard: true,
              showBankAccount: false,
            }),
          },
          {
            settingName: "hostedPaymentBillingAddressOptions",
            settingValue: JSON.stringify({ show: false, required: false }),
          },
          {
            settingName: "hostedPaymentShippingAddressOptions",
            settingValue: JSON.stringify({ show: false, required: false }),
          },
          {
            settingName: "hostedPaymentSecurityOptions",
            settingValue: JSON.stringify({ captcha: false }),
          },
        ],
      },
    },
  };

  const json = await authorizeNetJsonRequest(body);
  assertAuthorizeNetOk(json, "getHostedPaymentPage");
  const token = json.token as string | undefined;
  if (!token) {
    throw new Error("getHostedPaymentPage: missing token in response");
  }
  return token;
}

export type TransactionDetails = {
  responseCode: string;
  transId: string;
  transactionStatus?: string;
  authAmount?: string;
  order?: { invoiceNumber?: string };
};

function pickTransaction(json: Record<string, unknown>): Record<string, unknown> | null {
  const root = json.getTransactionDetailsResponse as Record<string, unknown> | undefined;
  if (!root) return null;
  const tx = root.transaction as Record<string, unknown> | undefined;
  return tx ?? null;
}

export async function getTransactionDetails(transId: string): Promise<TransactionDetails> {
  const auth = merchantAuth();
  const body = {
    getTransactionDetailsRequest: {
      merchantAuthentication: auth,
      transId,
    },
  };
  const json = await authorizeNetJsonRequest(body);
  assertAuthorizeNetOk(json, "getTransactionDetails");
  const tx = pickTransaction(json);
  if (!tx) {
    throw new Error("getTransactionDetails: missing transaction");
  }
  const responseCode = String(tx.responseCode ?? "");
  const id = String(tx.transId ?? transId);
  const order = tx.order as { invoiceNumber?: string } | undefined;
  return {
    responseCode,
    transId: id,
    transactionStatus: tx.transactionStatus as string | undefined,
    authAmount: tx.authAmount as string | undefined,
    order: order ? { invoiceNumber: order.invoiceNumber } : undefined,
  };
}

export function newCheckoutInvoiceId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export type ApplePayCreateTransactionResult = {
  transId: string;
  responseCode: string;
  authCode?: string;
};

function firstTransactionMessage(json: Record<string, unknown>): string | undefined {
  const tr = json.transactionResponse as Record<string, unknown> | undefined;
  if (!tr) return undefined;
  const messages = tr.messages as { message?: unknown } | undefined;
  const arr = messages?.message;
  if (Array.isArray(arr) && arr[0] && typeof arr[0] === "object") {
    const row = arr[0] as { text?: string; description?: string };
    return row.text || row.description;
  }
  return undefined;
}

function firstTransactionError(json: Record<string, unknown>): string | undefined {
  const tr = json.transactionResponse as Record<string, unknown> | undefined;
  if (!tr) return undefined;
  const errors = tr.errors as { error?: unknown } | undefined;
  const arr = errors?.error;
  if (Array.isArray(arr) && arr[0] && typeof arr[0] === "object") {
    const row = arr[0] as { errorText?: string; errorCode?: string };
    return row.errorText || row.errorCode;
  }
  return undefined;
}

/**
 * Apple Pay (web or in-app) — opaqueData descriptor per Authorize.Net samples.
 */
export async function createApplePayAuthCaptureTransaction(params: {
  amountDollars: string;
  invoiceNumber: string;
  description: string;
  /** Base64-encoded JSON of Apple Pay `payment.token` (ApplePayPaymentToken). */
  applePayOpaqueDataValueBase64: string;
}): Promise<ApplePayCreateTransactionResult> {
  const auth = merchantAuth();
  if (params.invoiceNumber.length > 20) {
    throw new Error("invoiceNumber must be at most 20 characters");
  }

  const body = {
    createTransactionRequest: {
      merchantAuthentication: auth,
      refId: params.invoiceNumber,
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: params.amountDollars,
        payment: {
          opaqueData: {
            dataDescriptor: "COMMON.APPLE.INAPP.PAYMENT",
            dataValue: params.applePayOpaqueDataValueBase64,
          },
        },
        order: {
          invoiceNumber: params.invoiceNumber,
          description: params.description,
        },
      },
    },
  };

  const json = await authorizeNetJsonRequest(body);
  const topOk = (json.messages as { resultCode?: string } | undefined)?.resultCode === "Ok";
  const tr = json.transactionResponse as Record<string, unknown> | undefined;
  const responseCode = String(tr?.responseCode ?? "");
  const transId = String(tr?.transId ?? "");
  if (topOk && responseCode === "1" && transId) {
    return {
      transId,
      responseCode,
      authCode: tr?.authCode as string | undefined,
    };
  }

  const err =
    firstTransactionError(json) ||
    firstTransactionMessage(json) ||
    (json.messages as { message?: { text?: string }[] })?.message?.[0]?.text ||
    JSON.stringify(tr?.errors ?? tr ?? json);
  throw new Error(`Apple Pay charge failed: ${err}`);
}
