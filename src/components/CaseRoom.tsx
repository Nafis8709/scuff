"use client";

// The shared "room" both drivers look at. It polls the case every 3 seconds
// and shows the step that matches the case status and this driver's role.

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CaseView } from "@/lib/types";
import { recallToken, rememberToken } from "./client-api";
import { Panel, Plate } from "./ui";
import Progress from "./Progress";
import WaitingStep from "./steps/WaitingStep";
import DocumentingStep from "./steps/DocumentingStep";
import AssessingStep from "./steps/AssessingStep";
import AgreementStep from "./steps/AgreementStep";
import FundingStep from "./steps/FundingStep";
import RepairingStep from "./steps/RepairingStep";
import ReviewingStep from "./steps/ReviewingStep";
import DoneStep from "./steps/DoneStep";
import Timeline from "./Timeline";

export type FullView = CaseView & { missing: string[] };

export interface StepProps {
  view: FullView;
  token: string;
  refresh: () => Promise<void>;
}

export default function CaseRoom({ caseId }: { caseId: string }) {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [view, setView] = useState<FullView | null>(null);
  const [error, setError] = useState("");
  const embedded = searchParams.get("embed") === "1";

  // The token comes from the URL the first time, then from this device's storage.
  useEffect(() => {
    const fromUrl = searchParams.get("t") || "";
    if (fromUrl) {
      rememberToken(caseId, fromUrl);
      setToken(fromUrl);
    } else {
      setToken(recallToken(caseId));
    }
  }, [caseId, searchParams]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/cases/${caseId}`, { headers: { "x-party-token": token }, cache: "no-store" });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error || "Could not load the case");
      return;
    }
    setError("");
    setView(json as FullView);
  }, [caseId, token]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [token, refresh]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-10">
        <Panel title="This case is not available" tone="stop">
          <p>{error}</p>
          <p className="mt-2">Open the case from the same phone and link you used to join it.</p>
        </Panel>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-10">
        <p className="scanning rounded-md bg-marking p-4">Loading the case…</p>
      </main>
    );
  }

  const c = view.case;
  let me = c.parties[0];
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
  }
  const stepProps: StepProps = { view, token, refresh };

  return (
    <main className={`mx-auto max-w-xl px-4 pb-16 ${embedded ? "pt-4" : "pt-6"}`}>
      <header className="mb-5 flex items-center justify-between gap-3">
        <Plate code={c.code} />
        <div className="text-right text-sm leading-tight">
          <div className="font-semibold">{me.name}</div>
          <div className="text-asphalt-soft">{me.role === "payer" ? "Paying" : "Being paid"}</div>
        </div>
      </header>

      <Progress status={c.status} />

      <PracticeBanner aiMock={view.aiMode === "mock"} paymentsMock={view.paymentProvider === "mock"} />

      <div className="space-y-5">
        {c.status === "waiting" && <WaitingStep {...stepProps} />}
        {(c.status === "waiting" || c.status === "documenting") && <DocumentingStep {...stepProps} />}
        {c.status === "stopped" && (
          <Panel title="Private settlement stopped" tone="stop">
            <p>{c.stopReason}</p>
            <p className="mt-3">
              Keep the photos you took. Exchange names, plates and insurance details with the other driver before you
              leave.
            </p>
          </Panel>
        )}
        {c.status === "assessing" && <AssessingStep {...stepProps} />}
        {c.status === "agreement" && <AgreementStep {...stepProps} />}
        {c.status === "funding" && <FundingStep {...stepProps} />}
        {c.status === "repairing" && <RepairingStep {...stepProps} />}
        {c.status === "reviewing" && <ReviewingStep {...stepProps} />}
        {(c.status === "settled" || c.status === "closed") && <DoneStep {...stepProps} />}

        <Timeline events={c.events} parties={c.parties} />
      </div>
    </main>
  );
}

function PracticeBanner({ aiMock, paymentsMock }: { aiMock: boolean; paymentsMock: boolean }) {
  if (!aiMock && !paymentsMock) return null;
  let what = "AI results are sample data and payments are simulated";
  if (!aiMock) what = "payments are simulated";
  if (!paymentsMock) what = "AI results are sample data";
  return (
    <p className="mb-4 rounded-md border border-signal-deep bg-warn-bg px-3 py-2 text-sm">
      Practice mode: {what}. Add the keys from .env.example to use real AI and the Braintree / PayPal sandbox.
    </p>
  );
}
