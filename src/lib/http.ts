// Small helpers shared by the route handlers.

import { NextResponse } from "next/server";
import { ActionError } from "./cases";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ActionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function tokenFrom(request: Request): string {
  const header = request.headers.get("x-party-token");
  if (header) return header;
  return new URL(request.url).searchParams.get("t") || "";
}

// The public address of the app (behind a proxy like Render, request.url is internal).
export function publicOrigin(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
