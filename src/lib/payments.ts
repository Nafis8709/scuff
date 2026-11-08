// One place that decides which payment provider is used, so the business rules in
// cases.ts do not care whether money is held by Braintree, PayPal Orders, or simulated.
//
// Order of preference: Braintree (if configured) → PayPal REST (if configured) → mock.

import * as bt from "./braintree";
import * as paypal from "./paypal";

export type Provider = "braintree" | "paypal" | "mock";

export function activeProvider(): Provider {
  if (bt.braintreeConfigured()) return "braintree";
  if (paypal.paypalMode() === "sandbox") return "paypal";
  return "mock";
}

export interface Hold {
  provider: Provider;
  orderId: string; // PayPal only
  authorizationId: string; // PayPal authorization id or Braintree transaction id
  amount: number;
  expiresAt: string;
  paymentMethodToken: string; // Braintree vault token, used to renew the hold
  description: string;
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

function fakeId(prefix: string): string {
  return `${prefix}-MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// Braintree needs a client token so the browser can collect a card / PayPal / Venmo nonce.
export async function clientToken(): Promise<string> {
  if (activeProvider() !== "braintree") return "";
  return bt.createClientToken();
}

// PayPal Orders needs an order created on the server before the buyer approves it.
export async function createPayPalOrder(input: {
  caseId: string;
  caseCode: string;
  amount: number;
  currency: string;
  receiverEmail: string;
}): Promise<string> {
  return paypal.createHoldOrder(input);
}

export async function placeHold(input: {
  amount: number;
  currency: string;
  caseCode: string;
  nonce: string;
  orderId: string;
}): Promise<Hold> {
  const provider = activeProvider();

  if (provider === "braintree") {
    if (!input.nonce) throw new Error("Missing payment method");
    const hold = await bt.authorizeHold({ nonce: input.nonce, amount: input.amount, caseCode: input.caseCode });
    return {
      provider,
      orderId: "",
      authorizationId: hold.transactionId,
      amount: hold.amount,
      expiresAt: hold.expiresAt,
      paymentMethodToken: hold.paymentMethodToken,
      description: hold.description,
    };
  }

  if (provider === "paypal") {
    if (!input.orderId) throw new Error("Missing PayPal order");
    const auth = await paypal.authorizeOrder(input.orderId, input.amount);
    return {
      provider,
      orderId: input.orderId,
      authorizationId: auth.authorizationId,
      amount: auth.amount,
      expiresAt: auth.expiresAt,
      paymentMethodToken: "",
      description: "PayPal account",
    };
  }

  return {
    provider,
    orderId: "",
    authorizationId: fakeId("AUTH"),
    amount: input.amount,
    expiresAt: inDays(7),
    paymentMethodToken: "",
    description: "Simulated card",
  };
}

// Charge only the verified amount; the rest of the hold is released.
export async function captureVerified(input: {
  provider: Provider;
  authorizationId: string;
  amount: number;
  currency: string;
  caseCode: string;
}): Promise<string> {
  if (input.provider === "braintree") {
    return bt.settleVerified(input.authorizationId, input.amount);
  }
  if (input.provider === "paypal") {
    return paypal.captureVerified(input);
  }
  return fakeId("CAPTURE");
}

export async function releaseHold(provider: Provider, authorizationId: string): Promise<void> {
  if (provider === "braintree") return bt.voidHold(authorizationId);
  if (provider === "paypal") return paypal.voidHold(authorizationId);
}

// Keep the money reserved while a repair takes longer than the authorization lasts.
export async function renewHold(input: {
  provider: Provider;
  authorizationId: string;
  paymentMethodToken: string;
  amount: number;
  currency: string;
  caseCode: string;
}): Promise<{ authorizationId: string; expiresAt: string }> {
  if (input.provider === "braintree") {
    if (!input.paymentMethodToken) throw new Error("This payment method cannot be renewed");
    const fresh = await bt.authorizeHold({
      paymentMethodToken: input.paymentMethodToken,
      amount: input.amount,
      caseCode: input.caseCode,
    });
    await bt.voidHold(input.authorizationId);
    return { authorizationId: fresh.transactionId, expiresAt: fresh.expiresAt };
  }
  if (input.provider === "paypal") {
    const auth = await paypal.reauthorizeHold(input.authorizationId, input.amount, input.currency);
    return { authorizationId: auth.authorizationId, expiresAt: auth.expiresAt };
  }
  return { authorizationId: fakeId("AUTH"), expiresAt: inDays(7) };
}
