// Static markup ported verbatim from the VYA infrastructure mockup (body only,
// scripts excluded). Rendered via dangerouslySetInnerHTML inside the #infra
// wrapper so the inline styles / SVGs stay faithful; the JS runs in useEffect.
export const infraMarkup = `<div class="grain"></div>

<header id="hdr">
  <div class="wrap">
    <nav>
      <a class="brandmark" href="#top"><img class="logo-img" src="https://vyaplatform.com/vya-logo.png" alt="VYA"></a>
      <div class="nav-links"><a href="#platform">Platform</a><a href="#listing">Listing</a><a href="#build">Build a site</a><a href="#trends">Trends</a><a href="#edit">VYA Platform</a></div>
      <div class="nav-cta"><a class="btn btn-dark" href="#book">Book a demo</a></div>
    </nav>
  </div>
</header>

<section class="hero" id="top">
  <div class="hero-bg"></div>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="hero-grid"></div><div class="hero-veil"></div>
  <div class="wrap">
    <div class="hero-inner">
      <div>
        <div class="eyebrow fade" style="margin-bottom:26px">Economic infrastructure for the one-of-a-kind economy</div>
        <h1 class="serif"><span class="h-line"><span>The infrastructure</span></span><span class="h-line"><span>for <span class="it">recommerce</span>.</span></span></h1>
        <p class="sub fade">Every other platform is built for inventory that repeats. Yours sells once and never comes back. VYA is the storefront, the listing engine, and the marketplace. Built for one-of-one.</p>
        <div class="actions fade"><a class="btn btn-dark" href="#book">Book a demo</a><a class="btn btn-ghost" href="#listing">See how it works</a></div>
        <div class="meta fade">Built for one-of-one. Made for scale.</div>
      </div>
      <div class="hero-vis">
        <div class="shopfloat" id="shopfloat"></div>
        <div class="dash-float"><div class="av">V</div><div><div class="nm">1970s suede jacket</div><div class="sm">Sold · $168 · paid out</div></div></div>
      </div>
    </div>
  </div>
</section>

<section class="manifesto" id="manifesto">
  <div class="wrap">
    <div class="index reveal"><span class="ix">01</span> The thesis</div>
    <p class="big serif reveal d1">Ecommerce was built to sell the same thing twice. Vintage <em>never</em> does. Every piece is the only one there is.</p>
    <p class="note reveal d2">VYA is the infrastructure built for exactly that: one-of-one, end to end.</p>
  </div>
</section>

<section class="section" id="platform" style="background:var(--paper)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="index"><span class="ix">02</span> The platform</div>
      <h2 class="serif">Everything you need to sell the unrepeatable.</h2>
      <p>One tool, front to back, no Shopify, no app stack, no cobbling five subscriptions together.</p>
    </div>
    <div class="flist reveal d1">
      <div class="frow"><div class="fi">01</div><h3>Snap to listing</h3><p>Photograph a piece. VYA cleans it onto a ghost mannequin and drafts the whole listing. You confirm a detail or two.</p></div>
      <div class="frow"><div class="fi">02</div><h3>Your own storefront</h3><p>Your brand, your customers, your data, not a layer on someone else's platform.</p></div>
      <div class="frow"><div class="fi">03</div><h3>One-of-one inventory</h3><p>Quantity one, done right. Sold means gone: instantly, everywhere.</p></div>
      <div class="frow"><div class="fi">04</div><h3>Payments &amp; payouts</h3><p>Checkout, payouts, and splits handled natively. Paid to your bank on schedule.</p></div>
    </div>
  </div>
</section>

<section class="section" id="listing" style="background:var(--cream)">
  <div class="wrap">
    <div class="trend-split">
      <div class="reveal">
        <div class="index"><span class="ix">03</span> The listing flow</div>
        <h2 class="serif" style="font-size:clamp(30px,4.2vw,52px);font-weight:500;letter-spacing:-.018em;margin:20px 0 18px;line-height:1.02">As easy as texting<br>a friend about a find.</h2>
        <p style="color:var(--ink-soft);font-size:17px;max-width:480px">No fifteen-field form. Send a photo, say a casual line, "Anna Molinari, F/W 2004 dress", and VYA cleans the photo onto a ghost mannequin, reads the piece, and drafts the listing. It only asks what it genuinely can't know, one quick tap at a time.</p>
        <div class="voice-note" style="margin-top:24px;border-left:2px solid var(--oxblood);padding:13px 0 13px 18px;max-width:480px">
          <div class="lab" style="color:var(--oxblood);margin-bottom:6px">Written in your voice</div>
          <p style="color:var(--ink-soft);font-size:15px">VYA reads through your past listings to learn how you write, your tone, the details you always call out, and drafts every new listing to match. It still sounds like your store, not a template.</p>
        </div>
        <p style="color:var(--mauve);font-size:15px;margin-top:18px;font-style:italic;font-family:var(--head)">Try it: tap to answer VYA and post the listing.</p>
      </div>
      <div class="reveal d1">
        <div class="cd" id="cd">
          <div class="cd-head"><div class="cd-av">V</div><div><div style="font-size:14px;font-weight:500">VYA</div><div class="lab" style="font-size:12px;color:var(--mute)">New listing</div></div></div>
          <div class="cd-stream">
            <div class="cd-photo cdb" id="cdPhoto" style="background:#6f6153 url('/infrastructure/listing-example.jpg') center/cover"><span>IMG_2847</span></div>
            <div class="cdb me" id="cdM1">just got this anna molinari fw 2004 dress</div>
            <div class="typing" id="cdT1"><i></i><i></i><i></i></div>
            <div class="cdb vy" id="cdM2">On it. Cleaning your photo onto a ghost mannequin and reading the piece.</div>
            <div class="typing" id="cdT2"><i></i><i></i><i></i></div>
            <div class="cd-card cdb" id="cdCard"><div style="display:flex;gap:11px;align-items:flex-start"><div class="cd-ghost" style="width:52px;height:66px;border-radius:8px;flex:none;background:#f5efe4 url('/infrastructure/listing-ghost.jpg') center/cover;border:1px solid var(--line)"></div><div style="flex:1"><div class="t">Anna Molinari · F/W 2004 dress<span class="cd-live" id="cdLive">● live</span></div><div class="chips"><span class="cdchip">F/W 2004</span><span class="cdchip">Silk chiffon</span><span class="cdchip">Beaded bodice</span><span class="cdchip">Excellent</span></div></div></div></div>
            <div class="typing" id="cdT3"><i></i><i></i><i></i></div>
            <div class="cdb vy" id="cdM4">Two quick things. What size is it, and what do you want to list it at? Comps put it around $420.</div>
            <div class="cdb me" id="cdM5">Size S · $420</div>
          </div>
          <div class="cd-foot">
            <div class="cd-controls" id="cdControls">
              <div class="qrow"><span class="qlabel">Size</span><button class="qchip" data-size="XS">XS</button><button class="qchip" data-size="S">S</button><button class="qchip" data-size="M">M</button><button class="qchip" data-size="L">L</button></div>
              <div class="qrow" id="cdPriceRow" style="display:none"><span class="qlabel">List at</span><button class="qchip" data-price="$380">$380</button><button class="qchip" data-price="$420">$420</button><button class="qchip" data-price="$460">$460</button></div>
            </div>
            <div class="cd-post" id="cdPost">Tap a size to continue</div>
            <div class="cd-success" id="cdSuccess">✓ Listed in 12s. Live on your store + Depop + eBay</div>
            <button class="cd-replay" id="cdReplay">↻ Replay the demo</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="build" style="background:var(--paper)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="index"><span class="ix">04</span> Make your store</div>
      <h2 class="serif">Build your store from a sentence.</h2>
      <p>Describe your shop and VYA designs it, or drop in your existing site and we'll bring it over, listings and all.</p>
    </div>
    <div class="build">
      <div class="build-input reveal">
        <div class="tabs"><button class="tab on" data-tab="desc">Describe it</button><button class="tab" data-tab="import">Import a site</button></div>
        <div id="paneDesc">
          <textarea id="prompt" rows="3">The Vintage Guild. We curate 80s &amp; 90s pieces focused on quality and timelessness. Black and white, old money.</textarea>
          <div class="chips-row"><span class="pchip">Old money · B&amp;W</span><span class="pchip">Warm &amp; earthy</span><span class="pchip">Bold &amp; playful</span><span class="pchip">Dark &amp; moody</span></div>
          <button class="btn btn-dark buildbtn" id="buildBtn">Build my store →</button>
        </div>
        <div id="paneImport" style="display:none">
          <input class="url-in" id="importUrl" value="sassysowhat.com" placeholder="paste your Shopify, Etsy, or Instagram shop">
          <div class="impnote">We'll import your listings, photos, and details, and rebuild them as a VYA store.</div>
          <button class="btn btn-dark buildbtn" id="importBtn">Import my store →</button>
        </div>
      </div>
      <div class="build-result reveal d1">
        <div class="gen" id="genState"><span class="spin"></span> Designing your storefront…</div>
        <div class="browser result-store" id="resultStore">
          <div class="bbar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="url">vyaplatform.com</span></div>
          <iframe class="sf-clone" id="sfClone" title="Site preview" sandbox="allow-scripts allow-popups allow-forms" referrerpolicy="no-referrer" loading="lazy"></iframe>
          <div class="store sf">
            <div class="sf-announce">Complimentary tracked shipping on orders over $150</div>
            <div class="sf-nav"><div class="sf-brand serif">VYA</div><div class="sf-links"><span>Home</span><span>Shop</span><span>About</span><span>Contact</span></div></div>
            <div class="sf-hero">
              <div class="nm serif">VYA</div>
              <div class="tg">Curated vintage · worldwide</div>
              <div class="sf-cta">Shop the collection</div>
            </div>
            <div class="pgrid">
              <div class="prod"><div class="img ph" style="background:linear-gradient(150deg,#2c241d30,#5D0F1720)"></div></div>
              <div class="prod"><div class="img ph" style="background:linear-gradient(150deg,#2c241d20,#5D0F171c)"></div></div>
              <div class="prod"><div class="img ph" style="background:linear-gradient(150deg,#2c241d3a,#5D0F1726)"></div></div>
              <div class="prod"><div class="img ph" style="background:linear-gradient(150deg,#2c241d1c,#5D0F1718)"></div></div>
            </div>
          </div>
        </div>
        <div class="result-tag" id="resultTag">✓ Store ready. Published to vyaplatform.com</div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="models" style="background:var(--cream)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="index"><span class="ix">05</span> Every way you do resale</div>
      <h2 class="serif">Built for owned, consignment, and rental.</h2>
      <p>Vintage businesses don't only sell what they own. VYA runs every model in one place, so nothing about how you actually operate gets left out.</p>
    </div>
    <div class="grid3c">
      <div class="card reveal"><div class="mode">Owned</div><h3>Sell what you've sourced</h3><p>Sell your finds direct. Listing to payout, handled natively.</p></div>
      <div class="card reveal d1"><div class="mode">Consignment</div><h3>Take pieces on consignment</h3><p>Custom splits per item, automatic payouts to every consignor, and each one gets their own view to track sales.</p></div>
      <div class="card reveal d2"><div class="mode">Rental</div><h3>Lend the pieces too good to part with</h3><p>Rent archival pieces with calendars, deposits, and condition checks built in, so one-of-one earns again and again.</p></div>
    </div>
  </div>
</section>

<section class="section" id="analytics" style="background:var(--paper)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="index"><span class="ix">06</span> Built-in analytics</div>
      <h2 class="serif">Your business, measured.</h2>
      <p>Revenue, sell-through, days-to-sell, payouts. The numbers a serious resale business runs on, in plain view.</p>
    </div>
    <div class="an-grid">
      <div class="panel reveal">
        <div class="ph"><div><div class="lab">Gross sales · last 12 months</div><div class="big">$148,200</div></div><div class="up">▲ 31% YoY</div></div>
        <div style="display:flex;gap:18px;margin-bottom:10px;font-family:var(--label);font-size:13px;font-weight:600;letter-spacing:.04em;color:var(--ink-soft)">
          <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#5d1620"></span>Gross sales</span>
          <span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:#9b8b76"></span>Cost of goods</span>
        </div>
        <svg class="area" viewBox="0 0 700 200" preserveAspectRatio="none">
          <defs><linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d1620" stop-opacity=".2"/><stop offset="1" stop-color="#5d1620" stop-opacity="0"/></linearGradient></defs>
          <path class="area-fill" d="M0,170 C70,160 110,150 170,140 C240,128 270,150 340,120 C410,92 450,108 520,72 C590,40 640,50 700,22 L700,200 L0,200 Z" fill="url(#ag2)"/>
          <path d="M0,182 C70,174 110,170 170,163 C240,156 270,164 340,150 C410,135 450,142 520,121 C590,101 640,105 700,90" fill="none" stroke="#9b8b76" stroke-width="2.2" stroke-dasharray="6 5"/>
          <path class="area-line" d="M0,170 C70,160 110,150 170,140 C240,128 270,150 340,120 C410,92 450,108 520,72 C590,40 640,50 700,22" fill="none" stroke="#5d1620" stroke-width="2.6"/>
          <circle class="dot-end" cx="698" cy="23" r="5" fill="#5d1620"/>
        </svg>
        <div class="minitiles"><div class="mt"><div class="t">Avg sale</div><div class="v">$359</div></div><div class="mt"><div class="t">Gross margin</div><div class="v">37%</div></div><div class="mt"><div class="t">Net profit</div><div class="v">$54.8k</div></div></div>
      </div>
      <div class="panel reveal d1">
        <div class="ph"><div class="lab">Sell-through · 90 days</div></div>
        <div class="donut-wrap">
          <svg class="donut" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#efe6d7" stroke-width="11"/><circle class="dval" cx="60" cy="60" r="50" fill="none" stroke="#5d1620" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)"/><text class="donut-c" x="60" y="68" text-anchor="middle">71%</text></svg>
          <div class="lab" style="color:var(--mute);margin-top:10px">Above the 50% vintage benchmark</div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" id="trends" style="background:var(--cream)">
  <div class="wrap">
    <div class="trend-split">
      <div class="trend-chart reveal">
        <div style="margin-bottom:16px"><div class="lab">Demand index · Y2K denim</div><div class="serif" style="font-size:28px;font-weight:500">▲ 42% this quarter</div></div>
        <svg class="area" viewBox="0 0 660 220" preserveAspectRatio="none">
          <defs><linearGradient id="ag3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d1620" stop-opacity=".2"/><stop offset="1" stop-color="#5d1620" stop-opacity="0"/></linearGradient></defs>
          <path class="area-fill" d="M0,180 C60,176 100,170 160,166 C230,160 260,150 330,130 C400,110 440,128 500,86 C560,48 610,60 660,24 L660,220 L0,220 Z" fill="url(#ag3)"/>
          <path class="area-line" d="M0,180 C60,176 100,170 160,166 C230,160 260,150 330,130 C400,110 440,128 500,86 C560,48 610,60 660,24" fill="none" stroke="#5d1620" stroke-width="2.6"/>
          <circle class="dot-end" cx="658" cy="25" r="5" fill="#5d1620"/>
        </svg>
      </div>
      <div class="reveal d1">
        <div class="index"><span class="ix">07</span> Trend intelligence</div>
        <h2 class="serif" style="font-size:clamp(26px,3.6vw,40px);font-weight:500;letter-spacing:-.014em;margin:18px 0 12px;line-height:1.04">Know what's next,<br>before you source it.</h2>
        <p style="color:var(--ink-soft);font-size:16px">VYA reads demand across every store and sale on the platform, so you source what's rising, list what moves, and price where it sells.</p>
        <div class="trend-panel">
          <div class="trend-row"><span class="name serif">Y2K denim</span><span class="right"><span class="bar"><i data-w="88%"></i></span><span class="up">▲ 42%</span></span></div>
          <div class="trend-row"><span class="name serif">Archival Margiela</span><span class="right"><span class="bar"><i data-w="79%"></i></span><span class="up">▲ 36%</span></span></div>
          <div class="trend-row"><span class="name serif">90s minimalism</span><span class="right"><span class="bar"><i data-w="71%"></i></span><span class="up">▲ 28%</span></span></div>
          <div class="trend-row"><span class="name serif">Boho revival</span><span class="right"><span class="bar"><i data-w="64%"></i></span><span class="up">▲ 24%</span></span></div>
        </div>
        <p class="serif" style="color:var(--mauve);font-size:16px;margin-top:16px;font-style:italic">An edge no sync-tool can match.</p>
      </div>
    </div>
  </div>
</section>

<section class="section" id="edit" style="background:var(--paper)">
  <div class="wrap">
    <div class="sec-head reveal">
      <div class="index"><span class="ix">08</span> Two sides, one brand</div>
      <h2 class="serif">Run your store. Reach the world.</h2>
      <p>VYA powers your own storefront, and connects it to VYA Platform, the marketplace where shoppers discover the world's best vintage, all in one place.</p>
    </div>
    <div class="two">
      <div class="side reveal">
        <div class="tag">Infrastructure · for sellers</div><h3 class="serif">VYA</h3>
        <p>The platform you run your resale business on. Listing, storefront, inventory, consignment, rental, and payouts in one place.</p>
        <ul><li>Your own branded storefront</li><li>AI listing &amp; one-of-one inventory</li><li>Consignment splits &amp; rental built in</li><li>Every store carries "powered by VYA"</li></ul>
      </div>
      <div class="side edit reveal d1">
        <div class="tag">Marketplace · for buyers</div><h3 class="serif">VYA Platform</h3>
        <p>The first online department store for vintage and secondhand. A curated destination where shoppers discover one-of-a-kind pieces across every VYA store.</p>
        <span class="live"><span class="dot"></span> Now live in pilot</span>
        <ul><li>Opt your inventory in with one toggle</li><li>New buyers, beyond your own audience</li><li>Curated by era, designer &amp; collection</li></ul>
      </div>
    </div>
  </div>
</section>

<section class="section start" id="start" style="background:var(--cream)">
  <div class="wrap">
    <div class="reveal">
      <div class="index" style="justify-content:center"><span class="ix">09</span> Getting started</div>
      <h2 class="serif" style="font-size:clamp(34px,4.6vw,56px);font-weight:500;letter-spacing:-.018em;margin-top:18px">Live in minutes, not weeks.</h2>
      <p style="color:var(--ink-soft);font-size:17px;max-width:540px;margin:16px auto 0">No code, no Shopify, no app stack. If you can text a photo, you can open a store.</p>
    </div>
    <div class="grid3">
      <div class="stepcard reveal"><div class="k">01</div><h4>Sign up</h4><p>Create your VYA store in a couple of minutes. Pick your name, your look. Done.</p></div>
      <div class="stepcard reveal d1"><div class="k">02</div><h4>Add your pieces</h4><p>Snap or import your inventory and VYA drafts every listing for you. Owned, consignment, or rental.</p></div>
      <div class="stepcard reveal d2"><div class="k">03</div><h4>Go live</h4><p>Publish your storefront and opt into VYA Platform to reach buyers from day one.</p></div>
    </div>
    <div style="margin-top:48px" class="reveal"><a class="btn btn-dark" href="#book" style="padding:15px 34px">Book a demo</a></div>
  </div>
</section>

<section class="stats" id="network">
  <canvas class="netcv"></canvas>
  <div class="wrap">
    <div class="index reveal" style="color:#e3b79e;margin-bottom:6px"><span class="ix" style="color:#caa996">10</span> The opportunity</div>
    <h2 class="nethead serif reveal d1">You're not just opening a store. You're building on the infrastructure for the <em>one-of-a-kind economy</em>.</h2>
    <div class="stat-top">
      <div class="stat reveal"><div class="n" data-count="393" data-prefix="$" data-suffix="B">$0B</div><div class="l">Global secondhand apparel market by 2030, growing ~10% a year.</div></div>
      <div class="stat reveal d1"><div class="n" data-count="4" data-suffix="×">0×</div><div class="l">US resale is growing roughly four times faster than retail overall.</div></div>
      <div class="stat reveal d2"><div class="n" data-count="71" data-suffix="%">0%</div><div class="l">Of resale's growth through 2030 comes from Gen Z and Millennials.</div></div>
    </div>
    <div class="market-chart reveal">
      <div class="cap"><span>The market we're building for</span><span>US resale 2020 → 2030 ↗ $78.8B</span></div>
      <svg class="area" viewBox="0 0 1108 150" preserveAspectRatio="none">
        <defs><linearGradient id="ag4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3b79e" stop-opacity=".4"/><stop offset="1" stop-color="#e3b79e" stop-opacity="0"/></linearGradient></defs>
        <path class="area-fill" d="M0,134 C150,128 250,120 380,104 C520,86 600,96 740,64 C880,32 980,40 1108,10 L1108,150 L0,150 Z" fill="url(#ag4)"/>
        <path class="area-line" d="M0,134 C150,128 250,120 380,104 C520,86 600,96 740,64 C880,32 980,40 1108,10" fill="none" stroke="#e3b79e" stroke-width="2.4"/>
        <circle class="dot-end" cx="1106" cy="11" r="5" fill="#e3b79e"/>
      </svg>
    </div>
  </div>
</section>

<section class="cta" id="book" style="scroll-margin-top:74px">
  <div class="blob cb1"></div><div class="blob cb2"></div>
  <div class="wrap">
    <h2 class="serif reveal">Sell the <span class="it">unrepeatable</span>.</h2>
    <p class="reveal d1">Join the sellers building one-of-a-kind businesses on infrastructure made for exactly that.</p>
    <form id="join" class="join-form reveal d2" action="https://formspree.io/f/xbdvdjog" method="POST" style="scroll-margin-top:100px">
      <input type="email" name="email" required placeholder="your email">
      <button type="submit" class="btn btn-dark">Book a demo</button>
    </form>
    <p class="reveal d2" style="margin-top:16px;font-family:var(--label);font-size:14px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mauve)">Drop your email and we'll set up your demo</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-top">
      <div style="max-width:300px"><img class="logo-img" src="https://vyaplatform.com/vya-logo.png" alt="VYA" style="height:38px"><p style="margin-top:14px;font-size:14px;color:var(--mute)">The infrastructure for recommerce. Built for one-of-one.</p></div>
      <div class="foot-cols">
        <div><h4>Platform</h4><a href="#listing">Listing engine</a><a href="#build">Storefront builder</a><a href="#models">Consignment &amp; rental</a><a href="#analytics">Analytics</a><a href="#trends">Trends</a></div>
        <div><h4>Company</h4><a href="#manifesto">Manifesto</a><a href="#edit">VYA Platform</a><a href="#network">The opportunity</a></div>
        <div><h4>Sellers</h4><a href="#book">Book a demo</a><a href="#build">Build a store</a><a href="#">Help center</a><a href="#">Community</a></div>
      </div>
    </div>
    <div class="foot-bottom"><span>© 2026 VYA. All rights reserved.</span><span>Economic infrastructure for the one-of-a-kind economy.</span></div>
  </div>
</footer>`;
