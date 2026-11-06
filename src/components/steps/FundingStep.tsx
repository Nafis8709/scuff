"use client";

// Step 3: the payer places a PayPal authorization hold for the cap.
// Nothing is charged here: PayPal only reserves the money (intent AUTHORIZE).

import { useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { Party } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import type { StepProps } from "../CaseRoom";
import { caseAction } from "../client-api";
import { Button, ErrorText, Panel } from "../ui";

export default function FundingStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  let me: Party = c.parties[0];
  let receiver: Party = c.parties[0];
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
    if (p.role === "receiver") receiver = p;
  }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (me.role !== "payer") {
    return (
      <Panel title="Waiting for the hold">
        <p>
          Both of you signed. The other driver is now placing a PayPal hold of{" "}
          <strong>{formatMoney(c.capAmount, c.currency)}</strong>. Once it is in place you can go ahead with the repair:
          the money is reserved for you.
        </p>
      </Panel>
    );
  }

  async function createOrder(): Promise<string> {
    setError("");
    const result = await caseAction(c.id, token, "createOrder");
    return result.orderId || "";
  }

  async function approve(orderId: string) {
    setBusy(true);
    try {
      await caseAction(c.id, token, "confirmHold", { orderId });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function mockHold() {
    setBusy(true);
    try {
      const orderId = await createOrder();
      await approve(orderId);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Panel title="Place the hold">
      <p className="condensed text-5xl font-bold">{formatMoney(c.capAmount, c.currency)}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>PayPal reserves this amount. Nothing is charged today.</li>
        <li>Only the part of the repair invoice that matches the scene evidence is charged, straight to {receiver.name}.</li>
        <li>The rest is released automatically. If no invoice arrives, the whole hold expires.</li>
      </ul>

      <div className="mt-5">
        {view.paypalClientId ? (
          <PayPalScriptProvider
            options={{
              clientId: view.paypalClientId,
              intent: "authorize",
              currency: c.currency,
              // the order's payee is the receiver, so the SDK must be told about that merchant
              ...(receiver.paypalEmail ? { merchantId: receiver.paypalEmail } : {}),
            }}
          >
            <PayPalButtons
              style={{ layout: "vertical", label: "pay", shape: "rect" }}
              disabled={busy}
              createOrder={createOrder}
              onApprove={async (data) => {
                await approve(data.orderID);
              }}
              onError={(err) => setError(String(err))}
            />
          </PayPalScriptProvider>
        ) : (
          <Button onClick={mockHold} disabled={busy}>
            {busy ? "Placing hold…" : "Place hold (simulated PayPal)"}
          </Button>
        )}
      </div>
      <ErrorText message={error} />
    </Panel>
  );
}
