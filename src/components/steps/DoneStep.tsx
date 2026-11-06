"use client";

import type { StepProps } from "../CaseRoom";
import { formatMoney } from "@/lib/money";
import HoldSummary from "../HoldSummary";
import { Panel } from "../ui";

export default function DoneStep({ view, token }: StepProps) {
  const c = view.case;
  const payment = c.payment;

  if (c.status === "settled" && payment) {
    const released = Math.max(0, payment.authorizedAmount - payment.capturedAmount);
    return (
      <Panel title="Settled" tone="go">
        <p className="condensed text-5xl font-bold">{formatMoney(payment.capturedAmount, c.currency)} paid</p>
        <p className="mt-2">
          {formatMoney(released, c.currency)} of the hold was released. Both drivers have the same record of the photos,
          the agreement and the payment.
        </p>
        <div className="mt-4">
          <HoldSummary payment={payment} currency={c.currency} />
        </div>
        <a href={`/c/${c.id}/receipt?t=${token}`} className="mt-5 inline-block font-semibold underline underline-offset-4">
          Open the settlement receipt
        </a>
      </Panel>
    );
  }

  return (
    <Panel title="Case closed">
      <p>{payment ? "Nothing was charged. The whole hold was released." : "This settlement was closed before any money was held."}</p>
      <a href={`/c/${c.id}/receipt?t=${token}`} className="mt-4 inline-block font-semibold underline underline-offset-4">
        Open the case record
      </a>
    </Panel>
  );
}
