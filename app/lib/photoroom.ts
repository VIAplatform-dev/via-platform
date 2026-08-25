// Reusable Photoroom ghost-mannequin helper (extracted from the admin prototype).
// Turns an on-model / flat product photo into a clean ghost-mannequin cover image.
import { recordPhotoroom } from "./cost-tracker.ts";

// The Image Editing API, not the cheaper background-removal one — ghost mannequin is an editing
// feature. That is a ~5x difference per image and it was costing money untracked: PHOTOROOM had no
// entry on the rate card, so none of this appeared in api_costs at all.
const PHOTOROOM_ENDPOINT = "https://image-api.photoroom.com/v2/edit";

export function isPhotoroomConfigured(): boolean {
 // Requires BOTH the API key AND an explicit enable flag, so PhotoRoom stays
 // dormant — no calls, no spend — until you intentionally switch it on, even if a
 // key is already present. Flip PHOTOROOM_ENABLED=true when the subscription is live.
 return Boolean(process.env.PHOTOROOM_API_KEY) && process.env.PHOTOROOM_ENABLED === "true";
}

/** Run a product image URL through Photoroom's ghost-mannequin. Returns the PNG
 * bytes, or null if unconfigured / the call failed. */
export async function ghostMannequinFromUrl(imageUrl: string): Promise<ArrayBuffer | null> {
 const apiKey = process.env.PHOTOROOM_API_KEY;
 if (!apiKey || !imageUrl) return null;
 try {
 const src = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
 if (!src.ok) return null;
 const srcBlob = await src.blob();

 const form = new FormData();
 form.append("imageFile", srcBlob, "input.png");
 form.append("ghostMannequin.mode", "ai.auto");

 const res = await fetch(PHOTOROOM_ENDPOINT, { method: "POST", headers: { "x-api-key": apiKey }, body: form });
 if (!res.ok) return null;
 return await res.arrayBuffer();
 } catch {
 return null;
 }
}

/** Clean a product photo: remove the background and drop it on a solid backdrop
 * (default white) for a consistent, polished catalog look. Returns PNG bytes, or
 * null if unconfigured / the call failed. Gated by PHOTOROOM_API_KEY like the rest. */
export async function cleanProductImageFromUrl(imageUrl: string, backgroundHex = "FFFFFF"): Promise<ArrayBuffer | null> {
 const apiKey = process.env.PHOTOROOM_API_KEY;
 if (!apiKey || !imageUrl) return null;
 try {
 const src = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
 if (!src.ok) return null;
 const srcBlob = await src.blob();

 const form = new FormData();
 form.append("imageFile", srcBlob, "input.png");
 form.append("background.color", backgroundHex); // omit/transparent handled by caller intent

 const res = await fetch(PHOTOROOM_ENDPOINT, { method: "POST", headers: { "x-api-key": apiKey }, body: form });
 if (!res.ok) return null;
 return await res.arrayBuffer();
 } catch {
 return null;
 }
}
