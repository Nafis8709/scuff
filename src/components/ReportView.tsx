// The AI damage report, shown during the agreement step and on the receipt.

import type { DamageReport, DamageZone } from "@/lib/types";
import { formatMoney } from "@/lib/money";

const SEVERITY_LABEL: Record<DamageZone["severity"], string> = {
  none: "No damage",
  cosmetic: "Cosmetic",
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

export default function ReportView({
  report,
  currency,
  caseId,
  token,
}: {
  report: DamageReport;
  currency: string;
  caseId: string;
  token: string;
}) {
  return (
    <div className="space-y-5">
      <p className="text-lg">{report.summary}</p>

      {report.safetyFlags.length > 0 && (
        <div className="rounded-md border-l-8 border-stop bg-red-50 p-3">
          <p className="font-semibold text-stop">Consider your insurer instead</p>
          <ul className="mt-1 list-disc pl-5">
            {report.safetyFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xl">Damage to be repaired</h3>
        <ul className="space-y-3">
          {report.receiverDamage.map((zone) => (
            <ZoneRow key={zone.zone} zone={zone} caseId={caseId} token={token} />
          ))}
        </ul>
      </div>

      <div className="rounded-md bg-concrete p-4">
        <p className="text-sm text-asphalt-soft">Typical repair cost</p>
        <p className="condensed text-4xl font-bold">
          {formatMoney(report.estimateLow, currency)} – {formatMoney(report.estimateHigh, currency)}
        </p>
        <p className="mt-1 text-sm">{report.estimateBasis}</p>
      </div>

      <div>
        <h3 className="mb-1 text-xl">What happened</h3>
        <p>{report.statementSummary}</p>
        {!report.statementsConsistent && report.statementConflicts.length > 0 && (
          <div className="mt-3 rounded-md border border-signal-deep bg-warn-bg p-3">
            <p className="font-semibold">Your statements differ on:</p>
            <ul className="mt-1 list-disc pl-5">
              {report.statementConflicts.map((conflict) => (
                <li key={conflict}>{conflict}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">Only sign if you both accept the payment terms anyway. Otherwise, use your insurers.</p>
          </div>
        )}
      </div>

      {report.payerDamage.length > 0 && (
        <p className="text-sm text-asphalt-soft">
          Also recorded on the paying driver&apos;s car (not covered by this settlement):{" "}
          {report.payerDamage.map((z) => z.zone).join(", ")}.
        </p>
      )}

      {report.photoQualityIssues.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Photos that would make this record stronger:</p>
          <ul className="list-disc pl-5">
            {report.photoQualityIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ZoneRow({ zone, caseId, token }: { zone: DamageZone; caseId: string; token: string }) {
  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold capitalize">{zone.zone}</span>
        <span className="condensed rounded bg-asphalt px-2 text-sm text-marking">{SEVERITY_LABEL[zone.severity]}</span>
      </div>
      <p className="mt-1">{zone.description}</p>
      {zone.photoIds.length > 0 && (
        <div className="mt-2 flex gap-2">
          {zone.photoIds.slice(0, 4).map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={`/api/cases/${caseId}/photos/${id}?t=${token}`}
              alt={`Evidence for ${zone.zone}`}
              className="h-16 w-16 rounded border border-line object-cover"
            />
          ))}
        </div>
      )}
    </li>
  );
}
