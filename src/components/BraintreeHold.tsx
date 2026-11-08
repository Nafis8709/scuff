"use client";

// Braintree Drop-in: collects a card (or PayPal / Venmo when enabled on the merchant account)
// and returns a one-time nonce. The server turns the nonce into an authorization (the hold).

import { useEffect, useRef, useState } from "react";
import type { Dropin } from "braintree-web-drop-in";
import { caseAction } from "./client-api";
import { Button, ErrorText } from "./ui";

export default function BraintreeHold({
  caseId,
  token,
  amountLabel,
  onDone,
}: {
  caseId: string;
  token: string;
  amountLabel: string;
  onDone: () => Promise<void>;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const instance = useRef<Dropin | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function setUp() {
      try {
        const { clientToken } = (await caseAction(caseId, token, "clientToken")) as { clientToken?: string };
        const dropin = (await import("braintree-web-drop-in")).default;
        if (cancelled || !container.current) return;
        instance.current = await dropin.create({
          authorization: clientToken || "",
          container: container.current,
          card: { cardholderName: { required: false } },
        });
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    setUp();
    return () => {
      cancelled = true;
      if (instance.current) {
        instance.current.teardown().catch(() => undefined);
        instance.current = null;
      }
    };
  }, [caseId, token]);

  async function placeHold() {
    if (!instance.current) return;
    setBusy(true);
    setError("");
    try {
      const payload = await instance.current.requestPaymentMethod();
      await caseAction(caseId, token, "confirmHold", { nonce: payload.nonce });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      // a declined card needs a fresh payment method
      instance.current?.clearSelectedPaymentMethod();
    }
    setBusy(false);
  }

  return (
    <div>
      <div ref={container} />
      {!ready && !error && <p className="scanning rounded-md bg-concrete p-3">Loading the secure card form…</p>}
      {ready && (
        <div className="mt-3">
          <Button onClick={placeHold} disabled={busy}>
            {busy ? "Placing the hold…" : `Hold ${amountLabel}`}
          </Button>
        </div>
      )}
      <ErrorText message={error} />
    </div>
  );
}
