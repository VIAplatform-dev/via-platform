export const stores = [
 {
 slug: "ange-archive",
 dashboardToken: "aa-2c7e1d4f8b9a",
 name: "Ange Archive",
 location: "New York, NY",
 description:
 "Ange Archive is a NYC based vintage boutique founded by two besties Simi and Chay. The shop focuses on iconic vintage pieces, the ones you always see saved, screenshotted, and obsessed over. Vintage Fendi baguettes, iconic Chanel, the perfect balance between trending and timeless. Bringing your Pinterest boards to life. Everything is sourced internationally and chosen for how it feels, not just what it is. Because every angel deserves something cool… a piece of Ange Archive.",
 website: "https://angearchive.com",
 contactEmail: "info@angearchive.com",
 dataSource: "ange-archive",
 image: "/stores/ange-archive.jpg",
 logo: "/stores/ange-archive.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "111",
 collabsStoreId: "239342",
 authenticityPolicy:
 "Every piece at Ange Archive is personally sourced internationally by Simi and Chay and chosen for how it feels, not just what it is. Each item is carefully inspected and accurately described before listing.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a vintage boutique specializing in one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "ascensio-vintage",
 dashboardToken: "av-2b7c9d1e4f8a",
 name: "Ascensio Vintage",
 location: "London, UK",
 description:
 "Ascensio's goal is to push away from fast-moving trends and unethically produced fast fashion, championing timeless style that transcends the decades. Its ethos centers on delivering authentic brands while promoting sustainable shopping, celebrating the beauty of pre-loved and archival pieces from the most well-known and loved brands. Each item is thoroughly checked by the team, ensuring quality and authenticity.",
 website: "https://ascensiovintage.com",
 dataSource: "ascensio-vintage",
 image: "/stores/ascensio-vintage.jpg",
 logo: "/stores/ascensio-vintage-logo.jpg",
 logoBg: "#ffffff",
 currency: "GBP",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "1234",
 collabsStoreId: "228601",
 authenticityPolicy:
 "We authenticate items through a rigorous process, examining labels, stitching, hardware, and historical design details. Our team cross-references pieces with archival records and works with industry experts to ensure every designer item is genuine.",
 shippingPolicy:
 "Ships from Shropshire, England. Shipping rates and delivery times are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "Items can be returned for a full refund provided they are sent back within 7 days in the same condition they were received, with tags attached. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "bag-crush",
 dashboardToken: "bgc-4e2d8f1a9c7b",
 name: "Bag Crush",
 location: "California",
 description:
 "Bag Crush was born from a love of iconic design and the thrill of the find. Passionate about making designer bags more accessible, the mission is to empower fashion lovers to shop smart, sustainably, and stylishly through curated resale. With authenticity, transparency, and a little bit of obsession — redefining what it means to crush on a bag.",
 website: "https://mybagcrush.com",
 contactEmail: "info@shopbagcrush.com",
 dataSource: "bag-crush",
 image: "/stores/bag-crush.jpg",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "241124",
 authenticityPolicy:
 "Every bag at Bag Crush is personally sourced and curated with authenticity and transparency as the bare minimum. Each piece is carefully inspected and accurately described before listing, so you can shop designer resale with complete confidence.",
 shippingPolicy:
 "Ships from California. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "blodas-choice",
 dashboardToken: "bc-3d7a1e9f4c2b",
 name: "Bloda's Choice",
 location: "New York, NY",
 description:
 "Anna Bloda — NYC-based photographer, model, and vintage collector. Born in Poland in 1975, she studied art and photography and discovered her love for fashion while styling her models. Moving to New York City opened a new chapter: the world of vintage became her playground. Her curated finds became Bloda's Choice, a Chinatown boutique celebrating quality, color therapy, and self-expression. With a Y3K lens and an eye for the unusual, Anna transforms timeless pieces into art, making her a legend in fashion and photography.",
 website: "https://blodaschoice.com",
 dataSource: "blodas-choice",
 image: "/stores/blodas-choice.jpg",
 logo: "/stores/blodas-choice-logo.png",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "230978",
 authenticityPolicy:
 "Every piece at Bloda's Choice is personally sourced and hand-selected by Anna — a photographer, model, and lifelong collector with a Y3K lens and an eye for color therapy, character, and the unusual. Each item is chosen for its story and quality, accurately described so you always know exactly what you're getting.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted within 30 days of receipt. Items must be unworn, unused, with tags attached and in original packaging. Sale items are final sale. Refunds are issued to the original payment method once the return is approved. Contact info@blodaschoice.com to initiate a return.",
 },
 {
 slug: "blummier",
 dashboardToken: "bl-6a4f2e9c8b1d",
 name: "Blummier",
 location: "London, UK",
 description: "",
 website: "https://blummier.com",
 contactEmail: "blummier@gmail.com",
 dataSource: "blummier",
 image: "/stores/placeholder.svg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "GBP",
 // Blummier runs Shopify Markets: its products.json is served to our US-based sync ALREADY in
 // USD (the same price US shoppers see on blummier.com), so the product feed must NOT be
 // re-converted from GBP. `currency` above stays GBP for orders/commissions (which do arrive in
 // GBP via Collabs/webhooks); `feedCurrency` overrides only the product-catalog conversion.
 feedCurrency: "USD",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "247860",
 authenticityPolicy:
 "Every piece at Blummier is personally sourced and hand-selected before listing. Items are accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Ships from London, UK. Shipping rates and delivery times are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "california-boho-studio",
 dashboardToken: "cbs-4e8b2f1a9c7d",
 name: "California Boho Studio",
 location: "San Francisco, CA",
 description:
 "California Boho Studio was founded by Charlette, a California native and lifelong vintage hunter who started the Studio out of a love for fashion and the thrill of the hunt — sourcing rare pieces for others the way she always has for herself.\n\nBuilt on that California energy of contrast, culture, and creativity, the Studio is about individuality without limits — vintage or modern, minimal or bold, never about following a rule. A maximalist at heart, Charlette is drawn to rare, one-of-a-kind pieces from discontinued and luxury houses like Bracher Emden and El Dantés, alongside bold names like Cavalli, Galliano-era Dior, and Y2K Baby Phat. Every piece is handpicked, something she'd wear herself, and every piece comes with a story.",
 website: "https://californiabohostudio.com",
 dataSource: "california-boho-studio",
 image: "/stores/california-boho-studio.jpg",
 logo: "/stores/california-boho-studio.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "243222",
 authenticityPolicy:
 "Every piece at California Boho Studio is personally handpicked and inspected by founder Charlette, a lifelong vintage collector with an eye for rare, one-of-a-kind pieces. Each item is something she'd wear herself, accurately described with full condition details so you always know exactly what you're getting.",
 shippingPolicy:
 "Ships from San Francisco, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each piece is hand-selected and personally inspected by Charlette. Please review all item details and photos carefully before purchasing — email hello@californiabohostudio.com with any pre-purchase questions.",
 },
 {
 slug: "capsule-edit",
 dashboardToken: "ce-7d3a9c1f5e8b",
 name: "Capsule Édit",
 location: "Melbourne, Australia",
 description:
 "Capsule Édit believes luxury should be timeless, not disposable. Capsule Édit is a curated collection of vintage and pre-owned designer pieces, selected for their design, quality craftsmanship, and long-term wearability.\n\nThe shop prioritises intention over excess. Choosing pieces that are not trends and are designed to be worn, loved, and passed on. By extending the life of its finds, Capsule Édit supports a more conscious approach to fashion and helps reduce unnecessary waste.\n\nFor the selective collector who values quality over quantity, rarity over mass production, and timeless style over everchanging fashion.",
 website: "https://capsuledit.com",
 contactEmail: "capsuledit@gmail.com",
 dataSource: "capsule-edit",
 image: "/stores/capsule-edit.jpg",
 logo: "/stores/capsule-edit.jpg",
 logoBg: "#ffffff",
 // Capsule Édit is based in Melbourne but their Shopify base currency is
 // USD (their site auto-displays USD via Shopify Markets). The products.json
 // API returns USD numbers — so no conversion needed.
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "242449",
 authenticityPolicy:
 "Every piece at Capsule Édit is curated for design integrity, quality craftsmanship, and long-term wearability. Each item is carefully selected and accurately described so collectors can shop with confidence.",
 shippingPolicy:
 "Ships from Melbourne, Australia. International shipping available — rates calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated vintage and pre-owned designer boutique, each piece is one-of-a-kind. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "carroll-street-vintage",
 dashboardToken: "csw-9f2a4c8e1b7d",
 name: "Carroll Street Vintage",
 location: "Brooklyn, NY",
 description:
 "Carroll Street Vintage is a Brooklyn-based vintage shop offering a thoughtfully curated selection of pre-loved clothing and accessories. Each piece is hand-selected with an eye for quality, character, and timeless style.",
 website: "https://carrollstreetvintage.com",
 dataSource: "carroll-street-vintage",
 image: "/stores/carroll-street-vintage.jpg",
 logo: "/stores/carroll-street-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "custom-webhook" as const,
 authenticityPolicy:
 "Every piece at Carroll Street Vintage is personally sourced and inspected before listing. Items are accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "chill-boutique",
 dashboardToken: "cb-3f1a9d6e2c8b",
 name: "Chill Boutique",
 location: "Fountain Hills, AZ",
 description:
 "Chill Boutique is an upscale women's consignment boutique with a Western soul. Nestled in Fountain Hills, AZ, Chill offers a premier selection of designer, vintage, and desert-inspired fashion. The boutique is on a mission to re-home pre-loved gems from Arizona's most stylish women. Whether you're hunting for a high-end label or a one-of-a-kind vintage piece, your next find is waiting here.",
 website: "https://chillboutiqueconsignment.com",
 dataSource: "chill-boutique",
 image: "/stores/chill-boutique.jpg",
 logo: "/stores/chill-boutique.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIYAPLATFORM",
 collabsStoreId: "191049",
 authenticityPolicy:
 "Every designer and vintage item at Chill Boutique is personally inspected and authenticated by their expert team before being listed for sale. Items are thoroughly reviewed for condition, authenticity, and accurate description so you can shop with confidence.",
 shippingPolicy:
 "Ships from Fountain Hills, AZ. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing. Use the form below if you have any questions before buying.",
 },
 {
 slug: "chomp-chomp-vintage",
 dashboardToken: "ccv-4e8b2f1a9d3c",
 name: "Chomp Chomp Vintage",
 location: "London, UK",
 description:
 "Chomp Chomp started with a genuine love for clothing and grew from there. Based in London, the shop focuses on giving vintage a second life. Chomp Chomp digs through the past so you can wear something better than whatever everyone else has on.",
 website: "https://chompchompvintage.com",
 contactEmail: "chompchompvintage@gmail.com",
 dataSource: "chomp-chomp-vintage",
 image: "/stores/chomp-chomp-vintage.jpg",
 logo: "/stores/chomp-chomp-vintage.jpg",
 logoBg: "#ffffff",
 // Seller relisted prices in USD on their store, so no FX conversion is needed.
 // (Was "GBP", which double-counted: a $750 listing showed as ~$993.)
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "235622",
 authenticityPolicy:
 "Every item at Chomp Chomp Vintage is personally sourced and carefully inspected before listing. Each piece is accurately described so you can shop with confidence.",
 shippingPolicy:
 "Ships from London, UK. Shipping rates and delivery times are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "Returns accepted on unworn items with tags in original packaging — refunds are issued to your original payment method within 10 business days of approval (EU customers have a 14-day right to cancel). Sale items and gift cards are non-returnable.",
 },
 {
 slug: "club-fleur",
 dashboardToken: "cf-7a2d9e1b4c8f3",
 name: "Club Fleur Vintage",
 location: "Washington, DC",
 description:
 "A club where vintage blooms. Club Fleur Vintage offers a romantic take on designer vintage. Based in Washington, DC, Club Fleur features a thoughtful curation of iconic accessories, reworked floral heels, and distinctive pieces with presence — including coveted designers like Manolo Blahnik and Jimmy Choo, and statement shoes Carrie Bradshaw would die for — each selected for its craftsmanship, character, and ability to bring individuality and story into a modern wardrobe.",
 website: "https://clubfleurvintage.com",
 dataSource: "club-fleur",
 image: "/stores/club-fleur.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "CLUBFLEURXVYA",
 collabsStoreId: "231864",
 authenticityPolicy:
 "Every piece at Club Fleur Vintage is personally sourced and hand-selected for its craftsmanship, character, and romantic presence. Specializing in iconic designer accessories and shoes — Manolo Blahnik, Jimmy Choo, and beyond — each item is carefully inspected and accurately described before listing.",
 shippingPolicy:
 "Ships from Washington, DC. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted for store credit on clothing and shoe items within 7 days of delivery, provided the item is returned in its original condition. Some pieces are marked final sale — this is noted in the item's listing. Use the form below or email theclubfleur@gmail.com with any pre-purchase questions.",
 },
 {
 slug: "dayton-jane",
 dashboardToken: "dj-123456789",
 name: "Dayton Jane",
 location: "Connecticut",
 description: "Dayton Jane is a curated lifestyle boutique inspired by the intersection of New York City sophistication and the timeless charm of New England living. The collection brings together preloved fashion and thoughtfully sourced home décor, each piece selected for its quality, character, and enduring style.",
 website: "https://www.daytonjane.com",
 dataSource: "dayton-jane",
 image: "/stores/dayton-jane.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "231648",
 authenticityPolicy:
 "Every piece at Dayton Jane is personally sourced and curated, drawing on an eye for the intersection of New York City sophistication and New England timelessness. From pre-loved fashion to thoughtfully selected home décor, each item is inspected and described with full condition details before listing.",
 shippingPolicy:
 "Ships from Connecticut. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted within 14 days of receipt for a full refund to your original payment method, provided items are unworn with tags attached. Items marked FINAL SALE cannot be returned. If your item arrives significantly different from its description, contact jacquelyne.rankin@gmail.com within 48 hours of delivery with photos.",
 },
 {
 slug: "dear-muse",
 dashboardToken: "dm-5a9c2e7f1b4d",
 name: "Dear Muse",
 location: "Los Angeles, CA",
 contactEmail: "rachel.dearmuse@gmail.com",
 description:
 "Dear Muse is built on the belief that fashion should feel personal, not mass-produced. With over 15 years in the industry, she curates rare, era-defining handbags. Every handbag is sourced with intention for their craftsmanship, history, and emotional impact. Dear Muse invites you to move beyond trends and find pieces that feel like you — distinct, expressive, and entirely your own.",
 website: "https://shopdearmuse.com",
 dataSource: "dear-muse",
 image: "/stores/dear-muse.jpg",
 logo: "/stores/dear-muse.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "1111",
 collabsStoreId: "237672",
 authenticityPolicy:
 "100% Authenticity Guaranteed\n\nEvery piece offered by Dear Muse undergoes an authentication process conducted by trusted third-party experts — the same industry-recognized services used by platforms such as eBay and Vestiaire Collective. Some items may include a physical authentication card or certificate, while others will have digital verification records. Regardless of format, every purchase is fully backed by our Authenticity Guarantee.\n\nFor additional photos, videos, or questions about this piece, please contact rachel.dearmuse@gmail.com or send a message on Instagram at @__dearmuse. I'm always happy to provide further details.",
 shippingPolicy:
 "Ships from Los Angeles, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated vintage handbag boutique, every piece is one-of-a-kind. Please review all item details and photos carefully before purchasing. Contact rachel.dearmuse@gmail.com with any pre-purchase questions.",
 },
 {
 slug: "edited-archive",
 dashboardToken: "ea-5c2b8f1a9d7e",
 name: "Edited Archive",
 location: "New York, NY",
 description:
 "Edited Archive is a New York–based curated vintage shop offering a thoughtfully selected collection of pre-loved and archival pieces. Each item is hand-picked for its quality, character, and lasting appeal.",
 website: "https://editedarchive.com",
 contactEmail: "francesca.m.alfano@gmail.com",
 dataSource: "edited-archive",
 image: "/stores/placeholder.svg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "238926",
 authenticityPolicy:
 "Every piece at Edited Archive is personally sourced and hand-selected before listing. Items are accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "for-the-globe",
 dashboardToken: "ftg-2c8a1e5d9b3f",
 name: "For The Globe",
 location: "Richmond, VA",
 description:
 "For The Globe is a Richmond, VA based vintage studio. Founded by Abbey Miller in 2020, its mission is to provide vintage enthusiasts with a carefully curated collection of high-quality, unique and sustainable clothing and decor from around the globe. For The Globe aims to spread its appreciation for vintage treasures + attainable designer fashion, while also encouraging a more conscious approach to style. Through a commitment to looking good while doing good for the globe, the studio strives to be the go-to destination for those seeking pieces for an always stylish, globe-conscious wardrobe.",
 website: "https://shopfortheglobe.com/VYA",
 dataSource: "for-the-globe",
 image: "/stores/for-the-globe.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "232048",
 authenticityPolicy:
 "Every piece at For The Globe is hand-selected by Abbey from vintage markets and sources around the globe — curated with a commitment to quality, sustainability, and conscious style. Each item is carefully inspected and accurately described before listing, with any notable condition details disclosed.",
 shippingPolicy:
 "Ships from Richmond, VA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. If your item arrives significantly different from its description or arrives damaged, use the form below within 48 hours of delivery.",
 },
 {
 slug: "front-page-finds",
 dashboardToken: "fpf-6c2e9a1d4b7f3",
 name: "Front Page Finds",
 location: "San Francisco, CA",
 description:
 "Front Page Finds is a San Francisco–based vintage shop specializing in curated designer handbags that feel both current and archival. Inspired by the enduring nature of print, the collection focuses on pieces that transcend time. Each bag is selected for its craftsmanship, relevance, and lasting appeal.",
 website: "https://frontpagefinds.com",
 dataSource: "front-page-finds",
 image: "/stores/front-page-finds.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "232498",
 authenticityPolicy:
 "Every bag is meticulously reviewed and authenticated using Entrupy and/or CheckCheck before listing, giving you complete peace of mind with every purchase.",
 shippingPolicy:
 "Ships from San Francisco, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "hachi-archive",
 dashboardToken: "ha-6d3f2b9e1c7a",
 name: "Hachi Archive",
 location: "New York, NY",
 description:
 "Hachi Archive is a leading destination for pre-owned luxury fashion — carefully curated, every piece authenticated, and priced to be within reach. From its online collections to its NYC pop-up events, Hachi Archive has built a reputation for quality and authenticity with a dedicated and growing customer base. Driven by circularity, the brand is committed to making curated designer fashion accessible.",
 website: "https://hachiarchive.com",
 contactEmail: "patricia@hachiarchive.com",
 dataSource: "hachi-archive",
 image: "/stores/hachi-archive.jpg",
 logo: "/stores/hachi-archive.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "239937",
 authenticityPolicy:
 "Every piece at Hachi Archive is carefully curated and authenticated before listing. Each item is accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "honey-bear-vintage",
 dashboardToken: "hbv-4e2a8f1c9d7b",
 name: "Honeybear Vintage",
 location: "New York, NY",
 description:
 "Honeybear Vintage comes to you from Morgan Muno and Liz Marino. Just like their friendship (started in Copenhagen, maintained long distance between Oregon and Madrid, and now based in NYC!), their items span decades and occasions, with an emphasis on size variety and quality materials that could live in your closet forever. It's their way of building a place where strangers can become friends in a few hours, where you can find the effortless kindness of bathroom line banter next to the perfect dress for your friend's wedding.",
 website: "https://honeybearvintagenyc.square.site/",
 dataSource: "honey-bear-vintage",
 image: "/stores/honey-bear-vintage.jpg",
 logo: "/stores/honey-bear-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "square-manual" as const,
 authenticityPolicy:
 "Every piece at Honeybear Vintage is personally sourced by Morgan and Liz with an emphasis on size variety and quality materials built to last. Each item is carefully inspected and accurately described before listing — so you can find something effortless that lives in your closet forever.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. If there's an issue with your order, reach out to honeybearvintagenyc@gmail.com and the team will do their best to help.",
 },
 {
 slug: "house-on-a-chain",
 dashboardToken: "hoac-2f7e1b9d4c3a",
 name: "House on a Chain",
 location: "London, UK",
 description:
 "House on a Chain is a London-based curated vintage store specialising in rare archival designer and elevated wardrobe pieces, built around the idea of continuity — garments moving from one hand to another and becoming part of a new story. The name carries a double meaning: a playful, confident tone intended to feel empowering, while referencing the fashion houses behind each piece and the chain of ownership that allows garments to move from one life to the next. The curation centres on 90s and early 2000s luxury, from Galliano-era Dior and Prada to Chanel and La Perla, chosen for craftsmanship, femininity and elevation.",
 website: "https://www.houseonachain.com",
 dataSource: "house-on-a-chain",
 image: "/stores/house-on-a-chain.jpg",
 logo: "/stores/house-on-a-chain-logo.jpg",
 logoBg: "#f5f3f0",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIA-7",
 collabsStoreId: "230455",
 authenticityPolicy:
 "Every piece at House on a Chain is sourced from trusted vintage dealers, collectors, and archival resale markets — then authenticated and evaluated for condition before listing. The curation centres on rare 90s and early 2000s luxury — Galliano-era Dior, Prada, Chanel, La Perla — chosen for femininity, craftsmanship, and elevation.",
 shippingPolicy:
 "Orders ship from London, UK. Shipping rates and delivery times are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "in-a-past-life",
 dashboardToken: "iapl-450f3dbaca86",
 name: "In a Past Life",
 location: "Detroit, MI",
 description:
 "In a Past Life is a love letter to vintage. An ode to the craftsmanship, artistry, and timeless silhouettes found in treasures from another era. Each piece is hand-picked in Europe with intention, guided by an appreciation for character, history, and thoughtful design. Drawn to the dreamy, romantic, and beautifully made, In a Past Life curates finds that transcend time, pieces with past lives ready to be loved again.",
 website: "https://www.inapast.life",
 contactEmail: "inapastlife.xo@gmail.com",
 dataSource: "in-a-past-life",
 image: "/stores/in-a-past-life.jpg",
 logo: "/stores/in-a-past-life.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "squarespace-manual" as const,
 authenticityPolicy:
 "Every piece at In a Past Life is hand-picked in Europe and inspected before listing — chosen for its character, history, and craftsmanship, and accurately described so you can shop with confidence.",
 shippingPolicy:
 "Ships from Detroit, MI. Shipping rates are calculated at checkout.",
 returnPolicy:
 "As a vintage boutique specializing in one-of-a-kind pieces, please review all item details and photos carefully before purchasing. If your item arrives significantly different from its description, reach out within 7 days of delivery and we'll review.",
 },
 {
 slug: "jade-vintage",
 dashboardToken: "jv-6c2e8a4f1b9d",
 name: "Jade Vintage",
 location: "Toronto, Canada",
 description:
 "Jade Vintage is a curated e-commerce business based in Toronto, Canada specializing in small-batch collections of rare, authenticated pre-loved designer pieces, including Balenciaga City bags, Chanel Classic Flaps, and other timeless vintage styles. Beyond sourcing, the brand prioritizes building strong client relationships through education—guiding customers on how to shop smarter, invest in quality, and make more conscious purchasing decisions. Rooted in expertise, transparency, and considered curation, Jade Vintage makes luxury more accessible while championing a slower, more intentional approach to fashion—where each piece is chosen with purpose and worn with meaning.",
 website: "https://jadevintage.ca",
 dataSource: "jade-vintage",
 image: "/stores/jade-vintage.jpg",
 logo: "/stores/jade-vintage.jpg",
 logoBg: "#ffffff",
 currency: "CAD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "233878",
 authenticityPolicy:
 "Every piece at Jade Vintage is personally authenticated and carefully inspected before listing. Specializing in rare designer pieces — Balenciaga City bags, Chanel Classic Flaps, and archival luxury — each item is sourced with expertise and described with full transparency so you can shop with confidence.",
 shippingPolicy:
 "Ships from Toronto, Canada. Shipping rates are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "keepin-it-real-luxe",
 dashboardToken: "kirl-5f3a9c2e1d7b",
 name: "Keepin It Real Luxe",
 location: "San Francisco, CA",
 description:
  "They say fashion is a passion, but for the founder, it's always been a lifestyle. For years, she lived in that relatable tug-of-war: a deep, unshakeable love for designer craftsmanship versus the reality of adulting. Life happens—bills, family, and long-term commitments naturally took the driver's seat when it came to where her paycheck went. But while her budget was being responsible, her soul was still craving that specific rush that only luxury fashion provides. She realized she didn't just want what was 'trending' on a department store shelf. She wanted the pieces with a story. She craved the rare, the hard-to-find, and the 'how did you get your hands on that?' items that define a personal collection. She started Keepin' It Real Luxe to bridge that gap for people just like her. She spent years mastering the art of the 'luxe budget'—learning how to source authentic, rare designer pieces without compromising her financial priorities.",
 website: "https://www.keepinitrealluxe.com",
 contactEmail: "info@keepinitrealluxe.com",
 dataSource: "keepin-it-real-luxe",
 image: "/stores/keepin-it-real-luxe.jpg",
 logo: "/stores/keepin-it-real-luxe.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "squarespace-manual" as const,
 authenticityPolicy:
  "Every piece at Keepin' It Real Luxe is personally sourced and authenticated before listing. Each item is hand-selected with years of expertise in sourcing authentic, rare designer pieces — accurately described so you can shop with confidence.",
 shippingPolicy:
  "Ships from San Francisco, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
  "Although sales are generally considered final, a return request can be made within 7 days of delivery if you are not completely satisfied or feel the item is not as pictured. Items must be returned in original condition with tags, and requests are reviewed case-by-case. Use the form below with any pre-purchase questions.",
 },
 {
 slug: "lamash",
 dashboardToken: "lm-6a3f9c2e8d1b",
 name: "Lamash",
 location: "Sheffield, UK",
 description:
 "Based in the UK, Lamash is a curated vintage store specialising in designer pieces sourced through years of experience across the UK and Paris. The collection celebrates fun, confident dressing — offering everything from effortless everyday staples to statement event wear, with a focus on timeless vintage that feels unique, wearable, and effortlessly sexy.",
 website: "https://lamash-store.myshopify.com",
 dataSource: "lamash",
 image: "/stores/lamash.jpg",
 logo: "/stores/lamash.jpg",
 logoBg: "#ffffff",
 currency: "GBP",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "247333",
 authenticityPolicy:
 "Every piece at Lamash is personally sourced and hand-selected through years of experience across the UK and Paris. Each item is carefully inspected and accurately described before listing.",
 shippingPolicy:
 "Ships from Sheffield, UK. Shipping rates and delivery times are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. As a curated vintage shop specializing in one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "lei-vintage",
 dashboardToken: "lv-f4a8b2c1d9e3",
 name: "LEI Vintage",
 location: "Boston, MA",
 description:
 "LEI was born from the belief that the best style already exists. Rooted in vintage and sustainability, LEI curates timeless pieces with history and character. Reviving the past to create modern staples meant to be worn again and again.",
 website: "https://www.leivintage.com",
 dataSource: "lei-vintage",
 image: "/stores/LEI.jpg",
 logo: "/stores/lei-vintage-logo.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 authenticityPolicy:
 "Every piece at LEI is personally curated and inspected before it reaches you. We stand behind the accuracy of each listing — if your item arrives significantly different from its description, reach out within 48 hours of delivery and we'll make it right.",
 shippingPolicy:
 "Shipping rates are calculated at checkout. Orders ship to the address provided at checkout.",
 returnPolicy:
 "All sales are final. If your item arrives significantly different from its description or arrives damaged, contact info@shoplei.com within 48 hours of delivery with photos and the team will review.",
 commissionType: "squarespace-manual" as const,
 // No affiliatePath — uses Squarespace pixel for conversion tracking
 },
 {
 slug: "lover-girl-vintage",
 dashboardToken: "lgv-9e3f1a8b2c7d",
 name: "Lovergirl Vintage",
 location: "Newport Beach, CA",
 description:
 "Lovergirl Vintage is a curated vintage denim & blazer destination, focused on sourcing timeless pieces that combine quality, fit, and everyday wearability.",
 website: "https://lovergirlvintage.com",
 dataSource: "lover-girl-vintage",
 image: "/stores/lover-girl-vintage.jpg",
 logo: "/stores/lover-girl-vintage-logo.jpg",
 logoBg: "#f0ece4",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIAPARTNER",
 collabsStoreId: "229026",
 authenticityPolicy:
 "Each piece is hand-selected with a feminine, romantic eye — chosen for its charm, character, and timeless appeal. Any notable wear or flaws are disclosed in individual item descriptions so you always know exactly what you're getting.",
 shippingPolicy:
 "Ships from Newport Beach, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final — no returns under any circumstances. All vintage items may show signs of wear consistent with age. Any notable wear is disclosed in the item description. Please review carefully before purchasing.",
 },
 {
 slug: "maison-optimism-vintage",
 dashboardToken: "mo-6b3d9f1c8e2a",
 name: "Maison Optimism Vintage",
 location: "Houston, TX",
 description:
 "Maison Optimism Vintage is a Houston-based luxury vintage brand specializing in 90s and early 2000s designer bags, shoes, and accessories. Each piece is hand-picked and curated for an iconic, timeless style.",
 website: "https://www.maisonoptimismvintage.com",
 dataSource: "maison-optimism-vintage",
 image: "/stores/maison-optimism.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIA2026",
 collabsStoreId: "230654",
 authenticityPolicy:
 "All items are 100% authentic. Each purchase includes a Certificate of Authenticity, and every item is hand-picked and personally curated before listing.",
 shippingPolicy:
 "Ships from Houston, TX. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final — no returns under any circumstances. All vintage items may show signs of wear consistent with age. Any notable wear is disclosed in the item description. Please review carefully before purchasing.",
 },
 {
 slug: "missi-archives",
 dashboardToken: "ma-1c9d4e7f2b8a",
 name: "Missi Archives",
 location: "New York, NY",
 description:
 "Missi Archives is a curated vintage collection inspired by early 2000s fashion, street style, and model off-duty looks. Based in New York, each piece is hand-selected to feel both nostalgic and current — from standout clothing and bags to shoes and accessories, all chosen with an eye for individuality and timeless cool.",
 website: "https://www.missiarchives.com",
 dataSource: "missi-archives",
 image: "/stores/missi-archives.jpg",
 logo: "/stores/missi-archives-logo.jpg",
 logoBg: "#722f37",
 logoFit: "cover" as const,
 logoDark: true,
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "0001",
 collabsStoreId: "228526",
 discountCode: "0001",
 perk: "VYA customers get free shipping — use code 0001 at checkout",
 authenticityPolicy:
 "All vintage designer pieces are sourced from trusted, reputable sellers who specialize in authenticated luxury goods. Each item then undergoes a thorough in-house inspection to determine authenticity, and third-party authenticators are used for select designer pieces.",
 shippingPolicy:
 "Orders are processed within 2–5 business days. Delivery times vary by destination and chosen shipping service. A confirmation email with tracking details is sent once your order is dispatched.",
 returnPolicy:
 "All sales are final — no returns or refunds. If you experience any issues with your order, email missiarchives@gmail.com and the team will do their best to help.",
 },
 {
 slug: "montrose-edit",
 dashboardToken: "me-4a7c2e9f1b8d",
 name: "Montrose Edit",
 location: "Houston, TX",
 description:
 "MontroseEdit is a Houston based curated luxury resale brand specializing in elevated pre loved designer pieces. Rooted in storytelling and personal style, MontroseEdit is more than a storefront — it is a community built around the Montrose girl, someone who is effortless, fashion forward, and intentional in the way she lives and dresses. Through curated drops, pop ups, luxury markets, and digital content, MontroseEdit brings a fresh and approachable perspective to luxury resale, making timeless pieces feel personal, accessible, and meaningful.",
 website: "https://www.montroseedit.com",
 dataSource: "montrose-edit",
 image: "/stores/montrose-edit-brand.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "squarespace-manual" as const,
 authenticityPolicy:
 "Every piece at Montrose Edit is personally sourced and hand-selected for its quality, character, and elevated aesthetic. Specializing in pre-loved luxury and designer pieces, each item is carefully inspected and described with full condition details — reflecting the Montrose girl's effortless, intentional approach to style.",
 shippingPolicy:
 "Ships from Houston, TX. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated luxury resale boutique, all pieces are one-of-a-kind pre-loved items. Please review all details carefully before purchasing. Use the form below with any questions.",
 },
 {
 slug: "mookie-studios",
 dashboardToken: "ms-9c2a4e7b1f8d",
 name: "Mookie Studios",
 location: "San Diego, CA",
 description:
 "Mookie Studios was founded by stylist Madeleine, whose decade of experience in the NYC fashion industry and lifelong love of collecting vintage helped shape the brand. Mookie was created when she noticed the San Diego fashion scene was lacking in vintage options for the girls. It was then her mission to bring a little bit of NYC shopping to Southern California.\n\nSpecializing in pieces from the 1960s to the early 2000s, Mookie blends a nostalgic feel with chic, sophisticated style, creating pieces that stand out from everyday fast fashion. From beaded Cache dresses to vintage Adidas track pants, every piece is carefully curated to help you feel like the best version of YOU.",
 website: "https://mookiestudios.com",
 dataSource: "mookie-studios",
 image: "/stores/mookie-studios.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "242294",
 authenticityPolicy:
 "Every piece at Mookie Studios is hand-selected by founder Madeleine, drawing on a decade in the NYC fashion industry and a lifelong love of collecting vintage. Each item from the 1960s to the early 2000s is carefully curated and accurately described before listing.",
 shippingPolicy:
 "Ships from San Diego, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each piece is hand-selected and personally inspected by Madeleine. Please review all item details and photos carefully before purchasing — email madeleine@mookiestudios.com with any pre-purchase questions.",
 },
 {
 slug: "moonstruck-vintage",
 dashboardToken: "mv-7e2a9c4b1d8f",
 name: "Moonstruck Vintage",
 location: "New York, NY",
 description:
 "Moonstruck Vintage is dedicated to curating unique accessories for everyone. The shop aims to promote sustainability and give pieces a second life. Every piece tells a story, and adding to it is so special. Moonstruck focuses on bags, but also loves a good pair of shoes. Each piece is handpicked with care, authenticity, and style in mind so you can enjoy the thrill of discovering treasure, too!",
 website: "https://moonstruckvintagenyc.com",
 dataSource: "moonstruck-vintage",
 image: "/stores/moonstruck-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "230452",
 authenticityPolicy:
 "Every piece at Moonstruck Vintage is handpicked with care, authenticity, and style in mind — with a focus on bags and shoes, each selected to give it a second life. Sustainability is at the heart of the curation, and every item is personally chosen and accurately described before listing.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Moonstruck is committed to accurate descriptions and the thrill of the find — please review all item details and photos carefully before purchasing. Use the form below for any pre-purchase questions.",
 },
 {
 slug: "nello-vintage",
 dashboardToken: "nv-3a8c1e6f4b2d",
 name: "Nello Vintage",
 location: "Atlanta, GA",
 description:
 "NELLO Vintage is a curated luxury thrift house based in Atlanta, GA, founded by Chanelle Harris. The name NELLO is a union of Chanelle's own name and the symbolism of the lotus flower, born from a deeply personal spiritual journey toward radical self-love and fearless creative expression.\n\nNELLO presents an intentionally curated collection of rare vintage and sustainable pieces spanning tops, bottoms, dresses, outerwear, sets, accessories, and beyond, including coveted designer archive finds sourced directly from their previous owners. Every piece is thoughtfully acquired, carefully treated, and preserved at the highest standard, honoring the craftsmanship and history each garment carries. At NELLO, style is timeless.\n\nThe ethos of NELLO transcends clothing. The brand invites collectors to choose style over fashion, to step away from the noise of fleeting trends and embrace an entirely personal, boundary-free expression of self. Inspired by the icons and barrier-breakers of previous generations, Chanelle built NELLO as a sanctuary for those who understand that what you wear is a direct reflection of who you are and who you are becoming.",
 website: "https://www.nellovintage.com",
 contactEmail: "nellovintage@gmail.com",
 dataSource: "nello-vintage",
 image: "/stores/placeholder.svg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "wix-manual" as const,
 authenticityPolicy:
 "Every piece at Nello Vintage is personally sourced and accurately described before listing.",
 shippingPolicy:
 "Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "nunumia",
 dashboardToken: "nm-9c4e2a7f1d8b",
 name: "Nunumia",
 location: "Washington, DC",
 description: "Nunumia is a Washington, DC–based vintage boutique.",
 website: "https://nunumia.com",
 contactEmail: "nunumiavintage@gmail.com",
 dataSource: "nunumia",
 image: "/stores/nunumia.jpg",
 logo: "/stores/nunumia.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "244660",
 authenticityPolicy:
 "Every piece is personally sourced, carefully inspected, and accurately described before listing.",
 shippingPolicy: "Ships from Washington, DC. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a vintage boutique specializing in one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "other-matters-atelier",
 dashboardToken: "oma-7f3b9e2c1a4d",
 name: "Other Matters Atelier",
 location: "Los Angeles, CA",
 description:
 "other matters atelier is an edit of one-of-one archival designer pieces sourced from paris — flea markets, private archives, the kinds of finds that don't surface twice. every piece is chosen through the eye of a working fashion designer with over a decade in the industry. construction and provenance matter as much as the label. the collection is always small by design.",
 website: "https://othermattersatelier.com",
 contactEmail: "othermattersatelier@gmail.com",
 dataSource: "other-matters-atelier",
 image: "/stores/other-matters-atelier.jpg",
 logo: "/stores/other-matters-atelier.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "001",
 collabsStoreId: "236775",
 authenticityPolicy:
 "Every piece at Other Matters Atelier is personally sourced and chosen with an expert eye. Each item is accurately described so you can shop with confidence.",
 shippingPolicy:
 "Ships from Los Angeles, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated archive of one-of-one pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "petria-vintage",
 dashboardToken: "pv-2a9c3e1f7b4d",
 name: "Petria Vintage",
 location: "Montreal, Canada",
 description: "Petria Vintage is a Montreal-based luxury resale boutique specializing in curated vintage and pre-owned designer pieces. From iconic handbags to unique jewelry and accessories, every item is carefully selected for quality, authenticity, and timeless style. Petria Vintage works with a network of collectors, consignors, and trusted sources to bring unique designer pieces to its clients.",
 website: "https://petriavintage.com",
 dataSource: "petria-vintage",
 image: "/stores/petria-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "231616",
 authenticityPolicy:
 "Every piece at Petria Vintage is Entrupy Verified — authenticated using Entrupy's AI-powered technology before listing. You can shop with confidence knowing each item has passed independent authentication.",
 shippingPolicy:
 "Ships from Montreal, Canada. Shipping rates are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "porters-preloved",
 dashboardToken: "pp-8e3f1a7c2d9b4",
 name: "Porter's Preloved",
 location: "New York, NY",
 description:
 "Porter's Preloved is a New York–based vintage luxury boutique founded by Alexandra Porter, a Fashion Business student at the Fashion Institute of Technology. With a sharp eye for archival detail and market value, Alexandra curates rare early-2000s designer pieces, timeless handbags, and collectible ready-to-wear sourced both locally and internationally. The edit focuses on iconic silhouettes, elevated everyday essentials, and statement runway-era finds — from Balenciaga City bags to Galliano-era Dior heels.",
 website: "https://porterspreloved.com",
 dataSource: "porters-preloved",
 image: "/stores/porters-preloved.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIA",
 collabsStoreId: "232515",
 authenticityPolicy:
 "Every piece at Porter's Preloved is personally sourced and hand-selected by Alexandra — a Fashion Business student at FIT with a sharp eye for archival detail and market value. From Balenciaga City bags to Galliano-era Dior heels, each item is authenticated, inspected, and described with full condition details before listing.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each item is hand-selected and described in full detail. If your item arrives significantly different from its description, use the form below within 48 hours of delivery.",
 },
 {
 slug: "promised-vintage",
 dashboardToken: "prom-6c1d8a3e5f9b2",
 name: "Promised Vintage",
 location: "Boston, MA",
 description: "Promised Vintage is a shop built on a commitment to honing your most authentic self with the help of fabulous clothing and accessories. Founded by Kellan, every piece she carries is handpicked from Europe — rare, discontinued, one-of-one, and designer finds that just don't exist in the US market. The kind of thing you see and just know is yours - because getting dressed should feel like an extension of who you actually are. If your taste exists slightly outside of what's easy to find — you're in the right place.",
 website: "https://promisedvintage.com",
 dataSource: "promised-vintage",
 image: "/stores/promised-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "231785",
 authenticityPolicy:
 "Every piece at Promised Vintage is hand-selected by Kellan — personally sourced from across Europe, where rare, discontinued, and one-of-one designer finds just don't exist in the US market. Each item is inspected and described with honest condition details so you know exactly what you're getting.",
 shippingPolicy:
 "Ships from Boston, MA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. These pieces are often one-of-one finds sourced internationally — returns aren't possible. If there's a significant discrepancy from the listing description, contact kellanmccormick@gmail.com within 48 hours of delivery.",
 },
 {
 slug: "rareality-archive",
 dashboardToken: "ra-4f2b8e1c9d7a",
 name: "Rareality Archive",
 location: "Australia",
 description:
 "Rareality is a curated vintage designer archive for those who stand out without trying. Founded by Holly, from a love of creating a capsule wardrobe you truly adore, each piece is hand-selected to be bold, colourful, and impossible to ignore—think iconic heels and statement finds from Galliano-era Dior, Giuseppe Zanotti, Chanel, and Prada. While still in its baby phase, the brand is driven by big dreams and a genuine care for every single customer. She only sources and restores high-quality vintage so each piece can have its next moment—made for those who value individuality and confidence.",
 website: "https://rarealityarchive.com",
 dataSource: "rareality-archive",
 image: "/stores/rareality-archive.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "RAREALITY",
 collabsStoreId: "230749",
 authenticityPolicy:
 "Every piece at Rareality Archive is personally sourced with a sharp archival eye — rare, considered items hand-selected for quality, character, and lasting appeal. Each item is inspected before listing and accurately described with any notable condition details clearly disclosed.",
 shippingPolicy:
 "Ships from Australia. Shipping rates and delivery times are calculated at checkout. For U.S. customers, all applicable tariffs and duties are included in the price — no surprise fees on delivery.",
 returnPolicy:
 "All sales are final. Due to the vintage and pre-loved nature of items, returns are not accepted. If there is a quality or condition issue, use the form below within 2 business days of delivery.",
 },
 {
 slug: "reine-revival",
 dashboardToken: "rr-6b2f8d4a1e9c",
 name: "Reine Revival",
 location: "Los Angeles, CA",
 description:
 "Reine Revival was born from a lifelong love of thrifting and finding unique vintage pieces — for myself, my friends, and my family. Vintage clothing tells a story, and I love giving those pieces a second life, helping others discover the quality, craftsmanship, and character that make vintage so special. The name 'Reine' is close to my heart: it's my sister's middle name and a nod to my hometown of Seattle, the 'Rain City' — and in French, reine means 'queen,' which is what those close to me call me, the 'vintage queen.' Based in Los Angeles.",
 website: "https://reinerevival.com",
 contactEmail: "kaylendbusiness@gmail.com",
 dataSource: "reine-revival",
 image: "/stores/reine-revival.png",
 logo: "/stores/reine-revival.png",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "248725",
 authenticityPolicy:
 "Every piece is carefully sourced, inspected, and accurately described before listing.",
 shippingPolicy: "Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a vintage shop of one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "rejects-only-vintage",
 dashboardToken: "rov-3a7e2c9d1f8b",
 name: "Rejects Only Vintage",
 location: "Rhode Island",
 description:
 "Rejects Only Vintage is a curated premium vintage boutique based in Rhode Island, founded by Jordan Cameron. Born and raised in Narragansett, RI, Jordan studied Textiles, Fashion Merchandising and Design at the University of Rhode Island and spent time abroad at Academia Italiana Arte Moda Design in Florence, studying Fashion Design & Illustration. After launching her career in the luxury fashion industry at Gucci in New York City, she channeled her lifelong love of fashion, one-of-a-kind pieces, and sustainability into Rejects Only Vintage. At Rejects Only Premium Vintage, you'll find an intentionally sourced collection of pre-loved and vintage pieces — offering a meaningful way to satisfy the desire for new clothing, and giving a second life to those rejected pieces.",
 website: "https://rejectsonlyvintage.com/VYA",
 contactEmail: "Rejectsonlyvintage@gmail.com",
 dataSource: "rejects-only-vintage",
 image: "/stores/rejects-only-vintage.jpg",
 logo: "/stores/rejects-only-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "238591",
 authenticityPolicy:
 "Every piece at Rejects Only Vintage is personally and intentionally sourced by founder Jordan Cameron — chosen for its quality, character, and ability to give pre-loved pieces a meaningful second life. Each item is carefully inspected and accurately described before listing.",
 shippingPolicy:
 "Ships from Rhode Island. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated vintage boutique specializing in one-of-a-kind pre-loved pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "sablier-vintage",
 dashboardToken: "tvc-5e2b8f1a9c3d",
 name: "Sablier Vintage",
 location: "New York, NY",
 description:
 "Sablier consists of a curation of high-quality vintage garments focused on timeless staples and statement pieces. Its diverse collections offer custom made upcycled designs, reviving vintage fabrics into modern and chic styles.",
 website: "https://sabliervintage.com",
 dataSource: "sablier-vintage",
 image: "/stores/sablier-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "1234",
 collabsStoreId: "231753",
 authenticityPolicy:
 "Every piece at Sablier Vintage is hand-selected and inspected by the team — from timeless vintage staples and statement pieces to custom designs reconstructed from second-hand fabrics. Each item is authentic, quality-checked, and described with full condition details, with sustainability and individuality at the core of every selection.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Exchanges accepted within 14 days of receipt — no cash refunds. Items must be unworn and unused with tags and original packaging; once inspected, store credit for the value is issued. If there is an issue with your order, contact the team and they will do their best to help.",
 },
 {
 slug: "sacrare",
 dashboardToken: "sac-7e2c9a4f1d8b",
 name: "Sacrare",
 location: "New York, NY",
 description:
 "Sacrare is a New York based luxury reseller specializing in rare, obsession-worthy designer handbags and accessories. Sacrare curates a highly selective collection of authenticated vintage, limited-edition, and hard to find pieces from fashion brands such as Chanel, Hermes, Louis Vuitton, and more. Unlike large reseller sites with thousands of listings, Sacrare hand-selects only the rarest and most coveted pieces, making it easier for collectors and fashion enthusiasts to discover timeless, sustainable treasures. Sacrare holds certification in authenticating Chanel and Hermes handbags and also partners with trusted third-party authentication services for additional verification and confidence.",
 website: "https://www.sacrare.com",
 dataSource: "sacrare",
 image: "/stores/sacrare.jpg",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "244883",
 authenticityPolicy:
 "Sacrare holds certification in authenticating Chanel and Hermes handbags and also partners with trusted third-party authentication services for additional verification and confidence.",
 },
 {
 slug: "sarah-does",
 dashboardToken: "sd-7a1c4e9f2b8d",
 name: "SarahDoes",
 location: "New York, NY",
 description:
 "SarahDoes is a curated destination for authenticated luxury designer sunglasses. Thoughtfully sourced and selected from vintage to new season collections. All styles priced at $150.",
 website: "https://sarahdoes.shop",
 contactEmail: "sarah@sarahdoes.shop",
 dataSource: "sarah-does",
 image: "/stores/sarah-does.png",
 logo: "/stores/sarah-does.png",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "240935",
 authenticityPolicy:
 "Every piece at SarahDoes is personally sourced and hand-selected before listing. Items are accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "sassy-so-what",
 dashboardToken: "ssw-2e1a9c4f7b3d",
 name: "Sassy So What",
 location: "Dallas, TX",
 description:
 "Sassysowhat is based in Dallas, TX. Its niche is fun & fancy vintage, focused on luxury brand heels from the early 90s and 00s. Its meticulous attention to detail sets it apart from other vintage designer shops; the shop only adds lasting quality items to the next girl's wardrobe.",
 website: "https://www.sassysowhat.com",
 dataSource: "sassy-so-what",
 image: "/stores/placeholder.svg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "squarespace-manual" as const,
 authenticityPolicy:
 "Every piece at Sassy So What is personally sourced and inspected before listing. Items are accurately described with full condition details so you can shop with confidence.",
 shippingPolicy:
 "Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "scarz-vintage",
 dashboardToken: "sv-8a2c4b9d1e7f",
 name: "Scarz Vintage",
 location: "London, UK",
 description:
 "Scarz Vintage is a curated collection of archival clothing and accessories founded by Scarlett, rooted in a love for timeless design and intentional sourcing. Each piece is hand-selected for its character and story, from rare finds to standout runway pieces, offering distinctive vintage you won't see everywhere else. Guided by sustainability and individuality, Scarz gives exceptional pieces a second life.",
 website: "https://scarzvintage.com",
 dataSource: "scarz-vintage",
 image: "/stores/scarz-vintage.jpg",
 logo: "/stores/scarz-vintage-logo.jpg",
 logoBg: "#ffffff",
 currency: "GBP",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIAXSCARZ",
 collabsStoreId: "228153",
 discountCode: "VIAXSCARZ",
 perk: "VYA customers get free shipping — use code VIAXSCARZ at checkout",
 authenticityPolicy:
 "Each item is carefully inspected based on significant experience with luxury fashion. Detailed photos of tags and labels are provided in every listing to assist in your evaluation. While thorough checks are conducted, Scarz Vintage is not a certified authentication service.",
 shippingPolicy:
 "Orders are processed within 1–2 business days. UK Standard: £4 (2–4 days). EU International: £15 (2–11 days). Rest of World: £30 (3–17 days). Free shipping on orders over £500. International customers are responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Refunds or exchanges are only issued if the wrong item was sent or if there is a significant discrepancy from the product description. Contact contact@scarzvintage.com within 7 days of receiving your order.",
 },
 {
 slug: "sheer-vintage",
 dashboardToken: "shv-3c1a9e7f2d4b",
 name: "Sheer Vintage",
 location: "Calgary, Canada",
 description: "Sheer Vintage is a curated collection of designer vintage specializing in bridal and evening wear. Rooted in the belief that cherished things deserve to be passed down, the store celebrates enduring style and the beauty of quality pieces with a story.",
 website: "https://www.shopsheervintage.com",
 dataSource: "sheer-vintage",
 image: "/stores/sheer-vintage-story.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "SHEER",
 collabsStoreId: "231298",
 commissionRates: [{ upTo: 1000, rate: 0.05 }, { upTo: 5000, rate: 0.04 }, { rate: 0.03 }],
 authenticityPolicy:
 "Every piece at Sheer Vintage is hand-selected with a focus on designer bridal and evening wear — curated for enduring quality, condition, and style. Items are accurately described with full condition details before listing.",
 shippingPolicy:
 "Ships from Calgary, Canada. Shipping rates are calculated at checkout. International customers may be responsible for customs duties and taxes.",
 returnPolicy:
 "All sales are final. Due to the delicate and one-of-a-kind nature of vintage items, returns are not accepted. If there is an issue with your order, use the form below and the store will do everything possible to resolve it.",
 },
 {
 slug: "shiranka-vintage",
 dashboardToken: "shv-3a9f1c7e2b8d",
 name: "Shiranka Vintage",
 location: "San Francisco, CA",
 description:
 "Shiranka Vintage specializes in tracking down rare, highly coveted designer grails alongside curating wardrobe staples for the everyday girl who wants to wear something no one else has. Shiranka believes not all clothes are created equal — every piece is intentionally sourced to define eras, celebrate construction, and bring late-90s and 2000s archival luxury directly into your modern rotation.",
 website: "https://shirankavintage.com",
 dataSource: "shiranka-vintage",
 image: "/stores/shiranka-vintage.jpg",
 logo: "/stores/shiranka-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "243667",
 authenticityPolicy:
 "Every piece at Shiranka Vintage is personally sourced and inspected, with a focus on rare designer grails and late-90s to 2000s archival luxury. Each item is accurately described with full condition details so you always know exactly what you're getting.",
 shippingPolicy:
 "Ships from San Francisco, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each piece is hand-selected and personally inspected. Please review all item details and photos carefully before purchasing — email info@shirankavintage.com with any pre-purchase questions.",
 },
 {
 slug: "situations-vintage",
 dashboardToken: "sv-4e8c1a9f3b2d",
 name: "Situations Vintage",
 location: "New York, NY",
 description:
 "Situations Vintage is all about finding your next situation! Situations Vintage believes vintage items are more than just clothes — they're stories, moods, and moments waiting to happen. Founded by two best friends in New York City, the shop sources and curates archival 90s and early 2000s pieces.",
 website: "https://situationsvintage.com",
 contactEmail: "info@situationsvintage.com",
 dataSource: "situations-vintage",
 image: "/stores/situations-vintage.jpg",
 logo: "/stores/situations-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "242143",
 authenticityPolicy:
 "Every piece is personally sourced and curated. Items are accurately described with full condition details.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "so-lxury",
 dashboardToken: "slx-5a3c9e1f7b2d",
 name: "Solxury Vintage",
 location: "Tampa, FL",
 description:
 "Solxury Vintage is a curated vintage designer platform inspired by a universal love for timeless fashion and the stories behind each piece. Rooted in the belief that luxury is more than just a label — it's about history, craftsmanship, and individuality — every bag is carefully sourced and authenticated, bringing you pieces that feel unique, meaningful, and impossible to replicate.",
 website: "https://solxuryvintage.com",
 dataSource: "so-lxury",
 image: "/stores/so-lxury.jpg",
 logo: "/stores/so-lxury.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "237155",
 authenticityPolicy:
 "Every bag at Solxury Vintage is carefully sourced and authenticated before listing. Each piece is chosen for its history, craftsmanship, and individuality — accurately described so you can shop with confidence.",
 shippingPolicy:
 "Ships from Tampa, FL. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are considered final, but a return may be requested within 3 days of delivery if an item is proven inauthentic, the wrong item was shipped, or it was significantly misrepresented in the listing. Approved returns are refunded to the original payment method (shipping is non-refundable unless the error was ours).",
 },
 {
 slug: "source-twenty-four",
 dashboardToken: "s24-7d1f8c4a2b9e",
 name: "Source 24",
 location: "New Jersey",
 description:
 "Source 24 is a curated collection of pre-owned luxury handbags, wallets, and accessories from iconic designer houses. Each piece is authenticated and hand-selected, offering timeless style from brands like Chanel, Celine, Dior, and Bottega Veneta.",
 website: "https://sourcetwentyfour.com",
 dataSource: "source-twenty-four",
 image: "/stores/source-twenty-four.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIAPLATFORM",
 collabsStoreId: "229322",
 authenticityPolicy:
 "Every piece at Source 24 is authenticated and hand-selected before listing. Specializing in pre-owned luxury from Chanel, Celine, Dior, and Bottega Veneta, each item undergoes careful inspection to verify quality and authenticity prior to sale. Select items include a Certificate of Authenticity.",
 shippingPolicy:
 "Free shipping on all items. Orders ship from the United States.",
 returnPolicy:
 "All sales are final. If authenticity is disputed by a recognized third-party authenticator, email sourcetwentyfour@gmail.com within 7 days of delivery with documentation for a full refund. Damage or incorrect items must be reported within 48 hours of delivery with photos.",
 },
 {
 slug: "sourced-by-scottie",
 dashboardToken: "sbs-3e7a1c5d9f2b",
 name: "Sourced by Scottie",
 location: "Washington, DC",
 description:
 "Sourced by Scottie is a Washington, DC–based vintage shop known for sourcing standout designer pieces directly from Milan. The collection highlights bold vintage from the 1990s and early 2000s, with a focus on iconic Italian labels. Each piece is hand selected for its character, craftsmanship, and lasting style.",
 website: "https://sourcedbyscottie.com",
 dataSource: "sourced-by-scottie",
 image: "/stores/sourced-by-scottie.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIACONNECT",
 collabsStoreId: "230428",
 authenticityPolicy:
 "Every piece is personally sourced by Emma from trusted vintage dealers, flea markets, and private sellers across Milan and Europe — inspected for quality and selected only in excellent or very good condition. The focus is on expressive 90s and early 2000s designer pieces from labels like Roberto Cavalli, Christian Dior, and iconic Italian houses. Any age or wear is noted in the description.",
 shippingPolicy:
 "Ships from Washington, DC. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted within 7 days of delivery — items must be shipped back within 7 business days of return confirmation. Refunds are issued as store credit for the full price minus a $15 restocking and return shipping fee. Final sale items (belts, jewelry, swimwear, lingerie, and sale items) are not eligible. Contact hello@sourcedbyscottie.com to initiate a return.",
 },
 {
 slug: "stone-studio-vintage",
 dashboardToken: "ssv-7d2e9a4c1f6b",
 name: "Stone Studio Vintage",
 location: "Miami, FL",
 description:
 "Stone Studio Vintage is a curated collection of authentic luxury and designer vintage, handpicked for those who love rare, timeless pieces with a modern edge. Founded by two sisters with a shared love for vintage fashion, Stone Studio Vintage was created from an obsession with finding the coolest, most niche pieces — constantly searching for rare designer finds and one-of-a-kind vintage that feels special, unexpected, and impossible to find everywhere else.",
 website: "https://stonestudiovintage.com",
 contactEmail: "stonestudiovintage@gmail.com",
 dataSource: "stone-studio-vintage",
 image: "/stores/stone-studio-vintage.jpg",
 logo: "/stores/stone-studio-vintage.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "246578",
 authenticityPolicy:
 "Every piece at Stone Studio Vintage is handpicked and personally authenticated by the sisters behind the shop. Each item is carefully inspected for quality and accurately described before listing.",
 shippingPolicy:
 "Ships from Miami, FL. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a curated vintage shop specializing in rare, one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "tess-elizabeth-vintage",
 dashboardToken: "tev-7b3d1a9c5e2f",
 name: "Tess Elizabeth Vintage",
 location: "Los Angeles, CA",
 description:
 "Tess Elizabeth Vintage is a curated collection of timeless vintage and antique pieces, founded by Tess Elizabeth — Los Angeles-based photographer and creative director. Each piece is carefully selected for its craftsmanship, story, and modern wearability, bringing history into the present through romantic curation and design.",
 website: "https://tesselizabethvintage.com",
 dataSource: "tess-elizabeth-vintage",
 image: "/stores/tess-elizabeth-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "236972",
 authenticityPolicy:
 "Every piece at Tess Elizabeth Vintage is hand-selected and inspected before listing. Items are accurately described with full condition details.",
 shippingPolicy:
 "Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted up to 14 days after delivery for store credit (not a cash refund) — you receive the full order amount minus shipping. Items must be returned in the same condition they were sent, and all sale items are final. Email hello@tesselizabeth.com to arrange a return.",
 },
 {
 slug: "the-objects-of-affection",
 dashboardToken: "tooa-2f9a4c8b1e7d",
 name: "The Objects of Affection",
 location: "New Hope, Pennsylvania",
 description:
 "Founded by Mackenzie and based in New Hope, Pennsylvania, The Objects of Affection is a curated vintage and archival fashion house specializing in luxury handbags, clothing, shoes, and accessories from the designers and houses that defined eras.\n\nWith an archival mindset and an editorial eye, Mackenzie sources pieces not for trend, but for reverence — hand-selecting objects defined by craftsmanship, condition, rarity, and the emotional pull a truly remarkable piece gives. These are pieces worth longing for, chosen for those who build their wardrobes slowly and with intention, collecting for today to be passed on as heirlooms.\n\nAt The Objects of Affection, clients are celebrated just as thoughtfully as the pieces themselves. Every object is authenticated, transparently presented, and sent off with the care and white-glove attention of buying it brand new. The Objects of Affection serves its collectors like family, because devotion to the object should always be matched by devotion to the experience.",
 website: "https://theobjectsofaffection.com",
 dataSource: "the-objects-of-affection",
 image: "/stores/the-objects-of-affection-3.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "001",
 collabsStoreId: "5662739",
 authenticityPolicy:
 "As collectors ourselves, we understand how essential authenticity is when building a wardrobe of investment vintage and pre-loved pieces. Every Object is carefully sourced and meticulously verified in-house and through a third party partner to ensure it meets our uncompromising standards of genuine luxury. Each purchase includes a signed Certificate of Authenticity confirming the item's verification and approval. All third-party authentication documentation is retained and available upon request at any time, free of charge. In the rare event of an authenticity concern, our team will conduct a full review in collaboration with our authentication partners, keeping you in the loop at all steps. If an item is confirmed inauthentic, a full refund will be issued without hesitation.",
 shippingPolicy:
 "Ships from New Hope, Pennsylvania. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted within 7 business days of delivery. Items must be in original condition with tags, original packaging, and any authentication papers. A $40 handling and reauthentication fee is deducted and refunds are issued as store credit. Domestic return labels are provided; international customers cover return shipping. Use the form below to initiate a return.",
 },
 {
 slug: "thread-and-bloom",
 dashboardToken: "tb-5a8d3f9e1c2b",
 name: "Thread and Bloom",
 location: "United States",
 description: "Thread and Bloom is a vintage boutique.",
 website: "https://threadandbloomshop.com",
 contactEmail: "shopthreadandbloom@gmail.com",
 dataSource: "thread-and-bloom",
 image: "/stores/thread-and-bloom.jpg",
 logo: "/stores/thread-and-bloom.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 collabsStoreId: "245939",
 authenticityPolicy:
 "Every piece is carefully sourced, inspected, and accurately described before listing.",
 shippingPolicy: "Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. As a vintage boutique specializing in one-of-a-kind pieces, please review all item details and photos carefully before purchasing.",
 },
 {
 slug: "to-us-vintage",
 dashboardToken: "tuv-5d2a8c1e9b7f",
 name: "To Us Vintage",
 location: "New York, NY",
 description:
 "To Us Vintage is a vintage boutique specializing in timeless designer and statement pieces. From iconic Thierry Mugler tailored blazers to rare Dolce & Gabbana Y2K mini dresses and elevated accessories, each item is hand-selected for quality, character, and individuality. To Us Vintage celebrates fashion with history, bringing standout pieces from the past into modern wardrobes spearheaded by founder and head curator, Kathleen Scarrone.",
 website: "https://tousvintage.com",
 dataSource: "to-us-vintage",
 image: "/stores/to-us-vintage.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "HANA",
 collabsStoreId: "228807",
 authenticityPolicy:
 "Every piece at To Us Vintage is hand-selected and personally inspected by founder Kathleen Scarrone. Specializing in iconic designer and statement pieces — from Thierry Mugler tailoring to rare Dolce & Gabbana Y2K finds — each item is chosen for quality, character, and individuality, and accurately described before listing.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each piece is hand-selected and personally inspected by Kathleen. If your item arrives significantly different from its description, email KScarrone@gmail.com within 48 hours of delivery with photos.",
 },
 {
 slug: "vangie",
 dashboardToken: "vng-3a8c1d5e9b4f",
 name: "Vangie",
 location: "Philadelphia, PA",
 description:
 "Vangie is a Philadelphia-based vintage studio curating collectible, investment-worthy fashion — bold statement pieces and art-to-wear with real design integrity. Founded by Evan Noll after more than a decade in tech, Vangie is rooted in craftsmanship, sustainability, and personal storytelling. Named for Evan's grandmother (short for Evangeline), the studio honors a legacy of fearless self-expression — clothing as confidence and personality. Explore clothing, jewelry, and accessories ranging from the 1950s to Y2K.",
 website: "https://vangie.co",
 dataSource: "vangie",
 image: "/stores/vangie.jpg",
 logo: "/stores/vangie-logo.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "1",
 collabsStoreId: "230072",
 authenticityPolicy:
 "Every piece at Vangie is personally sourced and authenticated by Evan before listing. Specializing in collectible and investment-worthy vintage, each item is hand-selected for craftsmanship, condition, and design integrity — bold statement pieces chosen to be treasured for a lifetime.",
 shippingPolicy:
 "Ships from Philadelphia, PA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Returns accepted within 30 days of receipt. Items must be unworn, unused, with tags attached and in original packaging. Sale items, personalized items, and gift cards are final sale. Refunds are issued to the original payment method. Contact hello@vangie.co to initiate a return.",
 },
 {
 slug: "vintage-archives-la",
 dashboardToken: "vala-4b8e1c9a7d2f",
 name: "Vintage Archives LA",
 location: "Los Angeles, CA",
 description:
 "Vintage Archives LA is a curated collection of vintage designer shoes, from iconic classics to hidden gems. Rooted in sustainability and a love for fashion with history, each piece is hand-selected to offer something unique. Based in LA, the shop is dedicated to giving quality pieces a second life while helping you find something that feels just right.",
 website: "https://vintagearchivesla.com",
 dataSource: "vintage-archives-la",
 image: "/stores/VintageArchivesLA.jpg",
 logo: "/stores/vintage-archives-la-logo.jpg",
 logoBg: "#fdf8d8",
 logoFit: "cover" as const,
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VIAPARTNER",
 collabsStoreId: "227548",
 authenticityPolicy:
 "Every vintage designer item undergoes a thorough authentication process. Each piece is either pre-authenticated or verified by accredited third-party specialists to ensure its authenticity and quality before listing.",
 shippingPolicy:
 "Orders are processed within 3–7 business days. Delivery takes an additional 3–7 business days depending on location. Shipping rates are calculated at checkout based on destination and package weight. US shipping only.",
 returnPolicy:
 "All sales are final — no refunds, exchanges, or returns. Please review all item details carefully before purchasing.",
 },
 {
 slug: "vintage-girlfriend",
 dashboardToken: "vg-5c2a8e1d4f9b3",
 name: "Vintage Girlfriend",
 location: "Menlo Park, CA",
 description:
 "Anna, a 28-year-old reseller based in Menlo Park, CA, has always loved bougie, beautiful things with a story to tell. In a hyper-commercialized world that insists on putting polyester in everything we touch and is constantly pushing us to consume, consume, and consume some more, it's comforting just to hold something well-made, something that you could tell was made with heart. She wants to bring this feeling to more people, and that's why she started Vintage Girlfriend Luxury. Unlike the big players in the industry that give resellers a bad rap, the store upholds authenticity and transparency as the bare minimum so anyone, anywhere, can shop preowned luxury without worry.",
 website: "https://vintage-girlfriend.com",
 dataSource: "vintage-girlfriend",
 image: "/stores/vintage-girlfriend.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 commissionRates: [{ upTo: 1000, rate: 0.05 }, { rate: 0.03 }],
 affiliatePath: "VYAPARTNER",
 collabsStoreId: "231641",
 authenticityPolicy:
 "Every piece goes through rigorous in-house inspection and independent third-party verification using services including Entrupy, Zeko's, LegitGrails, and Real Authentication — only authenticated items make it through. Each purchase comes with a complimentary Certificate of Authenticity, so you can shop pre-owned luxury without worry.",
 shippingPolicy:
 "Ships from Menlo Park, CA. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final, except that a return may be requested within 7 days of receipt if an item has major undisclosed defects or damage, or is proven inauthentic by the brand or an accredited authenticator. The security tag must remain intact and the item in original condition.",
 },
 {
 slug: "vintari-vault",
 dashboardToken: "vv-9c1e7a4d2f8b",
 name: "Vintari Vault",
 location: "Dallas, Texas",
 description:
 "Vintari Vault is a Dallas-based seller of vintage designer handbags founded by two best friends, one with a deep love for designer handbags and the other with a passion for vintage fashion history. What began as sourcing pieces for personal collections grew into a mission to provide a curated selection of authentic, timeless designer bags that celebrate the history of vintage fashion while bringing it to the everyday wardrobe. Operating primarily online with select Dallas pop-ups, their mission is to make timeless luxury accessible and inclusive — unlocking vintage one bag at a time.",
 website: "https://vintarivault.com",
 dataSource: "vintari-vault",
 image: "/stores/vintari-vault.jpg",
 logo: "/stores/placeholder.svg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "5668014",
 authenticityPolicy:
 "Every bag is personally authenticated and inspected by the founders before listing. As dedicated specialists in vintage designer handbags, each item is accurately described with full condition details, so you can shop with complete confidence.",
 shippingPolicy:
 "Ships from Dallas, Texas. Shipping rates are calculated at checkout.",
 returnPolicy:
 "All sales are final. Each item is authenticated and carefully described. Please review all item details and photos before purchasing.",
 },
 {
 slug: "west-village-vintage",
 dashboardToken: "wvv-4a8c2e1d7f9b",
 name: "West Village Vintage",
 location: "New York, NY",
 description:
 "Rooted in the Old Money aesthetic of its namesake Manhattan neighborhood, West Village Vintage specializes in one of a kind designer garments and archival accessories that prioritize timeless silhouettes over fleeting trends. By treating the closet as a personal archive rather than a revolving door, WVV offers a meticulously curated wardrobe of elevated, chic staples that remain as relevant today as they were decades ago. It is a destination defined by sophisticated style and effortless luxury, operating on the belief that true fashion isn't about what's next; it's about what lasts.",
 website: "https://westvillagevintage.com",
 dataSource: "west-village-vintage",
 image: "/stores/west-village-vintage.jpg",
 logo: "/stores/west-village-vintage-logo.jpg",
 logoBg: "#ffffff",
 currency: "USD",
 commissionType: "shopify-collabs" as const,
 affiliatePath: "VYA",
 collabsStoreId: "214283",
 authenticityPolicy:
 "Authenticity Guaranteed. Every piece at West Village Vintage is personally sourced and held to a simple standard: if we wouldn't personally wear it in its current condition, we won't sell it. Each item is thoroughly inspected and accurately described so you can shop with confidence.",
 shippingPolicy:
 "Ships from New York, NY. Shipping rates are calculated at checkout.",
 returnPolicy:
 "Bottoms may be returned within 10 days for a refund to your original payment method (issued within 10 business days of approval); all other items are final sale. There are no direct exchanges, and sale items and gift cards are non-returnable.",
 },
];

/** Stores shown on the public site — Shopify Collabs stores must have a collabsStoreId; other types (Squarespace, Square, Wix, custom) are always shown. */
export const visibleStores = stores.filter(s =>
 s.commissionType !== "shopify-collabs" || 'collabsStoreId' in s
);

/** Shopify Collabs stores without a collabsStoreId — hidden site-wide until onboarded. */
export const HIDDEN_STORE_SLUGS: string[] = (stores as Array<{ commissionType: string; slug: string; collabsStoreId?: string }>)
 .filter(s => s.commissionType === "shopify-collabs" && !s.collabsStoreId)
 .map(s => s.slug);

/**
 * Maps an arbitrary store-slug string (from a webhook URL, checkout payload, admin
 * input, etc.) to the canonical slug defined in the `stores` array. Matching ignores
 * case, hyphens, and surrounding punctuation, so "sassysowhat", "Sassy So What", and
 * "sassy-so-what," all resolve to "sassy-so-what". If no store matches, returns a
 * best-effort cleaned slug (lowercased, punctuation collapsed to single hyphens) so we
 * never lose data — but known stores are always normalized to their canonical slug.
 */
const slugByCanonKey: Map<string, string> = new Map(
 stores.map((s) => [s.slug.toLowerCase().replace(/[^a-z0-9]/g, ""), s.slug])
);
export function canonicalStoreSlug(input: string | null | undefined): string {
 const raw = (input ?? "").trim().toLowerCase();
 if (!raw) return "unknown";
 const key = raw.replace(/[^a-z0-9]/g, "");
 const canonical = slugByCanonKey.get(key);
 if (canonical) return canonical;
 // Unknown store: clean to a slug shape rather than dropping the value.
 return raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Commission tiers (% of sale price that VYA earns).
 * Applies to all stores regardless of payout method.
 */
export const COMMISSION_TIERS = [
 { maxPrice: 1000, rate: 0.07 }, // Under $1k → 7%
 { maxPrice: 5000, rate: 0.05 }, // $1k–$5k → 5%
 { maxPrice: Infinity, rate: 0.03 }, // $5k+ → 3%
] as const;

/** Returns the commission rate (0–1) for a given sale price. */
export function getCommissionRate(price: number): number {
 return COMMISSION_TIERS.find((t) => price < t.maxPrice)?.rate ?? 0.03;
}

/** Returns the commission dollar amount VYA earns on a sale. */
export function getCommissionAmount(price: number): number {
 return price * getCommissionRate(price);
}

/**
 * Store contact emails for sourcing request notifications.
 * Fill in each store's email address — leave blank to skip that store.
 */
export const storeContactEmails: Record<string, string> = {
 "lamash": "mollyashmore6@gmail.com",
 "stone-studio-vintage": "stonestudiovintage@gmail.com",
 "ascensio-vintage": "info@ascensiovintage.com",
 "in-a-past-life": "inapastlife.xo@gmail.com",
 "lei-vintage": "shop@leivintage.com",
 "lover-girl-vintage": "lexi.heuser@gmail.com",
 "missi-archives": "missiarchives@gmail.com",
 "scarz-vintage": "contact@scarzvintage.com",
 "sacrare": "sacrareboutique@gmail.com",
 "house-on-a-chain": "houseonachain@gmail.com",
 "source-twenty-four": "sourcetwentyfour@gmail.com",
 "vintage-archives-la": "vintagearchivesla@gmail.com",
 "the-objects-of-affection": "mackenzie@theobjectsofaffection.com",
 "vangie": "evan@vangie.co",
 "sourced-by-scottie": "emma@scottiestudios.com",
 "sablier-vintage": "thevntgcollective@gmail.com",
 "to-us-vintage": "KScarrone@gmail.com",
 "moonstruck-vintage": "moonstruckvintagenyc@gmail.com",
 "sheer-vintage": "jena.hirsch@hotmail.com",
 "maison-optimism-vintage": "maisonoptimism@gmail.com",
 "montrose-edit": "themontroseedit@gmail.com",
 "vintari-vault": "admin@vintarivault.com",
 "chill-boutique": "info@chillboutiqueconsignment.com",
 "honey-bear-vintage": "honeybearvintagenyc@gmail.com",
 "jade-vintage": "hello@jadevintage.ca",
 "keepin-it-real-luxe": "info@keepinitrealluxe.com",
 "blodas-choice": "annabloda@gmail.com",
 "carroll-street-vintage": "kittyzeldis@gmail.com",
 "porters-preloved": "porterspreloved@gmail.com",
 "petria-vintage": "petriavintage@gmail.com",
 "promised-vintage": "kellanmccormick@gmail.com",
 "dayton-jane": "jacquelyne.rankin@gmail.com",
 "club-fleur": "theclubfleur@gmail.com",
 "edited-archive": "francesca.m.alfano@gmail.com",
 "for-the-globe": "for.the.globe1@gmail.com",
 "front-page-finds": "charlee@frontpagefinds.com",
 "vintage-girlfriend": "anna@vintage-girlfriend.com",
 "chomp-chomp-vintage": "chompchompvintage@gmail.com",
 "rareality-archive": "holly.cooper01@hotmail.com",
 "hachi-archive": "patricia@hachiarchive.com",
 "rejects-only-vintage": "Rejectsonlyvintage@gmail.com",
 "sarah-does": "sarah@sarahdoes.shop",
 "sassy-so-what": "hello@sassysowhat.com",
 "so-lxury": "solxuryvintage@gmail.com",
 "other-matters-atelier": "othermattersatelier@gmail.com",
 "tess-elizabeth-vintage": "hello@tesselizabeth.com",
 "west-village-vintage": "info@westvillagevintage.com",
 "ange-archive": "info@angearchive.com",
 "bag-crush": "info@shopbagcrush.com",
 "dear-muse": "rachel.dearmuse@gmail.com",
 "nello-vintage": "nellovintage@gmail.com",
 "situations-vintage": "info@situationsvintage.com",
 "capsule-edit": "capsuledit@gmail.com",
 "mookie-studios": "madeleine@mookiestudios.com",
 "california-boho-studio": "hello@californiabohostudio.com",
 "shiranka-vintage": "info@shirankavintage.com",
 "reine-revival": "kaylendbusiness@gmail.com",
 // VYA admin test account — sees all requests
 "via-admin": "hana@theviaplatform.com",
};

/** Returns all non-empty store contact emails */
export function getAllStoreEmails(): string[] {
 return Object.values(storeContactEmails).filter(Boolean);
}

// Fallback rates used when the live fetch fails (updated April 2026)
const FALLBACK_RATES: Record<string, number> = {
 USD: 1,
 GBP: 1.35,
 EUR: 1.17,
 CAD: 0.73,
 AUD: 0.72,
};

// Module-level rates — updated by refreshExchangeRates() at sync time
let _exchangeRates: Record<string, number> = { ...FALLBACK_RATES };

/**
 * Fetches live exchange rates from Frankfurter (ECB data, no API key required)
 * and updates the module-level rates used by convertCurrencyToUSD.
 * Always call this at the start of a sync so prices reflect today's rates.
 */
export async function refreshExchangeRates(): Promise<void> {
 try {
 const res = await fetch("https://api.frankfurter.app/latest?base=USD", {
 signal: AbortSignal.timeout(5000),
 });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json() as { rates: Record<string, number> };
 // Frankfurter returns rates as "X foreign per 1 USD"
 // Invert to get "USD per 1 foreign unit"
 const fresh: Record<string, number> = { USD: 1 };
 for (const [currency, perUSD] of Object.entries(data.rates)) {
 fresh[currency] = 1 / perUSD;
 }
 _exchangeRates = fresh;
 console.log(
 `[FX] Live rates — GBP:${fresh.GBP?.toFixed(4)} EUR:${fresh.EUR?.toFixed(4)} CAD:${fresh.CAD?.toFixed(4)} AUD:${fresh.AUD?.toFixed(4)}`
 );
 } catch (err) {
 console.warn("[FX] Live fetch failed, using fallback rates:", err);
 _exchangeRates = { ..._exchangeRates, ...FALLBACK_RATES };
 }
}

/**
 * Convert a price to USD given an explicit currency code (e.g. "CAD", "GBP").
 * Uses live rates if refreshExchangeRates() has been called this invocation,
 * otherwise falls back to hardcoded approximations.
 */
export function convertCurrencyToUSD(price: number, currency: string): number {
 if (!currency || currency === "USD") return price;
 const rate = _exchangeRates[currency] ?? FALLBACK_RATES[currency] ?? 1;
 return Math.ceil(price * rate);
}

/**
 * Convert a price to USD based on the store's currency config.
 * Falls back to the store's configured currency if no API currency is available.
 */
export function convertToUSD(price: number, storeSlug: string): number {
 const store = stores.find((s) => s.slug === storeSlug);
 const currency = store?.currency ?? "USD";
 return convertCurrencyToUSD(price, currency);
}
