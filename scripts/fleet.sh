#!/bin/zsh
# ONE unattended pass over every hosted store. No agents, no polling, no per-store hand-holding.
#
#   nohup scripts/fleet.sh > .verify/fleet.log 2>&1 &
#
# For each store, in order, one browser at a time:
#   1. repair   — pull the live feed; add missing items, fix sold/available, create every captured
#                 collection, re-sync membership (throttle-safe) and order. No crawl.
#   2. rehost   — copy theme assets to Blob and repoint pages (idempotent; no-op when done).
#   2b. photos  — copy PRODUCT photos to Blob. Must run AFTER repair: a repair writes the seller's
#                 own image URLs back over our copies, so this undoes that and hands nothing back.
#   3. blackout — load each key page normally and with Shopify blocked; report what's lost.
#   4. parity   — catalog / pages / shopper comparison against the seller's live site.
#   5. grade    — tier every finding (blocking / degrading / cosmetic), record the verdict for the
#                 seller's "Your hosted store" page (store_health) with the side-by-side screenshots.
# Then a census groups every finding by kind across stores (.verify/CENSUS.md).
# Everything lands in .verify/FLEET-REPORT.md (one row per store) plus per-store JSON and
# screenshots under .verify/<slug>/. The last line of the log says FLEET DONE.
set -u
cd "$(dirname "$0")/.."
R=.verify/FLEET-REPORT.md
mkdir -p .verify
# One roster, shared with every checker. Two captures are the same shop imported twice and are
# skipped — see app/lib/fleet-roster.ts for which and why.
STORES=$(node --env-file=.env.local --experimental-strip-types scripts/fleet-roster.mts --why 2>>"$R.skipped")

{
  echo "# Fleet report — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "| store | verdict | catalog | collections | pages | shopper (collection page) | blackout | notes |"
  echo "|---|---|---|---|---|---|---|---|"
} > "$R"

for s in ${=STORES}; do
  echo "══════ $s  $(date +%H:%M:%S)"
  node --env-file=.env.local --import tsx scripts/repair-store.mts "$s" 2>&1 | grep -E "products|membership|order|after:|feed:" | sed 's/^/   repair  /'
  node --experimental-strip-types --env-file=.env.local scripts/rehost-theme-assets.mts "$s" 2>&1 | grep -E "pages +[0-9]+ · assets|INCOMPLETE|Error" | sed 's/^/   rehost  /'
  # Product photos, AFTER the repair — a repair writes the seller's own image URLs back over our
  # copies, so copying before it would be undone. Skipping this step entirely is how 3,472 photos
  # sat on sellers' platforms while every record claimed they had been copied.
  node --experimental-strip-types --env-file=.env.local scripts/copy-product-photos.mts "$s" --write 2>&1 | grep -E "^done:|could not be fetched" | sed 's/^/   photos  /'
  node --experimental-strip-types --env-file=.env.local scripts/blackout-check.mts "$s" --port "${VERIFY_PORT:-3348}" --label fleet 2>&1 | grep -E "^/|→ " | sed 's/^/   gate    /'
  node --experimental-strip-types --env-file=.env.local scripts/parity-check.mts "$s" --port "${VERIFY_PORT:-3348}" 2>&1 | grep -E "^CATALOG|^          collections|^PAGES|products  present" | sed 's/^/   parity  /'

  node --experimental-strip-types --env-file=.env.local scripts/grade-store.mts "$s" --label fleet --publish 2>&1 | grep -vE "Warning|^\(node" | sed 's/^/   grade   /'

  # one row from the JSON the checks wrote
  node -e "
const fs=require('fs');const s=process.argv[1];const rd=(f)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return null}};
const p=rd('.verify/'+s+'/parity.json'), b=rd('.verify/'+s+'/blackout-fleet.json'), h=rd('.verify/'+s+'/health.json');
const verdict=h?(h.verdict.toUpperCase()+' ('+h.findings.filter(f=>f.tier==='blocking').length+' blocking, '+h.findings.filter(f=>f.tier==='degrading').length+' degrading)'):'—';
const c=p?.catalog||{}, pg=p?.pages||{};
const cat = c.productParityPct!==undefined ? c.productParityPct+'% ('+c.missingHere+' missing, '+c.availabilityMismatch+' avail)' : (c.platform||'?');
const col = c.collections!==undefined ? c.collectionsExact+'/'+c.collections+' exact' : '—';
const pages = pg.pageParityPct===null||pg.pageParityPct===undefined ? '—' : pg.pageParityPct+'%';
const sh = p?.shopper||{}; const key=Object.keys(sh).find(k=>k.includes('/collections/'))||Object.keys(sh)[0]; const v=key?sh[key]:null;
const shop = v&&!v.error ? 'titles '+v.titlesPresent+', order '+v.titlesInOrder+', prices '+v.pricesPresent : (v?.error?'load error':'—');
let bl='—', notes=[];
if(b){let ok=0,n=0;for(const [path,{normal,blackout}] of Object.entries(b.pages)){n++;if(!normal||!blackout||normal.error||blackout.error){notes.push(path+': no render');continue;}
 const l=[];if(blackout.imgsLoaded<normal.imgsLoaded)l.push('-'+(normal.imgsLoaded-blackout.imgsLoaded)+' imgs');if(normal.logoLoaded&&!blackout.logoLoaded)l.push('logo');if(normal.headerVisible&&!blackout.headerVisible)l.push('header');if(blackout.productLinks<normal.productLinks)l.push('-'+(normal.productLinks-blackout.productLinks)+' products');if(blackout.bgImagesShopify>0)l.push(blackout.bgImagesShopify+' bg');if(normal.videosPlaying>0&&blackout.videosPlaying<normal.videosPlaying)l.push('video');
 if(l.length)notes.push(path.slice(0,22)+': '+l.join(','));else ok++;}
 bl=ok+'/'+n+' pages survive';}
if(c.collectionsMissingHere?.length)notes.push('collections missing: '+c.collectionsMissingHere.slice(0,4).join(','));
fs.appendFileSync('$R','| '+s+' | '+verdict+' | '+cat+' | '+col+' | '+pages+' | '+shop+' | '+bl+' | '+notes.join('; ').slice(0,140)+' |\n');
" "$s"
done
node --experimental-strip-types scripts/census.mts
echo "══════ FLEET DONE  $(date +%H:%M:%S)"
echo >> "$R"; echo "_Done $(date '+%H:%M')._" >> "$R"
