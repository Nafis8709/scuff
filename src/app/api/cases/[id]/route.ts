// GET /api/cases/:id — the case as seen by one driver (polled every few seconds).

import { NextResponse } from "next/server";
import { buildView, loadCase, missingItems, partyForToken } from "@/lib/cases";
import { jsonError, tokenFrom } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const c = loadCase(id);
    const me = partyForToken(c, tokenFrom(request));
    const view = buildView(c, me);
    return NextResponse.json({ ...view, missing: missingItems(c, me) });
  } catch (error) {
    return jsonError(error);
  }
}
