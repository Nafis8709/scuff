// The progress strip: a dashed lane line with five stops.
// The stops really are a sequence, so they are numbered by position.

import type { CaseStatus } from "@/lib/types";

const STOPS = ["Document", "Agree", "Hold", "Repair", "Paid"];

function stageFor(status: CaseStatus): number {
  if (status === "waiting" || status === "documenting" || status === "stopped") return 0;
  if (status === "assessing" || status === "agreement") return 1;
  if (status === "funding") return 2;
  if (status === "repairing" || status === "reviewing") return 3;
  return 4;
}

export default function Progress({ status }: { status: CaseStatus }) {
  const current = stageFor(status);
  return (
    <nav aria-label="Settlement progress" className="mb-5">
      <ol className="relative flex justify-between">
        <span aria-hidden className="absolute left-3 right-3 top-[11px] h-[3px] bg-[repeating-linear-gradient(90deg,var(--asphalt)_0_10px,transparent_10px_18px)]" />
        {STOPS.map((label, index) => {
          const done = index < current || status === "settled";
          const here = index === current && status !== "settled";
          return (
            <li key={label} className="relative z-10 flex flex-col items-center gap-1" aria-current={here ? "step" : undefined}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border-[3px] text-xs font-bold ${
                  done
                    ? "border-asphalt bg-asphalt text-signal"
                    : here
                    ? "border-asphalt bg-signal text-asphalt"
                    : "border-line bg-concrete text-asphalt-soft"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <span className={`condensed text-sm ${here ? "font-bold" : "text-asphalt-soft"}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
