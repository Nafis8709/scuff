// Browser-side helpers: calling our API and shrinking photos before upload.

"use client";

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-party-token"] = token;
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || "Something went wrong");
  }
  return json as T;
}

export function caseAction(caseId: string, token: string, action: string, fields: Record<string, unknown> = {}) {
  return postJson<{ ok: boolean; orderId?: string; photoId?: string }>(
    `/api/cases/${caseId}/action`,
    { action, ...fields },
    token
  );
}

// Resize a photo to at most `maxSide` pixels and re-encode as JPEG.
// Phone photos are 3–8 MB; this brings them to ~200 KB, which is enough for Claude to read damage.
export function resizeImage(file: File, maxSide = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not an image"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser cannot process images"));
          return;
        }
        context.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Remember each case's token on this device so a refresh does not lose access.
export function rememberToken(caseId: string, token: string): void {
  try {
    localStorage.setItem(`scuff:${caseId}`, token);
  } catch {
    // private mode: the token stays in the URL, which is enough
  }
}

export function recallToken(caseId: string): string {
  try {
    return localStorage.getItem(`scuff:${caseId}`) || "";
  } catch {
    return "";
  }
}
