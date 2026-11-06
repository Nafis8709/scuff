// POST /api/join — the second driver joins with the code from the QR / link.

import { NextResponse } from "next/server";
import { joinCase } from "@/lib/cases";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = joinCase(String(body.code || ""), String(body.name || ""));
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
