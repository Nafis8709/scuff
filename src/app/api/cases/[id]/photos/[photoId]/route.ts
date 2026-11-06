// GET /api/cases/:id/photos/:photoId — serves a photo to either driver of the case.

import { findPhoto } from "@/lib/db";
import { loadCase, partyForToken } from "@/lib/cases";
import { jsonError, tokenFrom } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  try {
    const { id, photoId } = await context.params;
    const c = loadCase(id);
    partyForToken(c, tokenFrom(request));
    const photo = findPhoto(id, photoId);
    if (!photo) {
      return new Response("Not found", { status: 404 });
    }
    const commaIndex = photo.dataUrl.indexOf(",");
    const mimeType = photo.dataUrl.slice(5, photo.dataUrl.indexOf(";"));
    const bytes = Buffer.from(photo.dataUrl.slice(commaIndex + 1), "base64");
    return new Response(bytes, {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
