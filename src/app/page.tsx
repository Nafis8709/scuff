import StartForm from "@/components/StartForm";
import { Plate } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <header className="mb-8 flex items-center justify-between">
        <Plate code="SCUFF" />
        <a href="/demo" className="font-semibold underline underline-offset-4">
          Two-driver demo
        </a>
      </header>

      <h1 className="text-5xl">Settle a scrape before you drive away.</h1>
      <p className="mt-4 max-w-prose text-lg text-asphalt-soft">
        Nobody hurt, just a dent? Document it together, agree on a maximum, and hold the money with PayPal.
        The repair bill is checked against the scene photos, and only the matching amount is paid.
      </p>

      <ol className="mt-8 space-y-4 border-l-4 border-dashed border-asphalt pl-5">
        <li>
          <strong>At the scene.</strong> Both drivers add photos and a short statement. Claude writes a neutral damage
          report and a repair estimate.
        </li>
        <li>
          <strong>Agree and hold.</strong> You both sign one agreement with a cap. The paying driver places a PayPal
          hold for the cap, so nobody can disappear.
        </li>
        <li>
          <strong>Pay what the evidence supports.</strong> The repair invoice is checked line by line against the scene.
          Only the verified amount is captured; the rest of the hold is released.
        </li>
      </ol>

      <div className="mt-10">
        <StartForm />
      </div>

      <p className="mt-8 text-sm text-asphalt-soft">
        If anyone is hurt, the car is unsafe to drive, or the drivers disagree on what happened, call the police and
        your insurer instead. Scuff is for small, agreed, property-only scrapes.
      </p>
    </main>
  );
}
