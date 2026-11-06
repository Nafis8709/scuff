// The audit trail of the case, collapsed by default.

import type { CaseEvent, Party } from "@/lib/types";

export default function Timeline({ events, parties }: { events: CaseEvent[]; parties: Party[] }) {
  function who(by: CaseEvent["by"]): string {
    if (by === "system") return "Scuff";
    for (const p of parties) {
      if (p.id === by) return p.name;
    }
    return by;
  }
  return (
    <details className="rounded-lg border border-line bg-marking p-4">
      <summary className="cursor-pointer font-semibold">Case record ({events.length} {events.length === 1 ? "entry" : "entries"})</summary>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map((event, index) => (
          <li key={index} className="grid grid-cols-[4.5rem_1fr] gap-2">
            <time className="text-asphalt-soft" dateTime={event.at}>
              {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
            <span>
              <span className="font-semibold">{who(event.by)}:</span> {event.text}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
