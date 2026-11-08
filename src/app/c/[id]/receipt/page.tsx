// A printable record of the whole settlement, available to both drivers.

import { notFound } from "next/navigation";
import { findCaseById } from "@/lib/db";
import { legalNotice } from "@/lib/agreement";
import { formatMoney } from "@/lib/money";
import ReportView from "@/components/ReportView";
import InvoiceTable from "@/components/InvoiceTable";
import HoldSummary from "@/components/HoldSummary";
import Timeline from "@/components/Timeline";
import PrintButton from "@/components/PrintButton";
import { Panel, Plate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const c = findCaseById(id);
  if (!c || !t || !c.parties.some((p) => p.token === t)) {
    notFound();
  }
  const token = t;

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 pb-16 pt-6 print:max-w-none">
      <header className="flex items-center justify-between">
        <Plate code={c.code} />
        <PrintButton />
      </header>
      <h1 className="text-4xl">Settlement record</h1>
      <p className="text-asphalt-soft">Started {new Date(c.createdAt).toLocaleString()}. Status: {c.status}.</p>

      <Panel title="Drivers">
        <ul className="space-y-3">
          {c.parties.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> ({p.role === "payer" ? "paying" : "being paid"}), {p.vehicle}, plate {p.plate}
              <br />
              <span className="text-sm text-asphalt-soft">
                {p.signature ? `Signed as "${p.signature.typedName}" at ${new Date(p.signature.signedAt).toLocaleString()}` : "Did not sign"}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {c.payment && (
        <Panel title="Payment" tone={c.status === "settled" ? "go" : "plain"}>
          {c.payment.capturedAmount > 0 && (
            <p className="condensed mb-3 text-4xl font-bold">{formatMoney(c.payment.capturedAmount, c.currency)} paid</p>
          )}
          <HoldSummary payment={c.payment} currency={c.currency} />
          {c.payment.provider === "mock" && <p className="mt-2 text-sm">Simulated payment (practice mode).</p>}
        </Panel>
      )}

      {c.invoiceCheck && (
        <Panel title="Invoice check">
          <InvoiceTable check={c.invoiceCheck} currency={c.currency} cap={c.capAmount} />
        </Panel>
      )}

      {c.report && (
        <Panel title="Damage report from the scene">
          <ReportView report={c.report} currency={c.currency} caseId={c.id} token={token} />
        </Panel>
      )}

      {c.agreementText && (
        <Panel title="Signed agreement">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{c.agreementText}</pre>
          <p className="mt-2 text-xs break-all text-asphalt-soft">SHA-256 fingerprint: {c.agreementHash}</p>
        </Panel>
      )}

      <p className="text-sm text-asphalt-soft">{legalNotice(c.country)}</p>
      <Timeline events={c.events} parties={c.parties} />
    </main>
  );
}
