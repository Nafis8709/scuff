"use client";

// Shows both drivers' phones side by side in one browser window,
// so a judge can play both roles without needing two devices.

import { useEffect, useState } from "react";
import Link from "next/link";
import { postJson } from "./client-api";
import { Plate } from "./ui";

interface DemoCase {
  caseId: string;
  tokenA: string;
  tokenB: string;
}

export default function DemoSplit() {
  const [demo, setDemo] = useState<DemoCase | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function setUp() {
      try {
        const first = await postJson<{ caseId: string; token: string }>("/api/cases", {
          name: "Alex",
          role: "payer",
          country: "US",
          currency: "USD",
        });
        const view = await fetch(`/api/cases/${first.caseId}?t=${first.token}`).then((r) => r.json());
        const second = await postJson<{ caseId: string; token: string }>("/api/join", { code: view.case.code, name: "Sam" });
        if (!cancelled) setDemo({ caseId: first.caseId, tokenA: first.token, tokenB: second.token });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    setUp();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-6">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/">
          <Plate code="SCUFF" />
        </Link>
        <div className="max-w-prose text-asphalt-soft">
          <p>
            Two phones, one case. Alex (left) is paying; Sam (right) is being paid. Use photos of any car scratch or dent.
          </p>
          <p className="mt-1">
            No repair bill handy?{" "}
            <a href="/samples/sample-invoice.png" download className="font-semibold text-asphalt underline underline-offset-4">
              Download a sample invoice
            </a>{" "}
            (it includes a headlamp and brake pads that were not part of the scrape). Test card: 4111 1111 1111 1111, any
            future date, any CVV.
          </p>
        </div>
      </header>
      {error ? <p className="text-stop">{error}</p> : null}
      {!demo ? (
        <p className="scanning rounded-md bg-marking p-4">Setting up a fresh demo case…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Phone label="Alex — paying" src={`/c/${demo.caseId}?t=${demo.tokenA}&embed=1`} />
          <Phone label="Sam — being paid" src={`/c/${demo.caseId}?t=${demo.tokenB}&embed=1`} />
        </div>
      )}
    </main>
  );
}

function Phone({ label, src }: { label: string; src: string }) {
  return (
    <div>
      <p className="mb-2 font-semibold">{label}</p>
      <iframe
        title={label}
        src={src}
        className="h-[78vh] w-full rounded-[28px] border-[10px] border-asphalt bg-concrete"
      />
    </div>
  );
}
