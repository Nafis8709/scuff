// The invoice check: each line with its verdict, then the totals.
// Shown during review and on the receipt.

import type { InvoiceCheck, LineVerdict } from "@/lib/types";
import { formatMoney } from "@/lib/money";

const VERDICT: Record<LineVerdict, { label: string; className: string }> = {
  supported: { label: "Matches the scene", className: "bg-go text-marking" },
  not_supported: { label: "Not documented", className: "bg-stop text-marking" },
  unclear: { label: "Unclear", className: "bg-signal text-asphalt" },
};

export default function InvoiceTable({
  check,
  currency,
  cap,
  onToggleLine,
}: {
  check: InvoiceCheck;
  currency: string;
  cap: number;
  // given only to the paying driver while reviewing: lets them pay a line the AI did not support
  onToggleLine?: (index: number, approved: boolean) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-asphalt-soft">
        {check.shopName || "Repair shop"}
        {check.invoiceDate ? `, ${check.invoiceDate}` : ""}
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {check.lines.map((line, index) => {
          const counted = line.verdict === "supported" || line.payerApproved;
          return (
          <li key={index} className="p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`font-semibold ${counted ? "" : "text-asphalt-soft line-through decoration-2"}`}>
                {line.description}
              </span>
              <span className="condensed shrink-0 text-lg font-bold">{formatMoney(line.amount, currency)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className={`condensed rounded px-2 font-semibold ${VERDICT[line.verdict].className}`}>{VERDICT[line.verdict].label}</span>
              {line.payerApproved && <span className="condensed rounded bg-asphalt px-2 font-semibold text-marking">Approved by payer</span>}
              <span>{line.reason}</span>
            </div>
            {onToggleLine && line.verdict !== "supported" && (
              <button
                onClick={() => onToggleLine(index, !line.payerApproved)}
                className="mt-2 text-sm font-semibold underline underline-offset-4"
              >
                {line.payerApproved ? "Don't pay this line" : "I agree to pay this line anyway"}
              </button>
            )}
          </li>
          );
        })}
      </ul>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1">
        <dt>Invoice total</dt>
        <dd className="text-right">{formatMoney(check.invoiceTotal, currency)}</dd>
        <dt>Matches the scene evidence</dt>
        <dd className="text-right">{formatMoney(check.supportedTotal, currency)}</dd>
        {check.lines.some((l) => l.payerApproved) && (
          <>
            <dt>Added by the paying driver</dt>
            <dd className="text-right">
              {formatMoney(
                check.lines.filter((l) => l.payerApproved && l.verdict !== "supported").reduce((sum, l) => sum + l.amount, 0),
                currency
              )}
            </dd>
          </>
        )}
        <dt>Agreed cap</dt>
        <dd className="text-right">{formatMoney(cap, currency)}</dd>
        <dt className="pt-2 text-lg font-bold">To be paid</dt>
        <dd className="condensed pt-2 text-right text-3xl font-bold">{formatMoney(check.approvedAmount, currency)}</dd>
      </dl>
      {check.notes && <p className="mt-3 text-sm text-asphalt-soft">{check.notes}</p>}
    </div>
  );
}
