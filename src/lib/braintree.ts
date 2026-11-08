// Braintree (a PayPal service) — the default payment provider.
// Works for builders in countries where a PayPal account can't be opened,
// and judges can test it with sandbox test cards.
//
// Same authorize-then-capture idea as the PayPal Orders flow:
//   1. authorizeHold   — transaction.sale WITHOUT submitForSettlement = an authorization (hold)
//                        The payment method is vaulted so the hold can be renewed later.
//   2. settleVerified  — transaction.submitForSettlement(id, smallerAmount): only the verified
//                        amount is charged, the rest of the authorization is released
//   3. voidHold        — transaction.void(id): release everything
//   4. renewHold       — new authorization on the vaulted method, then void the old one

import braintree from "braintree";
import { toPayPalValue } from "./money";

export function braintreeConfigured(): boolean {
  return Boolean(
    process.env.BRAINTREE_MERCHANT_ID && process.env.BRAINTREE_PUBLIC_KEY && process.env.BRAINTREE_PRIVATE_KEY
  );
}

let gateway: braintree.BraintreeGateway | null = null;

function getGateway(): braintree.BraintreeGateway {
  if (!gateway) {
    gateway = new braintree.BraintreeGateway({
      environment:
        process.env.BRAINTREE_ENV === "production" ? braintree.Environment.Production : braintree.Environment.Sandbox,
      merchantId: process.env.BRAINTREE_MERCHANT_ID || "",
      publicKey: process.env.BRAINTREE_PUBLIC_KEY || "",
      privateKey: process.env.BRAINTREE_PRIVATE_KEY || "",
    });
  }
  return gateway;
}

export async function createClientToken(): Promise<string> {
  const response = await getGateway().clientToken.generate({});
  return response.clientToken;
}

export interface BraintreeHold {
  transactionId: string;
  amount: number;
  expiresAt: string;
  paymentMethodToken: string;
  description: string; // e.g. "Visa ending 1111" or "PayPal account"
}

// Most card authorizations last about 7 days; Braintree tells us the exact time when it can.
function expiryOf(transaction: braintree.Transaction): string {
  const value = (transaction as unknown as { authorizationExpiresAt?: string | Date }).authorizationExpiresAt;
  if (value) {
    return new Date(value).toISOString();
  }
  return new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
}

function describe(transaction: braintree.Transaction): { token: string; description: string } {
  const card = transaction.creditCard;
  if (card && card.token) {
    return { token: card.token, description: `${card.cardType} ending ${card.last4}` };
  }
  const paypalAccount = transaction.paypalAccount as { token?: string; payerEmail?: string } | undefined;
  if (paypalAccount && paypalAccount.token) {
    return { token: paypalAccount.token, description: `PayPal ${paypalAccount.payerEmail || "account"}` };
  }
  return { token: "", description: transaction.paymentInstrumentType || "payment method" };
}

function failureMessage(result: braintree.ValidatedResponse<braintree.Transaction>): string {
  if (result.transaction && result.transaction.processorResponseText) {
    return `Payment declined: ${result.transaction.processorResponseText}`;
  }
  return `Payment failed: ${result.message}`;
}

export async function authorizeHold(input: {
  nonce?: string;
  paymentMethodToken?: string;
  amount: number;
  caseCode: string;
}): Promise<BraintreeHold> {
  const request: braintree.TransactionRequest = {
    amount: toPayPalValue(input.amount),
    orderId: `scuff-${input.caseCode}-${Date.now()}`,
    options: {
      submitForSettlement: false, // authorization only: nothing is charged yet
    },
  };
  if (input.nonce) {
    request.paymentMethodNonce = input.nonce;
    request.options = { ...request.options, storeInVaultOnSuccess: true };
  } else {
    request.paymentMethodToken = input.paymentMethodToken;
  }

  const result = await getGateway().transaction.sale(request);
  if (!result.success) {
    throw new Error(failureMessage(result));
  }
  const transaction = result.transaction;
  const method = describe(transaction);
  return {
    transactionId: transaction.id,
    amount: Number(transaction.amount),
    expiresAt: expiryOf(transaction),
    paymentMethodToken: method.token || input.paymentMethodToken || "",
    description: method.description,
  };
}

export async function settleVerified(transactionId: string, amount: number): Promise<string> {
  // Settling less than the authorized amount is allowed; the remainder is released.
  const result = await getGateway().transaction.submitForSettlement(transactionId, toPayPalValue(amount));
  if (!result.success) {
    throw new Error(failureMessage(result));
  }
  return result.transaction.id;
}

export async function voidHold(transactionId: string): Promise<void> {
  const result = await getGateway().transaction.void(transactionId);
  if (!result.success) {
    throw new Error(failureMessage(result));
  }
}
