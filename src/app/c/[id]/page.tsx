import { Suspense } from "react";
import CaseRoom from "@/components/CaseRoom";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CaseRoom caseId={id} />
    </Suspense>
  );
}
