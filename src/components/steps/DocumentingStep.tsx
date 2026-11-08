"use client";

// Step 1: each driver answers the injury question, adds details, photos and a statement.

import { useRef, useState } from "react";
import type { Party, Photo } from "@/lib/types";
import type { StepProps } from "../CaseRoom";
import { caseAction, resizeImage } from "../client-api";
import { Button, ErrorText, Field, Panel, inputClass } from "../ui";

export default function DocumentingStep({ view, token, refresh }: StepProps) {
  const c = view.case;
  let me: Party = c.parties[0];
  let other: Party | null = null;
  for (const p of c.parties) {
    if (p.id === view.me) me = p;
    else other = p;
  }

  if (me.injured === null) {
    return <InjuryQuestion caseId={c.id} token={token} refresh={refresh} />;
  }

  return (
    <>
      <DetailsForm caseId={c.id} token={token} me={me} refresh={refresh} />
      <PhotoSection view={view} token={token} refresh={refresh} me={me} />
      <StatementForm caseId={c.id} token={token} me={me} refresh={refresh} />
      <ReadySection view={view} token={token} refresh={refresh} me={me} other={other} />
    </>
  );
}

function InjuryQuestion({ caseId, token, refresh }: { caseId: string; token: string; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function answer(injured: boolean) {
    setBusy(true);
    await caseAction(caseId, token, "injury", { injured });
    await refresh();
    setBusy(false);
  }
  return (
    <Panel title="First: is anyone hurt, even a little?">
      <p className="mb-4 text-asphalt-soft">
        Include passengers, pedestrians and anyone with neck or back pain. Injuries are never settled privately.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => answer(false)} disabled={busy}>
          Nobody is hurt
        </Button>
        <Button kind="danger" onClick={() => answer(true)} disabled={busy}>
          Someone is hurt
        </Button>
      </div>
    </Panel>
  );
}

function DetailsForm({ caseId, token, me, refresh }: { caseId: string; token: string; me: Party; refresh: () => Promise<void> }) {
  // Local copies so polling does not overwrite what the driver is typing.
  const [plate, setPlate] = useState(me.plate);
  const [vehicle, setVehicle] = useState(me.vehicle);
  const [email, setEmail] = useState(me.paypalEmail);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await caseAction(caseId, token, "details", { plate, vehicle, paypalEmail: email });
      setSaved(true);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Panel title="Your car">
      <form onSubmit={save} className="space-y-4" onChange={() => setSaved(false)}>
        <div className="grid grid-cols-[8.5rem_1fr] gap-3">
          <Field label="Plate">
            <input className={`${inputClass} condensed uppercase tracking-wider`} value={plate} onChange={(e) => setPlate(e.target.value)} />
          </Field>
          <Field label="Make, model, colour">
            <input className={inputClass} value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Blue Honda Civic" />
          </Field>
        </div>
        {me.role === "receiver" && (
          <Field label="Your PayPal email" hint="The repair money is paid straight to this PayPal account.">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
        )}
        <div className="flex items-center gap-3">
          <Button kind="secondary" type="submit">
            Save car details
          </Button>
          {saved && <span className="text-go">Saved</span>}
        </div>
        <ErrorText message={error} />
      </form>
    </Panel>
  );
}

const PHOTO_BUTTONS: { kind: Photo["kind"]; label: string }[] = [
  { kind: "damage", label: "Add a damage close-up" },
  { kind: "plate", label: "Add your plate" },
  { kind: "scene", label: "Add a wide shot" },
];

function PhotoSection({ view, token, refresh, me }: StepProps & { me: Party }) {
  const c = view.case;
  const [busyKind, setBusyKind] = useState("");
  const [error, setError] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const mine = view.photos.filter((p) => p.party === me.id && p.kind !== "invoice");
  const theirs = view.photos.filter((p) => p.party !== me.id && p.kind !== "invoice");

  async function upload(kind: Photo["kind"], files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusyKind(kind);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await resizeImage(file);
        await caseAction(c.id, token, "addPhoto", { kind, dataUrl });
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusyKind("");
  }

  async function remove(photoId: string) {
    await caseAction(c.id, token, "removePhoto", { photoId });
    await refresh();
  }

  return (
    <Panel title="Photos">
      <p className="mb-4 text-asphalt-soft">
        Close-ups of every mark on {me.role === "receiver" ? "your" : "the other"} car, your plate, and one wide shot of
        both cars. Damage that is not photographed now cannot be paid for later.
      </p>
      <div className="flex flex-wrap gap-2">
        {PHOTO_BUTTONS.map((b) => (
          <div key={b.kind}>
            <input
              ref={(el) => {
                inputs.current[b.kind] = el;
              }}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => {
                upload(b.kind, e.target.files);
                e.target.value = "";
              }}
            />
            <Button kind="secondary" onClick={() => inputs.current[b.kind]?.click()} disabled={busyKind !== ""}>
              {busyKind === b.kind ? "Uploading…" : b.label}
            </Button>
          </div>
        ))}
      </div>
      <ErrorText message={error} />

      <PhotoGrid caseId={c.id} token={token} photos={mine} onRemove={remove} />
      {theirs.length > 0 && (
        <>
          <h3 className="mt-5 text-lg">From the other driver</h3>
          <PhotoGrid caseId={c.id} token={token} photos={theirs} />
        </>
      )}
    </Panel>
  );
}

export function PhotoGrid({
  caseId,
  token,
  photos,
  onRemove,
}: {
  caseId: string;
  token: string;
  photos: { id: string; kind: string }[];
  onRemove?: (id: string) => void;
}) {
  if (photos.length === 0) return null;
  return (
    <ul className="mt-4 grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <li key={photo.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/cases/${caseId}/photos/${photo.id}?t=${token}`}
            alt={`${photo.kind} photo ${photo.id}`}
            className="aspect-square w-full rounded-md border border-line object-cover"
          />
          <span className="absolute bottom-1 left-1 rounded bg-asphalt/80 px-1.5 text-xs text-marking">{photo.kind}</span>
          {onRemove && (
            <button
              onClick={() => onRemove(photo.id)}
              className="absolute right-1 top-1 rounded bg-marking/90 px-1.5 text-sm font-semibold text-stop"
              aria-label={`Remove photo ${photo.id}`}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatementForm({ caseId, token, me, refresh }: { caseId: string; token: string; me: Party; refresh: () => Promise<void> }) {
  const [text, setText] = useState(me.statement);
  const [saved, setSaved] = useState(Boolean(me.statement));

  async function save() {
    await caseAction(caseId, token, "statement", { statement: text });
    setSaved(true);
    await refresh();
  }

  return (
    <Panel title="What happened, in your words">
      <textarea
        className={`${inputClass} min-h-28`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="I was stopped at the light on Main St. The car behind rolled forward and touched my rear bumper."
        maxLength={1500}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button kind="secondary" onClick={save} disabled={!text.trim() || saved}>
          {saved ? "Statement saved" : "Save statement"}
        </Button>
      </div>
      <p className="mt-2 text-sm text-asphalt-soft">Facts only. The AI writes a neutral summary of both statements and points out where they differ.</p>
    </Panel>
  );
}

function ReadySection({ view, token, refresh, me, other }: StepProps & { me: Party; other: Party | null }) {
  const c = view.case;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ready() {
    setBusy(true);
    setError("");
    try {
      await caseAction(c.id, token, "ready");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function cancel() {
    if (!window.confirm("Cancel this settlement? Nothing has been paid yet.")) return;
    await caseAction(c.id, token, "cancel");
    await refresh();
  }

  return (
    <Panel title={me.ready ? "Waiting for the other driver" : "Finished documenting?"}>
      {me.ready ? (
        <p>
          You are done. {other ? `${other.name} is still adding evidence.` : ""} The damage report starts as soon as you
          are both ready.
        </p>
      ) : view.missing.length > 0 ? (
        <>
          <p className="mb-2">Still to do:</p>
          <ul className="list-disc space-y-1 pl-6">
            {view.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </>
      ) : c.status === "waiting" ? (
        <p>Everything is in. You can mark yourself ready once the other driver joins.</p>
      ) : (
        <>
          <p className="mb-4">Everything is in. When you are both ready, the AI reads all the photos and both statements.</p>
          <Button onClick={ready} disabled={busy}>
            {busy ? "Analysing…" : "I'm done documenting"}
          </Button>
        </>
      )}
      {other && (
        <p className="mt-4 text-sm text-asphalt-soft">
          {other.name}: {other.injured === null ? "has not answered the injury question" : other.ready ? "ready" : "still documenting"}
        </p>
      )}
      <ErrorText message={error} />
      <div className="mt-5 border-t border-line pt-4">
        <Button kind="danger" onClick={cancel}>
          Cancel settlement
        </Button>
      </div>
    </Panel>
  );
}
