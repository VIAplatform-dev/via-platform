import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLocationFromHeaders } from "./qr-scans-db.ts";

// The location on a scan row is only ever as good as what we pull out of Vercel's edge
// headers. Nothing downstream can fix a header read wrong, and the mistake is invisible —
// it looks like a scan that simply had no location. So the extraction is pinned here.

const headers = (h: Record<string, string>) => new Headers(h);

test("a production scan carries city, region, country and a pin", () => {
 const loc = scanLocationFromHeaders(
  headers({
   "x-vercel-ip-city": "Pasadena",
   "x-vercel-ip-country-region": "CA",
   "x-vercel-ip-country": "US",
   "x-vercel-ip-latitude": "34.1478",
   "x-vercel-ip-longitude": "-118.1445",
  })
 );
 assert.deepEqual(loc, {
  city: "Pasadena",
  region: "CA",
  country: "US",
  latitude: "34.1478",
  longitude: "-118.1445",
 });
});

test("a city with non-ASCII characters is decoded, not stored percent-encoded", () => {
 // Vercel percent-encodes these. Stored raw, the scan report would read "S%C3%A3o Paulo".
 const loc = scanLocationFromHeaders(headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" }));
 assert.equal(loc.city, "São Paulo");
});

test("a local scan has no location and does not blow up", () => {
 // No edge headers off Vercel. Every field must come back null rather than throwing —
 // a scan with unknown location still has to be recorded.
 const loc = scanLocationFromHeaders(headers({}));
 assert.deepEqual(loc, { city: null, region: null, country: null, latitude: null, longitude: null });
});

test("an empty or malformed header reads as unknown, not as a bad value", () => {
 const loc = scanLocationFromHeaders(
  headers({ "x-vercel-ip-city": "", "x-vercel-ip-country": "  ", "x-vercel-ip-latitude": "%E0%A4%A" })
 );
 assert.equal(loc.city, null);
 assert.equal(loc.country, null);
 // Undecodable, but it is a latitude-shaped field — kept as-is rather than crashing the scan.
 assert.equal(loc.latitude, "%E0%A4%A");
});

test("an absurdly long header cannot bloat the row", () => {
 const loc = scanLocationFromHeaders(
  headers({ "x-vercel-ip-city": "x".repeat(500), "x-vercel-ip-latitude": "9".repeat(500) })
 );
 assert.equal(loc.city?.length, 80);
 assert.equal(loc.latitude?.length, 24);
});
