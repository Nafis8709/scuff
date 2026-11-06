"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, inputClass } from "./ui";
import { postJson, rememberToken } from "./client-api";

const COUNTRIES = [
  { code: "US", name: "United States", currency: "USD" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "OTHER", name: "Somewhere else (USD)", currency: "USD" },
];

export default function StartForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"payer" | "receiver">("payer");
  const [country, setCountry] = useState("US");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let currency = "USD";
      for (const c of COUNTRIES) {
        if (c.code === country) currency = c.currency;
      }
      const result = await postJson<{ caseId: string; token: string }>("/api/cases", { name, role, country, currency });
      rememberToken(result.caseId, result.token);
      router.push(`/c/${result.caseId}?t=${result.token}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={start} className="space-y-4 rounded-lg border border-line bg-marking p-5">
        <h2 className="text-2xl">Start a case</h2>
        <Field label="Your name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </Field>

        <fieldset>
          <legend className="mb-1 font-semibold">Who is paying for the damage?</legend>
          <div className="grid grid-cols-2 gap-2">
            <RoleOption checked={role === "payer"} onSelect={() => setRole("payer")} title="I'll pay" detail="I'm covering the other car's repair" />
            <RoleOption checked={role === "receiver"} onSelect={() => setRole("receiver")} title="I'm being paid" detail="My car needs repairing" />
          </div>
        </fieldset>

        <Field label="Where did it happen?">
          <select className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Starting…" : "Start and show the QR code"}
        </Button>
        <ErrorText message={error} />
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (joinCode.trim()) router.push(`/join/${joinCode.trim().toUpperCase()}`);
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <Field label="The other driver already started? Enter their code">
            <input
              className={`${inputClass} condensed text-xl tracking-widest uppercase`}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={6}
              placeholder="K7Q2MX"
            />
          </Field>
        </div>
        <Button kind="secondary" type="submit">
          Join
        </Button>
      </form>
    </div>
  );
}

function RoleOption(props: { checked: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <label
      className={`cursor-pointer rounded-md border-2 p-3 ${props.checked ? "border-asphalt bg-warn-bg" : "border-line bg-marking"}`}
    >
      <input type="radio" className="sr-only" checked={props.checked} onChange={props.onSelect} />
      <span className="block font-semibold">{props.title}</span>
      <span className="block text-sm text-asphalt-soft">{props.detail}</span>
    </label>
  );
}
