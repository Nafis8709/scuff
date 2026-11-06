"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, inputClass } from "./ui";
import { postJson, rememberToken } from "./client-api";

export default function JoinForm({ code }: { code: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await postJson<{ caseId: string; token: string }>("/api/join", { code, name });
      rememberToken(result.caseId, result.token);
      router.push(`/c/${result.caseId}?t=${result.token}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={join} className="space-y-4 rounded-lg border border-line bg-marking p-5">
      <Field label="Your name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </Field>
      <Button type="submit" disabled={busy || !name.trim()}>
        {busy ? "Joining…" : "Join this case"}
      </Button>
      <ErrorText message={error} />
    </form>
  );
}
