import { Platform } from 'react-native';
import { api } from './api';

type GooglePayConfig = {
  enabled: boolean;
  merchantId: string;
  gateway: string;
  gatewayMerchantId: string;
};

type TokenPackage = {
  id: number;
  tokens: number;
  price: number;
};

type GooglePayPurchaseResult = {
  ok?: boolean;
  already_processed?: boolean;
  tokens_granted?: number;
  capped?: boolean;
};

function centsToUsdString(amount: number): string {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return normalized.toFixed(2);
}

function extractGooglePayToken(paymentResponse: unknown): string | null {
  const res = (paymentResponse ?? {}) as {
    details?: Record<string, unknown>;
    methodData?: Record<string, unknown>;
  };
  const d = (res.details ?? res.methodData ?? {}) as Record<string, unknown>;
  const fromMethodData = (d.paymentMethodData as { tokenizationData?: { token?: string } } | undefined)?.tokenizationData?.token;
  if (fromMethodData) return fromMethodData;
  const fromTokenization = (d.tokenizationData as { token?: string } | undefined)?.token;
  if (fromTokenization) return fromTokenization;
  const fromPaymentToken = (d.paymentMethodToken as { token?: string } | undefined)?.token;
  if (fromPaymentToken) return fromPaymentToken;
  const direct = d.token;
  return typeof direct === 'string' ? direct : null;
}

async function getGooglePayModule(): Promise<{ PaymentRequest: new (...args: any[]) => any }> {
  try {
    return require('@google/react-native-make-payment');
  } catch {
    throw new Error('Google Pay module is not installed. Run: npm install @google/react-native-make-payment');
  }
}

export async function fetchGooglePayConfig(): Promise<GooglePayConfig> {
  if (Platform.OS !== 'android') {
    throw new Error('Google Pay is only available on Android.');
  }
  return api.get<GooglePayConfig>('/payments/google-pay/config', false);
}

export async function purchaseTokensWithGooglePay(pkg: TokenPackage): Promise<GooglePayPurchaseResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Google Pay is only available on Android.');
  }

  const config = await fetchGooglePayConfig();
  if (!config.enabled || !config.gatewayMerchantId || !config.merchantId) {
    throw new Error('Google Pay is not fully configured on the server.');
  }

  const { PaymentRequest } = await getGooglePayModule();

  const googlePayRequest = {
    apiVersion: 2,
    apiVersionMinor: 0,
    merchantInfo: {
      merchantName: 'Mulligan Dating',
      merchantId: config.merchantId,
    },
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPrice: centsToUsdString(pkg.price),
      currencyCode: 'USD',
      countryCode: 'US',
    },
    allowedPaymentMethods: [
      {
        type: 'CARD',
        parameters: {
          allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
          allowedCardNetworks: ['AMEX', 'DISCOVER', 'JCB', 'MASTERCARD', 'VISA'],
          billingAddressRequired: true,
          billingAddressParameters: { format: 'MIN' },
        },
        tokenizationSpecification: {
          type: 'PAYMENT_GATEWAY',
          parameters: {
            gateway: 'authorizenet',
            gatewayMerchantId: config.gatewayMerchantId,
          },
        },
      },
    ],
  };

  const paymentMethods = [
    {
      supportedMethods: 'google_pay',
      data: googlePayRequest,
    },
  ];
  const paymentDetails = {
    id: `mulligan_tokens_${pkg.id}`,
    total: {
      label: `Mulligan ${pkg.tokens} token${pkg.tokens > 1 ? 's' : ''}`,
      amount: {
        currency: 'USD',
        value: centsToUsdString(pkg.price),
      },
    },
  };

  const request = new PaymentRequest(paymentMethods, paymentDetails);
  const canMakePayment = await request.canMakePayment();
  if (!canMakePayment) {
    throw new Error('Google Pay is not available on this device/account.');
  }

  const response = await request.show();
  try {
    const token = extractGooglePayToken(response);
    if (!token) {
      throw new Error('Google Pay did not return a payment token.');
    }

    const result = await api.post<GooglePayPurchaseResult>('/payments/google-pay/complete', {
      packageId: pkg.id,
      googlePayToken: token,
    });
    try {
      if (typeof response.complete === 'function') await response.complete('success');
    } catch {
      // no-op
    }
    return result;
  } catch (error) {
    try {
      if (typeof response.complete === 'function') await response.complete('fail');
    } catch {
      // no-op
    }
    throw error;
  }
}
