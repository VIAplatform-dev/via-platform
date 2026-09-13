// Test fixtures for the builder, cut down from real captured stores (read-only, 2026-09-11): Dawn
// (thenicheshop-2 /collections/all), Horizon (gianna-marie-raucher /collections/accessories), Palo
// Alto-style single-link cards, Squarespace (lei-vintage /shop). Only the structure a kit depends on
// is kept; every stylesheet is a one-rule stand-in.

// A capture inlines a stylesheet once, where its <link> first appeared — so only the FIRST card carries it.
const dawnCard = (h: string, t: string, p: string, first = false) => `<li class="grid__item scroll-trigger animate--slide-in">${first ? `<style data-vya-src="component-rating.css">.rating{display:inline-block}</style>` : ""}
<div class="card-wrapper product-card-wrapper underline-links-hover"><div class="card card--standard card--media" style="--ratio-percent: 125.0%;">
<div class="card__inner color-scheme-2 gradient ratio" style="--ratio-percent: 125.0%;"><div class="card__media"><div class="media media--transparent media--hover-effect">
<img src="https://cdn.shop/${h}-1.jpg" alt="${t}" class="motion-reduce" loading="lazy"><img src="https://cdn.shop/${h}-2.jpg" alt="${t}" class="motion-reduce" loading="lazy">
</div></div></div>
<div class="card__content"><div class="card__information"><h3 class="card__heading h5" id="title-template--1__product-grid-8000000${h.length}"><a href="/products/${h}" id="CardLink-template--1__product-grid-8000000${h.length}" class="full-unstyled-link">${t}</a></h3>
<div class="card-information"><div class="price"><div class="price__container"><div class="price__regular"><span class="visually-hidden">Regular price</span><span class="price-item price-item--regular">${p}</span></div></div></div></div></div>
<div class="quick-add no-js-hidden"><product-form><form method="post" action="/cart/add"><button type="submit" name="add" class="quick-add__submit button button--full-width button--secondary"><span>Add to cart</span><span class="sold-out-message hidden">Sold out</span></button></form></product-form></div>
</div></div></div></li>`;

export const DAWN_HOME = `<html><head><style>.shared-theme{color:#111}</style></head><body>
<div id="shopify-section-sections--1__header" class="shopify-section shopify-section-group-header-group"><header><a href="/collections/classics">Classics</a></header></div>
<main><section id="shopify-section-template--9__banner" class="shopify-section section"><h2>Welcome</h2></section></main></body></html>`;

export const DAWN_COLLECTION = `<html><head><style>.shared-theme{color:#111}</style></head><body><main>
<div id="shopify-section-template--1__product-grid" class="shopify-section section"><style>.component-card{display:block}</style>
<div class="section-template--1__product-grid-padding gradient color-scheme-1"><div class="facets-vertical page-width">
<div class="product-grid-container scroll-trigger animate--slide-in" id="ProductGridContainer"><div class="collection">
<ul id="product-grid" data-id="template--1__product-grid" class="grid product-grid grid--2-col-tablet-down grid--4-col-desktop">
${dawnCard("velvet-coat", "Velvet Coat", "$120.00 USD", true)}${dawnCard("silk-skirt", "Silk Skirt", "$80.00 USD")}${dawnCard("leather-bag", "Leather Bag", "$240.00 USD")}${dawnCard("wool-scarf", "Wool Scarf", "$40.00 USD")}
</ul></div></div></div></div></div></main></body></html>`;

const horizonCard = (h: string, t: string, p: string) => `<li id="template--2__main-${h}" class="product-grid__item product-grid__item--0" data-product-id="8549589811372" ref="cards[]">
<product-card class="product-card" data-product-id="8549589811372" id="product-card-${h}"><a href="/products/${h}?variant=46239725125804" class="product-card__link"><span class="visually-hidden">${t}</span></a>
<div class="product-card__content layout-panel-flex layout-panel-flex--column"><div class="card-gallery"><img src="https://cdn.shop/${h}.jpg" alt="${t}"></div>
<div class="product-title-block"><p class="product-title">${t}</p></div><product-price class="price"><span class="price">${p}</span></product-price></div></product-card></li>`;

export const HORIZON_COLLECTION = `<html><head></head><body class="page-width-narrow"><header><div class="shopify-section shopify-section-group-header-group"><a href="/">G</a></div></header><main>
<div id="shopify-section-template--2__main" class="shopify-section"><style>.product-grid{display:grid}</style><results-list class="section product-grid-container color-scheme-1"><div class="collection-wrapper grid gap-style"><div class="grid main-collection-grid"><div>
<ul class="product-grid product-grid--template--2__main product-grid--grid">${horizonCard("loewe-sunnies", "Loewe Square Sunnies", "$250.00")}${horizonCard("prada-belt", "Prada Belt", "$180.00")}${horizonCard("gucci-scarf", "Gucci Scarf", "$90.00")}</ul>
</div></div></div></results-list></div></main></body></html>`;

const sqsCard = (h: string, t: string, p: string) => `<div class="product-list-item" data-product-id="6a2c1f6e2df28c276bf909${h.length}">
<a class="product-list-item-link" href="/site/lei-vintage/shop/p/${h}" aria-label="${t}"><div class="product-list-image-wrapper"><figure class="product-list-item-image"><div class="grid-image-wrapper has-hover-img"><img src="https://images.squarespace-cdn.com/${h}.jpg" alt="${t}"></div></figure></div>
<section class="product-list-item-meta" data-animation-role="content"><div class="product-list-title-price"><div class="product-list-item-title">${t}</div><div class="product-list-item-price">${p}</div></div><div class="product-list-item-status"></div></section></a></div>`;

export const SQS_SHOP = `<html><head><script>Static.SQUARESPACE_CONTEXT = {};</script></head><body><header id="header"><a href="/">Lei</a></header><main class="container"><article class="sections" id="sections">
<section class="page-section product-list-section full-bleed-section" data-section-theme="white"><div class="content-wrapper"><div class="content"><div class="product-list"><div class="product-list-container">
<div class="product-list-layout-container">${sqsCard("chanel-cruise-top", "Chanel 2000 Cruise Top", "$450.00")}${sqsCard("dior-saddle", "Dior Saddle Bag", "$1,900.00")}${sqsCard("fendi-baguette", "Fendi Baguette", "$1,200.00")}</div>
</div></div></div></div></section></article></main><footer id="footer-sections"><section class="page-section"><p>Footer</p></section></footer></body></html>`;

export const SQS_HOME = `<html><head><script>Static.SQUARESPACE_CONTEXT = {};</script></head><body><header id="header"><a href="/shop">Shop</a></header><main><article id="sections"><section class="page-section"><h2>Lei</h2></section></article></main></body></html>`;

export const NO_CARDS = `<html><head></head><body><main><section class="shopify-section"><h2>About us</h2><p>We source by hand.</p><img src="a.jpg"></section></main></body></html>`;

// ── Menus (Step 3) ───────────────────────────────────────────────────────────────────────────────
// Cut from thenicheshop-2's real Dawn header (read-only, 2026-09-12): the SAME five-item menu twice —
// the drawer the phone opens and the inline desktop list — plus the two lists that sit beside it and
// are not menus at all: a 28-country picker whose every href is "#", and a row of social links.
const dawnDrawerItem = (href: string, label: string) => `<li><a href="${href}" class="menu-drawer__menu-item list-menu__item">${label}</a></li>`;
const dawnInlineItem = (href: string, label: string, active = false) =>
 `<li><a href="${href}" class="header__menu-item list-menu__item link${active ? " list-menu__item--active" : ""}"${active ? ' aria-current="page"' : ""}><span>${label}</span></a></li>`;
const DAWN_NAV: [string, string][] = [["/", "Home"], ["/pages/about-us", "About Us"], ["/collections/all", "Our Shoes"], ["/pages/sourcing-styling", "Sourcing & Styling"], ["/blogs/news", "Shoe Blog"]];

export const DAWN_MENU_HOME = `<html><head><style>.shared-theme{color:#111}</style><title>The Heel Vault</title><meta property="og:title" content="The Heel Vault"><link rel="canonical" href="https://theheelvault.com/"></head><body>
<div id="shopify-section-sections--1__header" class="shopify-section shopify-section-group-header-group"><header class="header">
<details class="menu-drawer-container"><summary class="header__icon--menu">Menu</summary><div class="menu-drawer"><ul class="menu-drawer__menu has-submenu list-menu">
${DAWN_NAV.map(([h, l]) => (h === "/collections/all"
 ? `<li><details><summary class="menu-drawer__menu-item list-menu__item">${l}</summary><ul class="menu-drawer__submenu list-menu"><li><a href="/collections/classics" class="menu-drawer__menu-item">Classics</a></li><li><a href="/collections/frontpage" class="menu-drawer__menu-item">Front Page</a></li></ul></details></li>`
 : dawnDrawerItem(h, l))).join("")}
</ul></div></details>
<nav class="header__inline-menu"><ul class="list-menu list-menu--inline">${DAWN_NAV.map(([h, l]) => dawnInlineItem(h, l, h === "/pages/about-us")).join("")}</ul></nav>
<div class="disclosure"><ul class="list-unstyled countries">${["Australia", "Canada", "United States"].map((c) => `<li class="disclosure__item"><a href="#">${c}</a></li>`).join("")}</ul></div>
</header></div>
<main><section id="shopify-section-template--9__banner" class="shopify-section section"><h2>Welcome</h2><a href="/pages/about-us">Read our story</a></section></main>
<div id="shopify-section-sections--2__footer" class="shopify-section shopify-section-group-footer-group"><footer><ul class="list list-social list-unstyled"><li class="list-social__item"><a href="https://www.instagram.com/theheel.vault/">Instagram</a></li><li class="list-social__item"><a href="https://www.tiktok.com/@theheelvault">TikTok</a></li></ul><a href="/pages/client-care">Client care</a></footer></div>
</body></html>`;

/** A landing page of the same store carrying its OWN header — a different menu, which a stored order
 *  must leave alone (signature mismatch). */
export const DAWN_LANDING = `<html><head></head><body>
<div class="shopify-section shopify-section-group-header-group"><header class="header"><nav class="header__inline-menu"><ul class="list-menu list-menu--inline">
<li><a href="/" class="header__menu-item">Home</a></li><li><a href="/pages/catalog" class="header__menu-item">Catalog</a></li><li><a href="/cart" class="header__menu-item">Cart</a></li>
</ul></nav></header></div>
<main><section class="shopify-section"><h2>Landing</h2></section></main></body></html>`;

// lei-vintage's Squarespace header: two `nav.header-nav-list` copies (desktop + mobile overlay), with
// the VYA path baked into every href the way a Plan A capture stores them.
const sqsNav = (active: string) => `<nav class="header-nav-list">${[["/site/lei-vintage/shop", "Shop"], ["/site/lei-vintage/our-story", "Our Story"], ["/site/lei-vintage/contact", "Contact"]]
 .map(([h, l]) => `<div class="header-nav-item header-nav-item--collection${h === active ? " header-nav-item--active" : ""}"><a href="${h}"${h === active ? ' aria-current="page"' : ""}>${l}</a></div>`).join("")}</nav>`;

export const SQS_MENU_HOME = `<html><head><script>Static.SQUARESPACE_CONTEXT = {};</script><title>LEI</title></head><body>
<header id="header"><div class="header-display-desktop">${sqsNav("/site/lei-vintage/shop")}</div><div class="header-menu"><div class="header-menu-nav-wrapper">${sqsNav("")}</div></div></header>
<main><article class="sections" id="sections"><section class="page-section"><div class="content-wrapper"><h2>Lei</h2></div></section></article></main>
<footer id="footer-sections"><section class="page-section"><p>Footer</p></section></footer></body></html>`;

/** A theme that prints the product name a second time inside prose the substitution can't touch: the
 *  card LOOKS usable (image, link, price) but every clone would still name the template's piece. */
export const STALE_TEXT_COLLECTION = `<html><head></head><body><main><div class="shopify-section"><div class="page-width"><ul class="product-grid">
${["Velvet Coat", "Silk Skirt", "Leather Bag"].map((t, i) => `<li class="grid__item"><a href="/products/p${i}"><img src="https://cdn.shop/p${i}.jpg"></a><h3 class="card__heading">${t}</h3><p class="note">${t} is one of a kind and ships from Paris</p><span class="price">$1${i}0.00</span></li>`).join("")}
</ul></div></div></main></body></html>`;

/** A home page whose only grid is a carousel. */
export const SLIDER_HOME = `<html><head></head><body><main><section class="shopify-section section"><div class="collection page-width"><slider-component class="slider-mobile-gutter">
<ul id="Slider-template--3__featured" class="grid product-grid contains-card slider slider--tablet">${dawnCard("a-coat", "A Coat", "$10.00", true)}${dawnCard("b-coat", "B Coat", "$20.00")}${dawnCard("c-coat", "C Coat", "$30.00")}</ul>
</slider-component></div></section></main></body></html>`;
