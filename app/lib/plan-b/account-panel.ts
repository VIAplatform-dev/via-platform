/**
 * The sign-in panel, opened by the seller's own person icon.
 *
 * Deliberately small: an email box and a sentence. A shopper buying one vintage dress will not make
 * a password, and a password they reuse elsewhere is a liability we would rather not hold — so they
 * type an email, we send a link, and clicking it signs them in.
 *
 * The sentence matters as much as the box. Signing in here makes someone THIS SELLER's customer and
 * nothing else; they join the marketplace only by signing in to VYA itself. Telling them so is both
 * the honest thing and the thing that makes the seller comfortable — these are her customers.
 *
 * Every store gets one, including the six whose themes have no account control at all. Where she has
 * an icon a shopper can reach, that icon opens the panel and her header is untouched. Where she has
 * none, the browser adds a small one beside her bag — a store whose shoppers cannot have an account
 * is worse than a header with one more icon in it.
 */
import { bindAccountControls, ACCOUNT_SELECTORS, NOT_ACCOUNT_SOURCE } from "./account-control.ts";

const esc = (v: string) =>
 (v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const PANEL_CSS = `
#vya-account-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99998;display:none}
#vya-account-panel{position:fixed;top:0;right:-420px;width:360px;max-width:90vw;height:100%;background:#fff;color:#111;z-index:99999;transition:right .25s;display:flex;flex-direction:column;box-shadow:-4px 0 30px rgba(0,0,0,.18);font-family:var(--vya-font,system-ui)}
#vya-account-panel.open{right:0}
#vya-account-overlay.open{display:block}
#vya-account-panel .vya-ah{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid rgba(0,0,0,.08)}
#vya-account-panel .vya-ab{padding:22px;flex:1;overflow:auto;font-size:14px;line-height:1.5}
#vya-account-panel input{width:100%;box-sizing:border-box;padding:12px;border:1px solid rgba(0,0,0,.25);border-radius:6px;font:inherit;margin:14px 0 10px}
#vya-account-panel button.vya-primary{width:100%;padding:13px;border:none;border-radius:6px;background:#111;color:#fff;font:600 12px/1 inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
#vya-account-panel .vya-note{opacity:.65;font-size:12.5px;margin-top:14px}
#vya-account-panel .vya-msg{margin-top:14px;font-size:13px}
#vya-account-panel .vya-order{padding:14px 0;border-bottom:1px solid rgba(0,0,0,.08)}
#vya-account-panel .vya-order b{display:block;font-weight:600}
#vya-account-panel .vya-order small{opacity:.65}
#vya-account-panel .vya-order a{color:inherit}`;

/**
 * @param opts.signedInAs the shopper's email when they have a session at this store, else null.
 * @param opts.shopName   the seller's own name — the panel is theirs, not VYA's.
 */
export function injectAccountPanel(html: string, opts: { signedInAs: string | null; shopName: string }): string {
 if (!html) return html;
 if (html.includes("vya-account-panel")) return bindAccountControls(html, { signedInAs: opts.signedInAs });

 const shop = esc(opts.shopName || "this shop");
 const body = opts.signedInAs
  ? `<p>Signed in as <b>${esc(opts.signedInAs)}</b>.</p>
     <div id="vya-account-orders" class="vya-orders"><p class="vya-note">Loading your orders…</p></div>
     <button class="vya-primary" data-vya-signout="1" style="margin-top:18px">Sign out</button>`
  : `<p>Sign in to ${shop} to see your orders and save pieces.</p>
     <input id="vya-account-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address">
     <button class="vya-primary" data-vya-signin="1">Email me a link</button>
     <p class="vya-note">No password. We'll email you a link that signs you in.
     This is an account with ${shop} only — nowhere else.</p>
     <p class="vya-msg" id="vya-account-msg" role="status"></p>`;

 // Asked for only when there is somebody to ask about: a signed-out panel would fire this on every
 // page load of every store to be told "not signed in".
 const ordersScript = opts.signedInAs
  ? `<script>(function(){
 function money(o){return o.total}
 fetch("/api/storefront/account/orders",{headers:{Accept:"application/json"}})
  .then(function(r){return r.json()})
  .then(function(d){
   var box=document.getElementById("vya-account-orders");
   if(!box)return;
   var list=(d&&d.orders)||[];
   if(!list.length){box.innerHTML='<p class="vya-note">No orders yet.</p>';return;}
   box.innerHTML=list.map(function(o){
    var t=o.tracking?('<small>'+(o.tracking.url?'<a href="'+o.tracking.url+'" rel="noopener">Track '+o.tracking.number+'</a>':'Tracking '+o.tracking.number)+'</small>'):'';
    return '<div class="vya-order"><b></b><small class="vya-meta"></small>'+t+'</div>';
   }).join("");
   /* Titles and amounts are written as text, never as markup: an item title is seller-entered. */
   var rows=box.querySelectorAll(".vya-order");
   list.forEach(function(o,i){
    rows[i].querySelector("b").textContent=o.title;
    rows[i].querySelector(".vya-meta").textContent=money(o)+" · "+o.status+(o.placedAt?" · "+o.placedAt:"");
   });
  })
  .catch(function(){});
})();</script>`
  : "";

 const panel = `<style>${PANEL_CSS}</style>
<div id="vya-account-overlay" onclick="VYAAccount.close()"></div>
<div id="vya-account-panel">
 <div class="vya-ah"><b style="text-transform:uppercase;letter-spacing:.1em;font-size:13px">Your account</b><span onclick="VYAAccount.close()" style="cursor:pointer">&times;</span></div>
 <div class="vya-ab">${body}</div>
</div>
<script>window.VYAAccount={
 open:function(){document.getElementById("vya-account-panel").classList.add("open");document.getElementById("vya-account-overlay").classList.add("open");},
 close:function(){document.getElementById("vya-account-panel").classList.remove("open");document.getElementById("vya-account-overlay").classList.remove("open");}};
/* ON WINDOW, IN CAPTURE, AND ON pointerdown TOO. The seller's icon usually sits inside the theme's
   own disclosure widget, whose handler is bound on the element itself and often fires on
   pointerdown — earlier than any click listener can ever run. Listening on window in the capture
   phase puts us ahead of every handler in the page, and stopImmediatePropagation stops the theme's
   from running at all, so her account drawer never half-opens behind our panel. This is exactly
   how her cart is already handled. */
function vyaAccountClick(e){
 var open=e.target.closest&&e.target.closest("[data-vya-account-open]");
 if(open){e.preventDefault();e.stopImmediatePropagation();VYAAccount.open();return;}
 var out=e.target.closest&&e.target.closest("[data-vya-signout]");
 if(out){e.preventDefault();fetch("/api/storefront/account/signout",{method:"POST"}).then(function(){location.reload()});return;}
 var go=e.target.closest&&e.target.closest("[data-vya-signin]");
 if(!go)return;
 e.preventDefault();
 var el=document.getElementById("vya-account-email"),msg=document.getElementById("vya-account-msg");
 var email=(el&&el.value||"").trim();
 if(!email){msg.textContent="Enter your email address.";return;}
 msg.textContent="Sending…";
 fetch("/api/storefront/account/signin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email})})
  .then(function(r){return r.json()})
  /* The same answer whether or not we know the address — see the signin route. */
  .then(function(){msg.textContent="Check your email for a link to sign in.";})
  .catch(function(){msg.textContent="That didn't send. Try again in a moment.";});
}
window.addEventListener("click",vyaAccountClick,true);
/* pointerdown only swallows the theme's own opener; everything else is left to the click above, so
   selecting text or dragging inside the panel still behaves normally. */
window.addEventListener("pointerdown",function(e){
 if(e.target.closest&&e.target.closest("[data-vya-account-open]")){e.preventDefault();e.stopImmediatePropagation();}
},true);

/* CAN A SHOPPER ACTUALLY REACH IT? On three stores the only account link lives in the mobile menu
   drawer or the empty-cart panel — bound correctly and invisible to anyone on a desktop, which is
   the same as having no sign-in at all. Class names lie about this (themes hide by breakpoint, by
   parent, by transform), so the page measures instead, and adds our own entry beside the bag only
   when nothing of hers can be seen. Re-measured on resize: a phone-width page has hers. */
(function(){
 function seen(el){
  var r=el.getBoundingClientRect();
  if(r.width<4||r.height<4)return false;
  /* Off-screen counts as unreachable. One theme parks its whole cart drawer — and the "Have an
     account? Log in" line inside it — beyond the right edge with a transform, so the link keeps a
     perfectly ordinary size and computed style while being nowhere a shopper can click. */
  if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth)return false;
  var s=getComputedStyle(el);
  if(s.visibility==="hidden"||s.display==="none"||Number(s.opacity)<=0.05)return false;
  /* And whatever is actually at those coordinates must be the link itself, not something covering
     it. This is the only check that survives a theme we have never seen. */
  var x=Math.min(Math.max(r.left+r.width/2,1),innerWidth-1);
  var y=Math.min(Math.max(r.top+r.height/2,1),innerHeight-1);
  var hit=document.elementFromPoint(x,y);
  return !!hit&&(hit===el||el.contains(hit)||hit.contains(el));
 }
 /* BIND HERS IN THE BROWSER TOO.
    Three stores build their header in JavaScript after the page loads — Shopify's newer themes
    create <button class="account-button" aria-label="Account"> at runtime — so the server never saw
    it. Hers stayed unbound and pointing at a dead login page, our check found nothing reachable,
    and the shopper got her person icon AND our corner button. Same selector list as the server
    (imported, not retyped, so the two cannot drift). */
 var SEL=${JSON.stringify(ACCOUNT_SELECTORS)};
 var NOT=new RegExp(${JSON.stringify(NOT_ACCOUNT_SOURCE)},"i");
 function bindLate(){
  var found=document.querySelectorAll(SEL);
  for(var i=0;i<found.length;i++){
   var el=found[i];
   if(el.hasAttribute("data-vya-account-open"))continue;
   /* A control nested inside another match would be bound twice, and "log out" is never a sign-in. */
   if(el.parentElement&&el.parentElement.closest(SEL))continue;
   var says=(el.getAttribute("href")||"")+" "+(el.getAttribute("aria-label")||"")+" "+(el.textContent||"");
   if(NOT.test(says))continue;
   el.setAttribute("data-vya-account-open","1");
   el.removeAttribute("href");
   if(!/cursor\s*:/.test(el.getAttribute("style")||""))el.style.cursor="pointer";
  }
 }

 function ensure(){
  var mine=document.getElementById("vya-account-fallback");
  var hers=[].slice.call(document.querySelectorAll("[data-vya-account-open]"))
   .filter(function(el){return el!==mine}).some(seen);
  if(hers){if(mine)mine.remove();return;}
  if(mine)return;
  var a=document.createElement("a");
  a.id="vya-account-fallback";
  a.setAttribute("data-vya-account-open","1");
  a.setAttribute("aria-label","Account");
  a.setAttribute("role","button");
  a.setAttribute("tabindex","0");
  /* ALWAYS THE SAME CORNER, never inside her header.
     Three rounds of trying to slot it beside her bag ended the same way: where it did land in a
     header it landed next to a person-shaped icon she already had — we-thieves' points at
     /favorites, thenicheshop's at something of its own — so a shopper saw two identical glyphs and
     had to guess which was which. We cannot know what her other icons mean, and guessing wrong in
     her header is worse than sitting somewhere plain. Same place on every store, above the bag
     pill where there is one. */
  a.style.cssText="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;"+
   "position:fixed;right:20px;z-index:99997;background:#111;color:#fff;border-radius:999px;padding:11px;"+
   "box-shadow:0 4px 16px rgba(0,0,0,.22)";
  a.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="3.25"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/></svg>';
  document.body.appendChild(a);
  place(a);
 }

 /* Stack above anything else of ours that is genuinely PINNED in that corner — today only the bag
    pill. Position is read rather than assumed: the powered-by line used to be pinned here too, and
    this sat straight on top of it; now it lives in the footer and must not push this up. */
 function place(a){
  var below=[document.getElementById("vya-cart-btn"),document.querySelector(".vya-powered")]
   .filter(function(el){return el&&el!==a&&getComputedStyle(el).position==="fixed"&&seen(el)})
   .map(function(el){return innerHeight-el.getBoundingClientRect().top+12});
  base=below.length?Math.max.apply(null,below):20;
  a.style.right="20px";a.style.left="auto";a.style.bottom=base+"px";
 }
 /* AND THEN GET OUT OF THE WAY. That corner belongs to whoever is already in it — one store runs
    a chat widget there, which loaded after us and covered our button completely. Ours is the
    newcomer, so ours is the one that moves: up the right edge first, then to the other side. */
 function clear(a){
  var tries=[0,72,144,216];
  for(var i=0;i<tries.length;i++){
   a.style.bottom=(base+tries[i])+"px";
   if(seen(a))return;
  }
  a.style.right="auto";a.style.left="20px";a.style.bottom=base+"px";
  if(!seen(a))a.style.bottom=(base+72)+"px";
 }
 var base=20;
 function refresh(){
  bindLate();
  ensure();
  var mine=document.getElementById("vya-account-fallback");
  if(mine&&mine.style.position==="fixed"){place(mine);clear(mine)}
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh);
 else refresh();
 addEventListener("resize",refresh);
 /* The theme can finish rendering its header long after DOMContentLoaded — one store swaps its
    whole header in on hydration — so ask once more when everything has settled. */
 addEventListener("load",refresh);
 /* Chat widgets, cookie bars and consent banners arrive seconds after load. Measuring once at load
    is measuring the wrong page, so ask again after they have had their turn. */
 setTimeout(refresh,1500);setTimeout(refresh,4000);
 /* And watch, because a fixed schedule is still a guess. A theme that builds its header on
    hydration, a menu that opens, a banner that closes — each changes the answer to "can a shopper
    reach her account link", and each is a DOM change. Debounced, so a busy page costs one pass. */
 if(window.MutationObserver){
  var pending=0;
  new MutationObserver(function(){
   if(pending)return;
   pending=setTimeout(function(){pending=0;refresh()},400);
  }).observe(document.documentElement,{childList:true,subtree:true});
 }
})();</script>${ordersScript}`;

 const bound = bindAccountControls(html, { signedInAs: opts.signedInAs });
 return bound.indexOf("</body>") !== -1 ? bound.replace("</body>", panel + "</body>") : bound + panel;
}
