// PayPal REST calls used by Scuff (sandbox by default).
//
// The whole product rests on PayPal's authorize-then-capture model:
//   1. createHoldOrder   — Orders v2 with intent AUTHORIZE, payee = the receiver's PayPal email
//   2. authorizeOrder    — after the payer approves, funds are held (up to 29 days)
//   3. captureVerified   — capture ONLY the AI-verified amount with final_capture = true,
//                          which releases the rest of the hold
//   4. voidHold          — release everything (verified amount was 0)
//   5. reauthorizeHold   — extend the hold after the 3-day honor period if repairs take longer
//
// Without PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET the module runs in "mock" mode so the flow
// can still be clicked through locally.

import { toPayPalValue } from "./money";

const BASE_URL =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export function paypalMode(): "sandbox" | "mock" {
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox" : "mock";
}

export function paypalClientId(): string {
  return process.env.PAYPAL_CLIENT_ID || "";
}

let cachedToken = "";
let cachedTokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    throw new Error(`PayPal auth failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = json.access_token;
  // refresh one minute early
  cachedTokenExpiry = Date.now() + (json.expires_in - 60) * 1000;
  return cachedToken;
}

async function paypalRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  requestId?: string
): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (requestId) {
    // makes retries safe: PayPal returns the original result instead of charging twice
    headers["PayPal-Request-Id"] = requestId;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return {};
  }
  const text = await response.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    const debugId = response.headers.get("paypal-debug-id") || "";
    throw new Error(`PayPal ${method} ${path} failed (${response.status}, debug ${debugId}): ${text}`);
  }
  return json;
}

function fakeId(prefix: string): string {
  return `${prefix}-MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// ---------- 1. create the order (intent AUTHORIZE) ----------

export async function createHoldOrder(input: {
  caseId: string;
  caseCode: string;
  amount: number;
  currency: string;
  receiverEmail: string;
}): Promise<string> {
  if (paypalMode() === "mock") {
    return fakeId("ORDER");
  }

  const purchaseUnit: Record<string, unknown> = {
    reference_id: input.caseId,
    custom_id: input.caseId,
    description: `Scuff settlement hold — case ${input.caseCode} (only the verified repair amount will be charged)`,
    soft_descriptor: "SCUFF SETTLE",
    amount: { currency_code: input.currency, value: toPayPalValue(input.amount) },
  };
  if (input.receiverEmail) {
    // money goes straight to the other driver; Scuff never holds it
    purchaseUnit.payee = { email_address: input.receiverEmail };
  }

  const order = await paypalRequest("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [purchaseUnit],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Scuff",
          shipping_preference: "NO_SHIPPING",
          user_action: "CONTINUE",
        },
      },
    },
  });
  return order.id as string;
}

// ---------- 2. authorize after the payer approves ----------

export interface AuthorizationResult {
  authorizationId: string;
  amount: number;
  expiresAt: string;
}

export async function authorizeOrder(orderId: string, fallbackAmount: number): Promise<AuthorizationResult> {
  if (paypalMode() === "mock") {
    return {
      authorizationId: fakeId("AUTH"),
      amount: fallbackAmount,
      expiresAt: new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString(),
    };
  }

  const result = await paypalRequest("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `${orderId}-authorize`);
  const units = result.purchase_units as {
    payments: { authorizations: { id: string; amount: { value: string }; expiration_time: string }[] };
  }[];
  const authorization = units[0].payments.authorizations[0];
  return {
    authorizationId: authorization.id,
    amount: Number(authorization.amount.value),
    expiresAt: authorization.expiration_time,
  };
}

// ---------- 3. capture only the verified amount ----------

export async function captureVerified(input: {
  authorizationId: string;
  amount: number;
  currency: string;
  caseCode: string;
}): Promise<string> {
  if (paypalMode() === "mock") {
    return fakeId("CAPTURE");
  }

  const result = await paypalRequest(
    "POST",
    `/v2/payments/authorizations/${input.authorizationId}/capture`,
    {
      amount: { currency_code: input.currency, value: toPayPalValue(input.amount) },
      // final_capture = true: no further captures, remaining hold is released
      final_capture: true,
      note_to_payer: `Scuff case ${input.caseCode}: verified repair amount. The rest of your hold is released.`,
    },
    `${input.authorizationId}-capture`
  );
  return result.id as string;
}

// ---------- 4. release the whole hold ----------

export async function voidHold(authorizationId: string): Promise<void> {
  if (paypalMode() === "mock") {
    return;
  }
  await paypalRequest("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `${authorizationId}-void`);
}

// ---------- 5. extend the hold (after the 3-day honor period) ----------

export async function reauthorizeHold(authorizationId: string, amount: number, currency: string): Promise<AuthorizationResult> {
  if (paypalMode() === "mock") {
    return {
      authorizationId: fakeId("AUTH"),
      amount,
      expiresAt: new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString(),
    };
  }
  const result = await paypalRequest("POST", `/v2/payments/authorizations/${authorizationId}/reauthorize`, {
    amount: { currency_code: currency, value: toPayPalValue(amount) },
  });
  return {
    authorizationId: result.id as string,
    amount: Number((result.amount as { value: string }).value),
    expiresAt: result.expiration_time as string,
  };
}
