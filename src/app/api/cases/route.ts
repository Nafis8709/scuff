// POST /api/cases — the first driver starts a new settlement case.

import { NextResponse } from "next/server";
import { createCase } from "@/lib/cases";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const role = body.role === "receiver" ? "receiver" : "payer";
    const result = createCase({
      name: String(body.name || ""),
      role,
      country: String(body.country || "US"),
      currency: String(body.currency || "USD"),
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
