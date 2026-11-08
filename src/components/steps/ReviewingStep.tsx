"use client";

// Step 5: both drivers see the invoice check. The receiver accepts, and the verified
// amount is captured from the hold (the rest is released).

import { useState } from "react";
import type { Party } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import type { StepProps } from "../CaseRoom";
import { caseAction } from "../client-api";
import InvoiceTable from "../InvoiceTable";
import { Button, ErrorText, Panel } from "../ui";

export default function ReviewingStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  let me: Party = c.parties[0];
  let receiver: Party = c.parties[0];
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
    if (p.role === "receiver") receiver = p;
  }
  const check = c.invoiceCheck;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!check || !c.payment) return null;

  const releasedAmount = Math.max(0, c.payment.authorizedAmount - check.approvedAmount);

  async function toggleLine(lineIndex: number, approved: boolean) {
    setError("");
    try {
      await caseAction(c.id, token, "approveLine", { lineIndex, approved });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function act(action: "accept" | "rejectCheck") {
    setBusy(true);
    setError("");
    try {
      await caseAction(c.id, token, action);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Panel title="Invoice checked against the scene">
      {c.invoicePhotoId && (
        <a href={`/api/cases/${c.id}/photos/${c.invoicePhotoId}?t=${token}`} target="_blank" className="mb-3 inline-block font-semibold underline underline-offset-4">
          View the uploaded invoice
        </a>
      )}
      <InvoiceTable
        check={check}
        currency={c.currency}
        cap={Math.min(c.capAmount, c.payment.authorizedAmount)}
        onToggleLine={me.role === "payer" ? toggleLine : undefined}
      />
      {check.mock && <p className="mt-2 text-sm text-asphalt-soft">Sample check (practice mode).</p>}

      <div className="mt-5 rounded-md bg-concrete p-4">
        {me.role === "receiver" ? (
          <>
            <p>
              Accepting charges {formatMoney(check.approvedAmount, c.currency)} from the hold for your repair and releases{" "}
              {formatMoney(releasedAmount, c.currency)} back to the other driver. This completes the settlement.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => act("accept")} disabled={busy}>
                {busy ? "Paying…" : `Accept and get paid ${formatMoney(check.approvedAmount, c.currency)}`}
              </Button>
              <Button kind="secondary" onClick={() => act("rejectCheck")} disabled={busy}>
                Upload a clearer invoice
              </Button>
            </div>
          </>
        ) : (
          <p>
            {receiver.name} is reviewing this result. When they accept, {formatMoney(check.approvedAmount, c.currency)} is
            charged from your hold and {formatMoney(releasedAmount, c.currency)} is released. If you think a crossed-out
            line is fair, you can choose to pay it.
          </p>
        )}
      </div>
      <ErrorText message={error} />
    </Panel>
  );
}
