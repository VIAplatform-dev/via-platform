# Chrome Web Store — submission guide (VYA Cross-Lister)

Upload file: **`~/Downloads/vya-cross-lister.zip`** (regenerate anytime by zipping the *contents* of
`extension/` with `manifest.json` at the zip root).

## Steps
1. Go to **https://chrome.google.com/webstore/devconsole** and sign in with your Google account.
2. Pay the **one-time $5** developer registration (first time only, ever).
3. Click **"Add new item"** → upload `vya-cross-lister.zip`.
4. Fill in the store listing (copy below).
5. Set **Visibility → Unlisted** (installable via a direct link, hidden from search).
6. Submit for review. Approval is usually a few hours → a couple days; you'll get a "Published" email.
7. Share the install link with your stores — one click, no dev mode.

---

## Listing copy (paste these)

**Name:** VYA Cross-Lister

**Summary (≤132 chars):**
Cross-list your VYA inventory to Depop & Vestiaire from your own browser — and sync your likes back to VYA. No re-typing.

**Description:**
VYA Cross-Lister fills your Depop and Vestiaire Collective "sell an item" forms for you, using the listing
VYA already wrote — photos, description and price — right in your own logged-in browser session. You confirm
the marketplace's own fields (category, size, condition) and hit Publish. It also reads the likes on your own
listings and syncs them back to your VYA dashboard, so you see engagement everywhere in one place.

No marketplace passwords are ever stored or shared — the extension acts as you, on your own session. Built
for sellers on VYA (vyaplatform.com).

**Category:** Workflow & Planning (or Shopping)
**Language:** English

---

## Permission justifications (the review asks for each)
- **storage** — caches your listing queue + marketplace handles locally so the extension works offline/between pages.
- **tabs** — opens the marketplace's "create listing" page so it can be filled.
- **scripting** — injects your VYA-written listing content into that sell form.
- **Host access — vyaplatform.com** — reads *your own* listing queue from your VYA account (your session cookie).
- **Host access — depop.com, vestiairecollective.com** — fills *your own* sell form and reads *your own* listings' like counts.

## Data use disclosures (Privacy tab)
- **Single purpose:** Cross-list a seller's VYA inventory to Depop & Vestiaire from their own browser, and sync their listing engagement back to VYA.
- Does the extension collect user data? Only the seller's **own listing content + their own listings' public like counts**, transmitted between the seller's VYA account and the marketplaces they're logged into. **No** passwords, **no** selling of data, **no** data from other users. No remote/hosted code (all logic ships in the package).
- **Privacy policy URL:** use your existing one, e.g. `https://vyaplatform.com/trust` (or a dedicated `/privacy`).

---

## After it's live (the real remaining work)
Publishing makes it **installable**; the per-site form-field **selectors still need one live-DOM check**
(Depop + Vestiaire change their pages). Once installed: try one Depop and one Vestiaire listing; if a field
(photos / description / price) doesn't fill, paste the input's `outerHTML` and we harden the selector in
`src/content/depop.js` / `vestiaire.js` (the best-effort ones are marked in the `SEL = { … }` block). Then
bump the manifest version and re-upload — updates auto-push to installed users.
