// GET /api/cases/:id/qr — QR code (SVG) of the join link, shown to the first driver.

import QRCode from "qrcode";
import { loadCase, partyForToken } from "@/lib/cases";
import { jsonError, publicOrigin, tokenFrom } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const c = loadCase(id);
    partyForToken(c, tokenFrom(request));
    const origin = publicOrigin(request);
    const svg = await QRCode.toString(`${origin}/join/${c.code}`, { type: "svg", margin: 1 });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
  } catch (error) {
    return jsonError(error);
  }
}
