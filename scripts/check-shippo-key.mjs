// Whose Shippo account is this key, and is it live or test?
//
//   node --env-file=.env.local scripts/check-shippo-key.mjs
//
// WHY IT EXISTS. A key arrived in .env.local that nobody remembered creating. There is no way to
// tell from the string itself whose account it belongs to, and the one thing you must not do to
// find out is paste it into a chat window or a search box. This asks Shippo instead, and never
// prints more than the first few characters.
//
// Run it after swapping a key: the carrier list is the fingerprint. A fresh test account shows
// Shippo's stock sandbox carriers; a real account shows the ones you actually connected.

const key = (process.env.SHIPPO_API_KEY || "").trim();
if (!key) {
  console.log("SHIPPO_API_KEY is not set.");
  process.exit(1);
}

const live = key.startsWith("shippo_live");
console.log(`key      ${key.slice(0, 13)}…  (${live ? "LIVE: real money" : "test: labels are free and fake"})`);

async function get(path) {
  const r = await fetch(`https://api.goshippo.com/${path}`, { headers: { Authorization: `ShippoToken ${key}` } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

const auth = await get("carrier_accounts?results=25");
if (!auth.ok) {
  console.log(`\nShippo refused it: ${auth.status} ${auth.body.detail ?? auth.body.error ?? ""}`);
  console.log("Check you copied the whole token, and that it matches the mode you meant.");
  process.exit(1);
}

const carriers = (auth.body.results ?? []).map((c) => `${c.carrier}${c.active ? "" : " (inactive)"}`);
console.log(`\ncarriers ${carriers.length ? carriers.join(", ") : "none connected"}`);

for (const [label, path] of [["labels bought", "transactions?results=1"], ["addresses", "addresses?results=1"]]) {
  const r = await get(path);
  const n = r.body.count ?? (r.body.results ?? []).length;
  console.log(`${label.padEnd(8)} ${r.ok ? n : `error ${r.status}`}`);
}

console.log(`\nWebhook to register in Shippo (API configuration → Webhooks):`);
console.log(`  event  transaction_updated`);
console.log(`  url    https://getvya.ai/api/webhooks/carrier?token=<CARRIER_WEBHOOK_SECRET>`);
console.log(`  mode   ${live ? "live" : "test"}, to match this key`);
