export const dynamic = "force-dynamic";

import JoinForm from "@/components/JoinForm";
import { Plate } from "@/components/ui";
import { findCaseByCode } from "@/lib/db";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = findCaseByCode(code);

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <Plate code={code.toUpperCase()} size="lg" />
      {!c ? (
        <p className="mt-6 text-lg">No case uses this code. Check the code with the other driver, or start a new case from the home page.</p>
      ) : c.parties.length >= 2 ? (
        <p className="mt-6 text-lg">Both drivers have already joined this case. Open it on the phone that joined it.</p>
      ) : (
        <>
          <h1 className="mt-6 text-4xl">
            {c.parties[0].name} started a settlement and says they are {c.parties[0].role === "payer" ? "paying for your repair" : "the one being paid"}.
          </h1>
          <p className="mt-3 text-asphalt-soft">
            Join to add your photos and statement. Nothing is signed or paid until you both agree.
          </p>
          <div className="mt-6">
            <JoinForm code={c.code} />
          </div>
        </>
      )}
    </main>
  );
}
