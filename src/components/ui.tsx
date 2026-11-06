// Small presentational pieces shared across screens.

import type { ReactNode } from "react";

export function Plate({ code, size = "md" }: { code: string; size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-5xl" : "text-2xl";
  return (
    <span className={`plate ${text}`} aria-label={`Case code ${code.split("").join(" ")}`}>
      <span className="plate-band" aria-hidden>
        CASE
      </span>
      {code}
    </span>
  );
}

export function Panel({ title, children, tone = "plain" }: { title?: string; children: ReactNode; tone?: "plain" | "warn" | "stop" | "go" }) {
  const toneClass =
    tone === "warn"
      ? "bg-warn-bg border-signal-deep"
      : tone === "stop"
      ? "bg-marking border-stop border-l-8"
      : tone === "go"
      ? "bg-marking border-go border-l-8"
      : "bg-marking border-line";
  return (
    <section className={`rounded-lg border p-5 ${toneClass}`}>
      {title ? <h2 className="mb-3 text-2xl">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const look =
    kind === "primary"
      ? "bg-signal text-asphalt border-asphalt hover:bg-signal-deep"
      : kind === "danger"
      ? "bg-marking text-stop border-stop hover:bg-red-50"
      : "bg-marking text-asphalt border-asphalt hover:bg-concrete";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-12 rounded-md border-2 px-5 py-2 font-semibold ${look} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-sm text-asphalt-soft">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border-2 border-line bg-marking px-3 py-2.5 text-asphalt focus:border-asphalt focus:outline-none";

export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-stop">
      {message}
    </p>
  );
}
