"use client";

// Shown to the first driver until the second one joins.

import { useEffect, useState } from "react";
import type { StepProps } from "../CaseRoom";
import { Panel } from "../ui";

export default function WaitingStep({ view, token }: StepProps) {
  const c = view.case;
  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setJoinUrl(`${window.location.origin}/join/${c.code}`);
  }, [c.code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel title="Show this to the other driver">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/cases/${c.id}/qr?t=${token}`}
          alt={`QR code to join case ${c.code}`}
          className="h-44 w-44 rounded-md border-2 border-asphalt bg-white p-1"
        />
        <div className="space-y-2">
          <p>They scan the code with their phone camera. No app to install.</p>
          <p>
            Or they open <strong>{joinUrl.replace(/^https?:\/\//, "")}</strong>
          </p>
          <button onClick={copy} className="font-semibold underline underline-offset-4">
            {copied ? "Link copied" : "Copy the link"}
          </button>
          <p className="text-sm text-asphalt-soft">You can start adding your own photos below while you wait.</p>
        </div>
      </div>
    </Panel>
  );
}
