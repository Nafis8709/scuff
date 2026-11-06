"use client";

import { useState } from "react";
import type { StepProps } from "../CaseRoom";
import { caseAction } from "../client-api";
import { Button, ErrorText, Panel } from "../ui";

export default function AssessingStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoCount = view.photos.filter((p) => p.kind !== "invoice").length;
  const lastEvent = c.events[c.events.length - 1];
  const failed = lastEvent && lastEvent.text.startsWith("Damage analysis failed");

  async function retry() {
    setBusy(true);
    setError("");
    try {
      await caseAction(c.id, token, "retryAssessment");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  if (failed) {
    return (
      <Panel title="The analysis did not finish" tone="warn">
        <p>{lastEvent.text}</p>
        <div className="mt-4">
          <Button onClick={retry} disabled={busy}>
            {busy ? "Analysing…" : "Try the analysis again"}
          </Button>
        </div>
        <ErrorText message={error} />
      </Panel>
    );
  }

  return (
    <Panel title="Reading the evidence">
      <div className="scanning rounded-md border border-line bg-concrete p-4">
        <p>
          Claude is looking at {photoCount} photos and both statements: which parts are damaged, how badly, what a
          repair usually costs, and whether the two accounts agree.
        </p>
      </div>
      <p className="mt-3 text-sm text-asphalt-soft">This usually takes under a minute. Both phones update on their own.</p>
    </Panel>
  );
}
