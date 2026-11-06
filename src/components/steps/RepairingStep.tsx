"use client";

// Step 4: money is held. The receiver gets the car repaired and uploads the invoice.

import { useRef, useState } from "react";
import type { Party } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import type { StepProps } from "../CaseRoom";
import { caseAction, resizeImage } from "../client-api";
import HoldSummary from "../HoldSummary";
import { Button, ErrorText, Panel } from "../ui";

const HONOR_PERIOD_MS = 3 * 24 * 3600 * 1000;

export default function RepairingStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  let me: Party = c.parties[0];
  let payer: Party = c.parties[0];
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
    if (p.role === "payer") payer = p;
  }
  const payment = c.payment;
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!payment) return null;
  const pastHonorPeriod = Date.now() - new Date(payment.authorizedAt).getTime() > HONOR_PERIOD_MS;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      // invoices need readable text, so keep more resolution
      const dataUrl = await resizeImage(files[0], 2000, 0.88);
      await caseAction(c.id, token, "submitInvoice", { dataUrl });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function extend() {
    setError("");
    try {
      await caseAction(c.id, token, "extendHold");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Panel title="Money is on hold" tone="go">
        <p className="mb-3">
          {payer.name}&apos;s PayPal has reserved {formatMoney(payment.authorizedAmount, c.currency)}. Nothing has been
          charged.
        </p>
        <HoldSummary payment={payment} currency={c.currency} />
        {pastHonorPeriod && (
          <div className="mt-4">
            <Button kind="secondary" onClick={extend}>
              Refresh the hold
            </Button>
            <p className="mt-1 text-sm text-asphalt-soft">Holds are most reliable in their first 3 days. Refreshing keeps the money reserved while the repair takes longer.</p>
          </div>
        )}
      </Panel>

      {me.role === "receiver" ? (
        <Panel title="Upload the repair invoice">
          <p>
            Get the car repaired, then upload a clear photo or screenshot of the itemised invoice. Each line is checked
            against the scene photos, and you see the result before anything is paid.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
          <div className={`mt-4 ${busy ? "scanning rounded-md" : ""}`}>
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? "Checking every line of the invoice…" : "Upload invoice"}
            </Button>
          </div>
          <ErrorText message={error} />
        </Panel>
      ) : (
        <Panel title="Waiting for the repair invoice">
          <p>
            When the repair is done, the other driver uploads the invoice. Only lines that match the damage recorded at
            the scene can be charged, and never more than the cap.
          </p>
          <ErrorText message={error} />
        </Panel>
      )}
    </>
  );
}
