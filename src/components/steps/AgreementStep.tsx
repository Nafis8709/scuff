"use client";

// Step 2: both drivers review the AI report, the payer sets the cap, both sign.

import { useState } from "react";
import type { Party } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import type { StepProps } from "../CaseRoom";
import { caseAction } from "../client-api";
import ReportView from "../ReportView";
import { Button, ErrorText, Field, Panel, inputClass } from "../ui";

export default function AgreementStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  let me: Party = c.parties[0];
  let other: Party = c.parties[1];
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
    else other = p;
  }
  const report = c.report;
  if (!report) return null;

  return (
    <>
      <Panel title="Damage report">
        <ReportView report={report} currency={c.currency} caseId={c.id} token={token} />
        {report.mock && <p className="mt-4 text-sm text-asphalt-soft">Sample report (practice mode).</p>}
        <ReopenButton caseId={c.id} token={token} refresh={refresh} />
      </Panel>

      <CapPanel view={view} token={token} refresh={refresh} me={me} />

      <Panel title="The agreement">
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-concrete p-4 font-sans text-sm leading-relaxed">
          {c.agreementText}
        </pre>
        <p className="mt-2 text-xs break-all text-asphalt-soft">Fingerprint: {c.agreementHash}</p>
        <SignForm view={view} token={token} refresh={refresh} me={me} other={other} />
      </Panel>
    </>
  );
}

function ReopenButton({ caseId, token, refresh }: { caseId: string; token: string; refresh: () => Promise<void> }) {
  async function reopen() {
    if (!window.confirm("Go back and add more photos? The report will be made again and signatures cleared.")) return;
    await caseAction(caseId, token, "reopen");
    await refresh();
  }
  return (
    <div className="mt-5">
      <Button kind="secondary" onClick={reopen}>
        Add more photos and redo the report
      </Button>
    </div>
  );
}

function CapPanel({ view, token, refresh, me }: StepProps & { me: Party }) {
  const c = view.case;
  const [amount, setAmount] = useState(String(c.capAmount));
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await caseAction(c.id, token, "setCap", { amount: Number(amount) });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="The cap">
      <p className="condensed text-5xl font-bold">{formatMoney(c.capAmount, c.currency)}</p>
      <p className="mt-2">
        The most that can ever be charged. The real payment is the part of the repair invoice that matches this
        report, which is usually less.
      </p>
      {me.role === "payer" ? (
        <form onSubmit={save} className="mt-4 flex items-end gap-2">
          <div className="flex-1">
            <Field label={`Change the cap (${c.currency})`} hint="Changing it clears both signatures.">
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <Button kind="secondary" type="submit">
            Update
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-asphalt-soft">The paying driver can adjust the cap. If it is too low for you, say so before signing.</p>
      )}
      <ErrorText message={error} />
    </Panel>
  );
}

function SignForm({ view, token, refresh, me, other }: StepProps & { me: Party; other: Party }) {
  const c = view.case;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function sign(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await caseAction(c.id, token, "sign", { typedName: typed, agreementHash: c.agreementHash });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-5 space-y-3">
      <p>
        {other.name}: {other.signature ? `signed at ${new Date(other.signature.signedAt).toLocaleTimeString()}` : "not signed yet"}
      </p>
      {me.signature ? (
        <p className="font-semibold text-go">You signed at {new Date(me.signature.signedAt).toLocaleTimeString()}.</p>
      ) : (
        <form onSubmit={sign} className="space-y-3">
          <Field label={`Type your name to sign: ${me.name}`}>
            <input className={`${inputClass} italic`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" disabled={busy || !typed.trim()}>
            Sign the agreement
          </Button>
          <ErrorText message={error} />
        </form>
      )}
    </div>
  );
}
