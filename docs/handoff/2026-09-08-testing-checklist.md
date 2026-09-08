# VYA testing checklist (for a non-technical tester)

How to use: do each step, then mark it Works / Broken / Unclear. If Broken or Unclear, write one line about what you saw. Sign in with your normal store email (magic link). Use the test store Avishi gives you for anything that creates or changes pieces.

## 1. Sign in and Home
1. Sign in with your store email via the magic link → you land on Home, greeted by name.
2. Top of Home → a "Set up your store" card: one big next step with a button, and a "2/6"-style ring with the full list beside it. (If the store is fully set up, no card.)
3. Press the big button → you go straight to the page where that step is done.
4. On the "Connect your own domain" row press "skip" → the row hides; it never blocks setup.
5. Look at the tiles → Orders to ship, Offers to review, Live listings, plus only-when-needed tiles (Hold lapses today, Pieces without a photo, AI price to check, Pieces with no cost, Listed over 90 days). Tiles with nothing to do don't show.
6. Press an amber tile → the right page opens already filtered.
7. Net profit card → a real number (can be negative with a minus), each cost on its own line, or "No cost on record" with a prompt. Never a fake zero.
8. Switch Today / 7d / 30d / 90d → revenue and profit change together.

## 2. Left menu
9. Read the menu → "Add a piece" is top-level; "Payments" appears once; "Analytics" once; Storefront says "Site versions" (not "Drafts"); "Import your site" and "Abandoned carts" exist; no "Platform", "AI accuracy", "Golden set".
10. Open Settings → Payments, Shipping, Notifications, Locations, Policies, Domain, Marketplaces, Consignment, Apps & integrations are listed.
11. Open Cross-listing → two tabs: your listings and "Marketplace overview".

## 3. Inventory
12. Type part of a piece's name in the search box → the list filters; there is one search box.
13. Type nonsense → "No matches" shows, the box stays, Backspace brings pieces back.
14. Days column → live pieces show days listed; over 60 amber, over 90 rose; sold pieces show a dash.
15. Click the Days header → sorts by age; click again flips.
16. Press "Hold" on a live piece → a dialog asks for a name (optional) and Tonight / 3 days / A week / 2 weeks.
17. Confirm → status reads "On hold · <name> · 3 days left"; "Release hold" replaces "Hold".
18. Press "Release hold" → back to Live.
19. Open a piece's editor → fields: Cost (what you paid), Where it came from, Acquired on, Flaws list, Condition chips (Mint/Excellent/Very good/Good/Fair) with a note, Measurements for its category.
20. Add two flaws, a condition note, one measurement, save, reopen → all still there.
21. Tick three pieces → bar shows "Set cost" and "Set source / lot".
22. "Set source / lot" with a source, a date, a total cost → each piece has the source, date, and its share of the cost.
23. Home → "Pieces with no cost" tile → "Select all without cost" → "Set cost" → costs set, tile number drops.
24. Export → file has flaws, source, acquired, lot, days listed, condition note, measurements columns.

## 4. Add a piece (single and bulk)
25. "Add a piece" → add photos → "Fill the rest with AI" → title, brand, era, material, condition chips, category, description, price fill in; AI-noticed flaws appear as an editable list.
26. Under Condition and near Price → Flaws list, Cost (what you paid), Where it came from (past sources suggested), Acquired on.
27. "Ships as" names a parcel size with a weight. Type a much smaller weight than makes sense.
28. An amber warning explains: buyers get quoted the small tier, you pay the difference.
29. Publish → piece is Live in Inventory with flaws, cost, source, measurements.
30. Bulk upload → drop several photos → one card per piece; "Edit" on a card has the same Flaws, Condition chips + note, Measurements.
31. "This batch" box on the bulk page → Where these came from, Acquired on, "These N cost … total". Fill and finish.
32. Open two of those pieces → both carry the source, date, and a share of the cost.

## 5. The hard block: no ship-from address
33. On a store with no ship-from address, open Inventory → amber banner "Pieces can't go live yet. Add the address you ship from." with "Add address".
34. A draft's status pill reads "Draft · blocked".
35. Try to publish it → refused with the same message.
36. Add the address, come back → banner gone, pill says "Draft", publishing works.

## 6. Orders and parcels
37. Orders → top count says "parcels to post"; a multi-piece order from one buyer is one row listing every piece.
38. That row has one "Print label"/"Buy label" and one "Mark posted" for the whole bag.
39. "Mark posted" on a parcel → every piece moves to In transit together.
40. Buyer's inbox (test order) → one tracking email for the parcel listing every piece.
41. Add "?delivery=pickup" to the Orders URL → only in-person collections listed.

## 7. Customers
42. Open a customer → Notes box and Tags chips. Type a note, click away; add a tag "regular".
43. Reload → note and tag still there.
44. List filters: a tag chip, "Spent over", "Bought in" → list narrows, count updates, "Email these N" appears.
45. "Email these N" → campaign composer opens with "Who gets it" set to that group.
46. Export → file has tags and notes columns.

## 8. Settings
47. Settings › Shipping › "Your prices" → parcel sizes by zone; VYA defaults greyed; currency symbol matches the store.
48. Type a price, tab away → saves; "Reset to VYA's" appears on that row.
49. Type -1 → red message names the box; nothing saves.
50. Settings › Notifications → toggles: A piece sells, A buyer messages, An offer comes in, A payout lands, Daily summary, Weekly numbers, Something needs you; note that push needs the phone app.
51. Flip a toggle, reload → stays flipped.
52. Settings › Marketplaces (store with eBay) → block says whether instant sale notifications are on and when the last arrived.

## 9. Be a shopper on a VYA-built store (private window, not signed in)
53. Open a piece with flaws/condition/measurements → under Condition: grade with a one-line definition, the note, then a Flaws list. Under Size: measurements, and a line like "Marked IT 44 · about a US 8".
54. Near the price → "Ships to …" and "Shipping from £8 · free over £100" (absent if the store has no shipping set up).
55. In the workspace hold a piece; shopper window → the piece says "On hold", not "Sold".
56. Store home and shop pages → the held piece is still in the grid, badged "On hold".
57. Try to add the held piece to the bag → refused: "This piece is on hold for someone."
58. Release the hold, refresh → buyable again.
59. Add a normal piece, go to checkout, enter an address in a country the store ships to → shipping quoted in the store's currency at the owner's price.
60. Enter an address in a country the store doesn't ship to → told the store doesn't ship there.

## 10. The store importer
61. New store onboarding → two doors: "Bring your store over" and "Build from scratch".
62. "Bring your store over" + a Shopify/Squarespace address; wait → count of pages captured and products imported; buttons "Open it in the storefront builder", "View your site", "Go to dashboard".
63. "Open it in the storefront builder" → builder opens on a pixel-for-pixel copy. If asked to review pages side-by-side first, do it: original next to copy with a "looks right" choice.
64. Click a heading → a panel with the text editable. Change a word, save.
65. Click an image → replace by upload or from uploads.
66. Pages strip at the bottom → every captured page as a thumbnail, switches the editor.
67. "View live" → your text change is live; product grid shows imported products with live prices.
68. Open an imported product page as a shopper → buy button works; under it a details block with size line, measurements, condition, flaws, "Ships to" (whichever the owner filled in).
69. Hold an imported piece in the workspace → its page shows "On hold" instead of buy; grid card badged "On hold".
70. Add that held piece to the imported site's cart → message that it is on hold, not "sold".
71. Workspace Inventory for the imported store → imported products are there and editable.

## 11. Selling in person (Market Mode)
72. Turn on Market Mode → today's takings, pieces on the rack, Find item, Quick list, Sales today, card status.
73. Quick list → type a price only → piece appears in Inventory as a draft with that price.
74. Start a cash sale; cash screen has "Email a receipt" → enter your email, complete.
75. Inbox → receipt with store name, piece, amount, "cash", change if any.
76. Customers → you're listed with a tag like "market:<market name>".
77. Sales today → "Void" → confirmation explains (cash off the tin, piece back on the rack) → row reads "Voided · back on the rack"; piece is Live again.
78. "Void" again on the same row → nothing changes.

## 12. Phone app (ask Avishi for the test build)
79. Open the app, signed in as the test store → Home: greeting, takings, search box, "Set up your store" (if incomplete), tiles, "Needs you".
80. Search a piece's name → results with status inline (live / on hold / sold); tap opens it.
81. Inventory → photos, prices, ages like "14d" for pieces over a week old.
82. Home "Needs you" row like "pieces without a photo" → Inventory opens with the filter chip applied.
83. Open a live piece → "Hold for someone", name, "3 days" → "Held for <name> · 3 days left", "Release hold" offered.
84. "Edit" → title, price, cost, brand, size, condition, condition note, flaws, where it came from, acquired on, measurements; save, reopen → they stick.
85. "+" → photos → Details → loading screen names its steps and says about half a minute → Review with price, condition chips, flaws, "Ships as", measurements.
86. Leave the loading screen early, then Inventory › Drafts → the piece is there anyway.
87. "List it" from Review → Live in Inventory, once.
88. Orders → one card per parcel, "Mark as posted", a "Collections" tab.
89. Analytics → "Profit · 30 days" with each cost as a line, or "No cost on record".
90. Notifications (bell) → same toggles as the website; flip one, reopen, it stays.
91. Menu › Market Mode › Find item → camera → matches from the store's inventory with price and status; tap one starts a cash sale.
92. Market › Sales today → today's sales with "Void" each; status bar readable.
