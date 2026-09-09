// Turning a pan-and-zoom gesture into a rectangle of pixels.
//
// The editor shows the photo scaled to *cover* a fixed frame, then lets the seller drag it around
// and zoom in. What the server needs is the region of the ORIGINAL image now sitting behind that
// frame. Keeping the arithmetic here — rather than in the component or the route — means it can be
// tested against the cases that actually break: a photo narrower than the frame, a photo wider than
// it, and a drag pushed past the edge.

export type Crop = { left: number; top: number; width: number; height: number };

/** The frame a listing photo is cropped to: the shape of a product card (width ÷ height). */
export const CARD_ASPECT = 0.82;

/**
 * `zoom` is 1 at "just covers the frame". `panX`/`panY` are -1…1, where 0 is centred and ±1 is as
 * far as the photo can slide before showing an edge. Expressing the pan as a fraction of the
 * available slack — rather than in pixels — means the same numbers work whatever size the editor
 * is drawn at, so a crop set on a phone lands identically on a laptop.
 */
export function cropRect(
 img: { width: number; height: number },
 opts: { aspect?: number; zoom?: number; panX?: number; panY?: number } = {},
): Crop {
 const aspect = opts.aspect && opts.aspect > 0 ? opts.aspect : CARD_ASPECT;
 const zoom = Math.max(1, Math.min(4, opts.zoom ?? 1));
 const panX = Math.max(-1, Math.min(1, opts.panX ?? 0));
 const panY = Math.max(-1, Math.min(1, opts.panY ?? 0));

 // The largest frame-shaped rectangle that fits inside the image, then shrunk by the zoom: zooming
 // in means taking LESS of the original, which is what makes the subject bigger in the frame.
 const wide = img.width / img.height > aspect;
 const baseW = wide ? img.height * aspect : img.width;
 const baseH = wide ? img.height : img.width / aspect;
 const w = Math.max(1, Math.round(baseW / zoom));
 const h = Math.max(1, Math.round(baseH / zoom));

 // Whatever is left over is how far it can slide. A photo the exact shape of the frame at zoom 1
 // has no slack in one axis, and panning that axis correctly does nothing.
 const slackX = Math.max(0, img.width - w);
 const slackY = Math.max(0, img.height - h);
 const left = Math.round(slackX / 2 + (panX * slackX) / 2);
 const top = Math.round(slackY / 2 + (panY * slackY) / 2);

 return {
  left: Math.max(0, Math.min(img.width - w, left)),
  top: Math.max(0, Math.min(img.height - h, top)),
  width: w,
  height: h,
 };
}
