# After round 3 — the to-do list

**Status 2026-08-30 afternoon: items 1, 1b, 2, 2b, 3 (code + backlog running), 4 and the section
headings are DONE.** What remains is listed under "Still open" at the bottom. Nothing is committed.

## Done today

| | result |
|---|---|
| **1.** Collections compared piece-by-piece, not by total | ascensio-demo 26/37 → **37/37**, blummier 34/38 → **38/38** |
| **1b.** Blackout blocks the seller's own domain | done — 7 assets across 6 stores, far smaller than first claimed |
| **2.** blummier's "missing" pieces | £0 archive display pieces; the collection check now excludes them as the catalogue check already did |
| **2b.** Sale prices carried through | we-thieves: 7 pieces on sale, Kon Dangle Earrings renders `$82.60` struck from `$120.00` |
| **3.** Product photos | copier no longer records failure as success; **loved-again went 0/3 → 3/3 pages surviving**; 643 markers cleared, ~3,500 photos copying |
| **4.** Collection ceiling 1,500 → 5,000 | and hitting it is reported instead of silent |
| **+** Product names counted as section headings | bag-crush headings 8/10 → **10/10**; also fixes chill-boutique, test-import-2, we-thieves |
| **+** The importer was undoing the photo copying | it wrote the seller's URLs back over our copies and kept the "copied" marker — we-thieves lost 163 items an hour after copying. A fleet run would have reversed all 3,472. Fixed, and fleet.sh now copies photos AFTER repair |
| **+** thenicheshop's "product links would stop working" | false. 40 → 35 tiles but 14 DIFFER; every piece that drops is active and in 4–6 other collections. Losing ALL products is blocking; losing some is degrading and worded honestly |
| **+** 47 "uncopied pages" on ascensio-demo | all `/ja/…` — the same pages in Japanese. **47 → 0, pages 100%** |
| **+** Stores we cannot check no longer pass silently | lei-vintage + montrose-edit (Squarespace) and vintage-boutique-style (unrecognised) produced no findings at all, so the last was round 2's ONLY pass. All three now WARN with "we couldn't check your product list" |

**Two bugs found in the fixes themselves, both the same shape as the ones being fixed:**
- The change-detection fingerprint did not include the markdown, so the first we-thieves re-sync
  reported "168 unchanged, 0 pieces on sale" while her site was running a sale. Third time that
  shortcut has hidden a change (resurrected pieces, then this).
- Two of the three diagnoses written into this file overnight were wrong — the blackout own-domain
  scale, and the cause of blummier's missing pieces. Both were inferred and written as fact without
  being tested. The fixes stand; the confidence did not.

---

## Still open

### Needs you, not me

1. **Nothing is committed.** Two days of work — every fix in this file — is uncommitted on
   `import/m0-capture-shim`. That is the biggest risk in the project right now.
2. **Register a Shopify app** and set `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`, with
   `/api/store/shopify-oauth/callback` allowlisted. Without it the connection work cannot start —
   the whole server side is built and unreachable.
3. **Decide the production domain shape.** If stores live under the marketplace's own domain, the
   "signed in here is not signed in there" boundary has to be enforced in code for ever; on a
   separate domain the browser enforces it for free.
4. **Decide whether a collection we could not read should be shown to the seller.** Currently silent.
   Turning it on changes verdicts fleet-wide.
5. **`FLEET_ENV_FILE`** secret, if you want the weekly fleet to run on GitHub instead of a laptop.

### Worth building next, in order

1. **The Shopify connection** — the button, and the seven `?shopify=` outcomes nothing renders. Half
   a day once the app exists, and it removes the cause of most bugs in this file rather than another
   symptom.
2. **The change-detection fingerprint.** It has now silently swallowed FOUR fixes: resurrected
   pieces, sale prices, photo markers, and the original stuck-sold bug. Each time the fix looked
   shipped and did nothing. It needs a proper answer, not a fifth field added to it.
3. **A Squarespace catalogue comparison** — the importer already reads Squarespace, so the two stores
   currently unmeasurable could be measured.
4. **lei-vintage's product page renders almost nothing** — `text 27 vs 425`, `imgs 0 vs 1` against
   ~7,900 characters on their real page. A real broken page, found once the checker could see it.
5. **The blackout check's real blind spots**: 3 pages gated out of 100+, viewport-only screenshots
   (blummier's home loses 28 photos and the picture looks identical), and no seller has ever actually
   cancelled — every "survives" verdict is a simulation.

### Deliberately not doing

- The "you may also like" strip differing (15 stores) — Shopify's recommendation engine, replaced by
  ours by design. Cosmetic, and should stay cosmetic.
- Menu-link and product-order differences — cosmetic, never gating.
- Capturing page 2+ of every collection. Fixing the collection reader shrank this to the handful of
  collections we genuinely cannot read.

---

## 2026-08-31 — sign-in and accounts on the hosted stores

**In a shopper's words.** She's on a seller's site, clicks the little person icon in the header,
types her email, and gets a link. Clicking it signs her in — to *that shop only* — and the same icon
now shows her name, her orders from that shop, and a way to sign out. No password, ever.

Verified in a real Chrome on all 23 stores: `scripts/verify-account.mts`. **23/23 clean.**

| Leg | What it proves |
|---|---|
| bag | one bag on screen, not two |
| icon | the seller's own account control is bound to our panel |
| panel | clicking it actually opens the panel |
| signin | the email box, the button and the message are wired to each other (request stubbed — no email is sent by a test run) |
| session | a valid link produces a signed-in page |
| orders | the endpoint knows her, and returns no seller-only field |
| signout | signing out actually ends the session |
| isolation | signing in at one shop does **not** sign her in at another |

Read-only by default: the signed-in legs mint the session cookie locally. `--follow-link` walks the
real email link instead, which writes a customer row, and is limited to one blessed store.

### Four bugs the browser caught that the HTML could not

1. **Two bags on every store.** The rule hiding our floating pill was correct; a *second* rule — the
   one that stops a seller's stylesheet hiding our cart drawer — was shouting `!important` and
   forcing the pill back. The rescue is now scoped: the pill is rescued only where it is the **only**
   way into the bag. (`suppress-theme-cart.ts`)
2. **The new account panel was eating the page's `<body>` tag.** It re-parsed the page as a fragment,
   which discards `<body>` and keeps its children — taking `data-vya-has-cart-control` with it, so
   the pill came back everywhere. Anything that re-parses a whole page must hand it back whole.
   (`account-control.ts`)
3. **Three stores had no account link a desktop shopper could reach** — awoke-vintage and
   sourcedbyscottie keep theirs in the mobile menu drawer, lamash inside the empty-cart panel. Bound
   correctly, invisible to everyone. The page now *measures* reachability in the browser
   (`getBoundingClientRect` + `elementFromPoint`, never class names) and adds our own icon beside her
   bag only when nothing of hers can be seen.
4. **The fallback's first home was inside a `display:none` drawer.** lamash's header never boots (its
   own theme modules 404), so the bound cart control is a 0x0 button inside a hidden drawer — and we
   dropped our icon in there with it. The host now passes the same reachability test.

The click is taken on `window`, in the capture phase, on `pointerdown` as well as `click`, with
`stopImmediatePropagation` — so a theme's own account drawer never half-opens behind our panel.

### Needs you, not me

- **lamash's header is broken independently of accounts.** Its theme's own modules 404 from blob
  storage (`account-dialog-*.js`, `store-*.js`) and one script fails with `Invalid regular
  expression flags`. Result: the header bag control renders 0x0. A shopper there reaches the bag
  through our drawer only. Worth a re-capture, and it is not an account bug.
- **Six stores have no account control at all** (lei-vintage, montrose-edit, shop-vintage-charm,
  thenicheshop, vintage-boutique-style, we-thieves) so they get no sign-in. Giving them one means
  adding an icon to a header that never had one — your call, and deliberately not done.

### Sign-in on every store, and the favourites heart (later on 2026-08-31)

Six stores had no account control at all and so no sign-in. They have one now: where a shopper can
reach a control of the seller's, hers opens our panel; where she has none, a small person icon of
ours sits bottom-right. **11 of 23 stores use ours** — seven have no account control in the live
page, four keep theirs somewhere unreachable.

**One place, not her header.** Three attempts at slotting our icon beside her bag all ended the same
way: where it landed in a header, it landed next to a person-shaped icon she already had. We cannot
know what her other glyphs mean, so ours goes in the same corner on every store, above the bag pill,
and steps up the right edge (or across to the left) if something else is parked there — one store
runs a chat widget bottom-right that covered it completely.

**"Powered by VYA" moved into the seller's footer**, set in her own typeface above a hairline. It is
no longer pinned over her layout. Its guard is now a marker attribute: the old substring guard on
`vya-powered` was tripped by the account script *mentioning* the class, and the badge silently
vanished from every store.

**Three stores wore a person glyph on their favourites link** (we-thieves, thenicheshop,
sourcedbyscottie) — the same icon a shopper reads as "my account". Those now show an outlined heart.
`favourites-icon.ts` replaces only the glyph, keeps her class so the icon stays the size of the ones
beside it, and forces `fill:none` in an inline style because one theme's stylesheet was filling it
solid. A theme that has NAMED its icon a heart, star or bookmark is left alone.

Evidence: `scripts/verify-account.mts` — 23/23 clean. Screenshots of every one of these, per store,
in the review page published to the user on 2026-08-31.

**Correction, same day: three headers are built in JavaScript, and we were only binding on the
server.** The user spotted person icons still in the headers of lamash, ange-archive and
vintage-archives-la. Shopify's newer themes create `<button class="account-button">` on hydration —
it is not in the HTML we receive — so hers stayed unbound, our reachability check found nothing, and
a shopper got her icon AND our corner button.

Three changes, all in `account-panel.ts` / `account-control.ts`:
- **The page binds in the browser as well as on the server**, using the SAME selector list, exported
  rather than retyped so the two cannot drift.
- **`shopify-account` is bound as a control in its own right.** lamash's icon is inside that web
  component's shadow DOM, where no selector reaches it. A click inside a shadow root is retargeted
  to the host on the way out, so binding the host catches it and the window capture stops the event
  before the component's own handler runs.
- **A debounced MutationObserver**, because a fixed schedule (load, 1.5s, 4s) is still a guess. Any
  DOM change can alter whether a shopper can reach her account link.

Stores needing an icon of ours: **11 → 8**. Sweep still 23/23.

Separately confirmed and NOT fixed: `theme/lamash/account/store-BTEHG3Hd.js` really is a 404 in blob
storage. lamash's theme drops several modules on the floor in production, not only locally.

### 2026-08-31, later — what "missing products" actually meant, and the fleet is 21 stores

**Six stores were failing on products nobody could buy.** "Missing" meant "in her feed, not in ours",
graded blocking. Named them all and every single one was a piece she had **sold and not deleted**, or
a **pre-order she never photographed**. bag-crush's 33: all either no photo + nothing available, or
no price + nothing available. ange-archive's one is a product literally titled "test", $1, no photo.

`app/lib/catalog-parity.ts` now asks the question the way a shopper would — could I buy this today?
— which needs a variant that is BOTH available and priced, plus a photo to render at all. Three
answers instead of one:
- **missing** (blocking): buyable, photographed, absent from ours.
- **no photo** (degrading, HERS to fix): in stock and priced, no image on her own site. feathers'
  seven are real pieces at £188–£695 with no photograph anywhere.
- **sold or unlisted**: left out on purpose, never a fault.

Verified: bag-crush 9 → **0**, feathers 7 → **0**, thenicheshop 3 → **0**.

Findings now NAME the products with links (`missingProducts`), not just a count. "9 products
missing" with no list cost an afternoon of re-deriving it from the seller's own feed.

**The fleet is 21 stores.** `test-import` is a second import of the-objects-of-affection and
`test-import-2` of bag-crush — same feeds, same 33 skipped pieces. One roster
(`app/lib/fleet-roster.ts`) shared by fleet.sh, census.mts and verify-account.mts, each exclusion
carrying its reason. The REAL store stays even when the copy grades better: test-import passes clean
while the-objects-of-affection carries the one finding that matters.

**Also fixed:**
- **Collection pages rendering one product per row** (hachi-archive /collections/prada, 36,049px
  tall). With no captured grid to reuse, the fallback dropped our grid straight after the `<h2>` —
  and that theme puts its heading in a narrow title column. Now placed after the heading's block,
  inside the theme's own page-width wrapper. 36,049px → 7,893px, five across.
- **Buy buttons that disagree with each other** (`button-parity.ts`): blummier's Enquire rendered at
  25.6px/59px beside an Add to cart at 13px/49px — same classes, same parent, matched on her own
  site. The group is made to agree with itself in the browser, taking the smaller.
- **Product pages were missing this whole week's work.** They are served by a DIFFERENT route from
  every other page, which had no account panel, no favourites heart and no footer badge. Its own
  code carries a comment warning about exactly this trap from a previous bug.
- **Comparison screenshots were photographs of the seller's newsletter popup**
  (`dismiss-overlays.ts`). Ours never has one, so every such pair looked like a difference we caused.
  Dismissed AFTER every number is read, so nothing measured changes.
