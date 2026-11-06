// POST /api/cases/:id/action — every change to a case goes through here.
// Body: { action: "...", ...fields }. Header: x-party-token.

import { NextResponse } from "next/server";
import * as cases from "@/lib/cases";
import { saveCase } from "@/lib/db";
import { jsonError, tokenFrom } from "@/lib/http";

const PHOTO_KINDS = ["damage", "plate", "scene"] as const;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = cases.loadCase(id);
    const me = cases.partyForToken(c, tokenFrom(request));
    let extra: Record<string, unknown> = {};

    switch (body.action) {
      case "details":
        cases.updateDetails(c, me, body);
        break;
      case "injury":
        cases.answerInjury(c, me, body.injured === true);
        break;
      case "statement":
        cases.setStatement(c, me, String(body.statement || ""));
        break;
      case "addPhoto": {
        const kind = PHOTO_KINDS.includes(body.kind) ? body.kind : "damage";
        const photo = cases.addPhoto(c, me, kind, String(body.dataUrl || ""));
        extra = { photoId: photo.id };
        break;
      }
      case "removePhoto":
        cases.removePhoto(c, me, String(body.photoId || ""));
        break;
      case "ready":
        await cases.markReady(c, me);
        break;
      case "retryAssessment":
        await cases.runAssessment(c);
        break;
      case "reopen":
        cases.reopenDocumenting(c, me);
        break;
      case "setCap":
        cases.setCap(c, me, Number(body.amount));
        break;
      case "sign":
        cases.sign(c, me, String(body.typedName || ""), String(body.agreementHash || ""));
        break;
      case "createOrder": {
        const orderId = await cases.startHold(c, me);
        extra = { orderId };
        break;
      }
      case "confirmHold":
        await cases.confirmHold(c, me, String(body.orderId || ""));
        break;
      case "extendHold":
        await cases.extendHold(c, me);
        break;
      case "submitInvoice":
        await cases.submitInvoice(c, me, String(body.dataUrl || ""));
        break;
      case "rejectCheck":
        cases.rejectInvoiceCheck(c, me);
        break;
      case "accept":
        await cases.acceptAndSettle(c, me);
        break;
      case "cancel":
        await cases.cancelCase(c, me);
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    saveCase(c);
    return NextResponse.json({ ok: true, ...extra });
  } catch (error) {
    return jsonError(error);
  }
}
