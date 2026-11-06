// The invoice check: each line with its verdict, then the totals.
// Shown during review and on the receipt.

import type { InvoiceCheck, LineVerdict } from "@/lib/types";
import { formatMoney } from "@/lib/money";

const VERDICT: Record<LineVerdict, { label: string; className: string }> = {
  supported: { label: "Matches the scene", className: "bg-go text-marking" },
  not_supported: { label: "Not documented", className: "bg-stop text-marking" },
  unclear: { label: "Unclear", className: "bg-signal text-asphalt" },
};

export default function InvoiceTable({ check, currency, cap }: { check: InvoiceCheck; currency: string; cap: number }) {
  return (
    <div>
      <p className="mb-3 text-sm text-asphalt-soft">
        {check.shopName || "Repair shop"}
        {check.invoiceDate ? `, ${check.invoiceDate}` : ""}
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {check.lines.map((line, index) => (
          <li key={index} className="p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`font-semibold ${line.verdict === "supported" ? "" : "text-asphalt-soft line-through decoration-2"}`}>
                {line.description}
              </span>
              <span className="condensed shrink-0 text-lg font-bold">{formatMoney(line.amount, currency)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className={`condensed rounded px-2 font-semibold ${VERDICT[line.verdict].className}`}>{VERDICT[line.verdict].label}</span>
              <span>{line.reason}</span>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1">
        <dt>Invoice total</dt>
        <dd className="text-right">{formatMoney(check.invoiceTotal, currency)}</dd>
        <dt>Matches the scene evidence</dt>
        <dd className="text-right">{formatMoney(check.supportedTotal, currency)}</dd>
        <dt>Agreed cap</dt>
        <dd className="text-right">{formatMoney(cap, currency)}</dd>
        <dt className="pt-2 text-lg font-bold">To be paid</dt>
        <dd className="condensed pt-2 text-right text-3xl font-bold">{formatMoney(check.approvedAmount, currency)}</dd>
      </dl>
      {check.notes && <p className="mt-3 text-sm text-asphalt-soft">{check.notes}</p>}
    </div>
  );
}
