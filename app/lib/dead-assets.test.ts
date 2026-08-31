import { test } from "node:test";
import assert from "node:assert/strict";
import { isPermanentlyGone } from "./dead-assets.ts";

test("a 404 is permanent — the file is not coming back", () => {
 // shop-vintage-charm references 704 files that no longer exist on her own site: old theme images
 // and a blog app's uploads. /images/arrow.jpg 404s on her live homepage today. Retrying them costs
 // about 23 minutes of EVERY fleet run and can never succeed.
 assert.equal(isPermanentlyGone(404), true);
 assert.equal(isPermanentlyGone(410), true);
});

test("a 403 is permanent too — she has locked it, and asking again will not unlock it", () => {
 assert.equal(isPermanentlyGone(403), true);
 assert.equal(isPermanentlyGone(401), true);
});

test("a rate limit or a server error is NOT permanent", () => {
 // The whole danger of remembering failures is remembering a temporary one for ever. A throttle or
 // a bad gateway is the seller's site having a moment, and the asset is still there.
 for (const s of [429, 500, 502, 503, 504, 408]) assert.equal(isPermanentlyGone(s), false, String(s));
});

test("a network failure with no status is never treated as permanent", () => {
 // No answer at all is the least informative outcome there is. Our DNS, our timeout, her firewall —
 // recording that as "gone for ever" would quietly stop copying a live asset.
 assert.equal(isPermanentlyGone(null), false);
 assert.equal(isPermanentlyGone(0), false);
 assert.equal(isPermanentlyGone(undefined), false);
});

test("a success is obviously not gone", () => {
 for (const s of [200, 206, 301, 302]) assert.equal(isPermanentlyGone(s), false, String(s));
});
