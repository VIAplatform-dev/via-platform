// Run the membership step alone against the real store, with A + B + the read deadline in place.
import { syncCollectionMembership } from "../app/lib/capture-commerce.ts";
const t = Date.now();
const r = await syncCollectionMembership("2nd-street-shop", "ec.2ndstreetusa.com", []);
console.log(`\nmembership step finished in ${Math.round((Date.now() - t) / 1000)}s`);
console.log(`  collections touched: ${r.collections}`);
console.log(`  links written:       ${r.links}`);
for (const w of r.warnings) console.log(`  ! ${w.slice(0, 160)}`);
