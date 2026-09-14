/**
 * Saved pieces on a seller's own storefront — her customers' wishlists, on her shop.
 *
 * A shopper puts a heart on a piece and finds it again later, on any page of the shop, without
 * making an account. It is off until the seller turns it on (storefront_settings.wishlist_enabled),
 * because a heart is a promise that the piece can be come back for, and on one-of-one vintage that
 * is her call rather than ours.
 *
 * HER CARD IS NOT TOUCHED. On an imported store a product card is the seller's own markup, cloned
 * from her theme and filled with live data by injectCollectionItems — a function a dozen shops
 * depend on. Building the heart into it would put a wishlist inside her grid's blast radius. So the
 * browser finds pieces the way a shopper does, by their address (/products/…), and lays a heart over
 * each link. The theme's markup, classes and layout are untouched; remove the feature and the page
 * is byte-for-byte what it was.
 *
 * SIGNED IN TO HER SHOP, AND NOWHERE ELSE. Saving requires a store session — the magic-link sign-in
 * the account panel already offers (see account-panel.ts), scoped to this seller's shop alone. No
 * password is ever made; a shopper types an email and clicks a link.
 *
 * The heart is shown to everyone. A signed-out shopper who taps it gets the sign-in panel, not a
 * silent failure and not a heart that fills in and forgets — the piece they were reaching for is
 * saved the moment they come back. That is the honest order: ask at the point they wanted
 * something, never before.
 *
 * Browsing stays anonymous. Product views are still counted against an unnamed cookie, because
 * counting how many people looked needs no name. Only saving asks who you are.
 *
 * WORKS ON BOTH KINDS OF STOREFRONT, because both are served through the same route: the imported
 * copy of a shop and the one built from sections.
 */
const esc = (v: string) =>
 (v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A value for the injected <script>. HTML entities do NOT decode inside a script element, so the
 * HTML escaper above produces literal "&#39;" there; and JSON.stringify on its own still lets a
 * shop called `</script><img onerror=…>` close the block. Escaping "<" as \u003c closes both.
 */
const js = (v: unknown): string => JSON.stringify(v ?? "").replace(/</g, "\\u003c");

const CSS = `
.vya-heart{position:absolute;top:8px;right:8px;z-index:5;width:32px;height:32px;border:none;border-radius:50%;
 background:rgba(255,255,255,.92);color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;
 padding:0;box-shadow:0 1px 4px rgba(0,0,0,.18);opacity:0;transition:opacity .18s,transform .12s;-webkit-tap-highlight-color:transparent}
.vya-heart svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8}
.vya-heart[aria-pressed="true"] svg{fill:currentColor;stroke:currentColor}
.vya-heart:active{transform:scale(.88)}
.vya-hw:hover .vya-heart,.vya-heart[aria-pressed="true"],.vya-heart:focus-visible{opacity:1}
/* A touch screen has no hover, so the heart would never appear on a phone. */
@media (hover:none){.vya-heart{opacity:1}}
.vya-hw{position:relative}
#vya-wl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99998;display:none}
#vya-wl-overlay.open{display:block}
#vya-wl{position:fixed;top:0;right:-420px;width:370px;max-width:92vw;height:100%;background:#fff;color:#111;z-index:99999;
 transition:right .25s;display:flex;flex-direction:column;box-shadow:-4px 0 30px rgba(0,0,0,.18);font-family:var(--vya-font,system-ui)}
#vya-wl.open{right:0}
#vya-wl .vya-wh{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid rgba(0,0,0,.08)}
#vya-wl .vya-wb{padding:18px 20px;flex:1;overflow:auto;font-size:14px;line-height:1.5}
#vya-wl .vya-note{opacity:.65;font-size:12.5px}
#vya-wl .vya-row{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(0,0,0,.07);align-items:center}
#vya-wl .vya-row img{width:56px;height:70px;object-fit:cover;background:#f2f2f2;flex:none}
#vya-wl .vya-row a{color:inherit;text-decoration:none;flex:1;min-width:0}
#vya-wl .vya-row b{display:block;font-weight:500;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vya-wl .vya-row small{opacity:.7;font-size:12.5px}
#vya-wl .vya-gone{opacity:.55}
#vya-wl .vya-x{border:none;background:none;cursor:pointer;opacity:.45;font-size:17px;line-height:1;padding:6px}
#vya-wl-count{display:none;min-width:16px;height:16px;border-radius:8px;background:#111;color:#fff;font:600 10px/16px system-ui;text-align:center;padding:0 4px}
#vya-wl-count.on{display:inline-block}
#vya-wl-fab{position:fixed;right:18px;bottom:18px;z-index:99990;width:46px;height:46px;border:none;border-radius:50%;
 background:#fff;color:#111;box-shadow:0 2px 12px rgba(0,0,0,.22);cursor:pointer;display:none;align-items:center;justify-content:center;padding:0}
#vya-wl-fab.on{display:flex}
#vya-wl-fab svg{width:20px;height:20px;fill:currentColor;stroke:currentColor;stroke-width:1.6}
#vya-wl-fab b{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;border-radius:9px;background:#111;color:#fff;
 font:600 10px/18px system-ui;text-align:center;padding:0 4px}`;

const HEART_SVG =
 '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6 4.3 12.9a4.7 4.7 0 0 1 0-6.6 4.6 4.6 0 0 1 6.6 0l1.1 1.1 1.1-1.1a4.6 4.6 0 0 1 6.6 0 4.7 4.7 0 0 1 0 6.6Z"/></svg>';

/**
 * @param opts.slug      the store, for the favourite endpoints.
 * @param opts.shopName  her shop's name — the drawer is hers, not VYA's.
 * @param opts.apiBase   where the favourite routes live. Empty on her own domain (same origin);
 *                       the VYA origin when the page is served from a /site/… path, because a
 *                       relative /api/… there would resolve against the wrong host.
 */
export function injectWishlist(html: string, opts: { slug: string; shopName: string; apiBase?: string }): string {
 if (!html) return html;
 if (html.includes("vya-wl-overlay")) return html; // already ours
 if (!/<\/body>/i.test(html)) return html; // a fragment, not a document

 const shopName = opts.shopName || "this shop";

 const markup = `<style>${CSS}</style>
<div id="vya-wl-overlay" onclick="VYAWish.close()"></div>
<aside id="vya-wl" aria-label="Saved pieces" aria-hidden="true">
 <div class="vya-wh"><b style="text-transform:uppercase;letter-spacing:.1em;font-size:13px">Saved</b><span onclick="VYAWish.close()" style="cursor:pointer" role="button" aria-label="Close">&times;</span></div>
 <div class="vya-wb" id="vya-wl-body"><p class="vya-note">Loading…</p></div>
</aside>
<script>(function(){
 var API=${js(opts.apiBase || "")},SLUG=${js(opts.slug)},SHOP=${js(shopName)};
 var HEART=${js(HEART_SVG)};
 var state={};           /* ref -> saved? , as far as this page knows */
 var signedIn=false;     /* until the list says otherwise */

 function money(c,cur){
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency:cur||"USD"}).format((c||0)/100)}
  catch(e){return "$"+((c||0)/100).toFixed(2)}
 }
 /* The piece a link points at. Kept in step with app/lib/plan-b/wishlist-core.ts, which is where
    this logic is tested — the browser cannot import it, so the two are written to match. */
 function refOf(href){
  if(!href)return null;
  var m=/\\/products\\/([^/?#]+)/i.exec(href);
  if(!m)return null;
  var r;try{r=decodeURIComponent(m[1])}catch(e){r=m[1]}
  r=(r||"").trim();
  if(!r||/^(all|new|sale|search|gift-card|gift-cards)$/i.test(r))return null;
  return r.slice(0,200);
 }

 function setCount(n){
  var el=document.getElementById("vya-wl-count");
  if(el){el.textContent=String(n);el.className=n>0?"on":"";}
  var fab=document.getElementById("vya-wl-fab");
  if(fab){
   fab.className=n>0?"on":"";
   var fn=document.getElementById("vya-wl-fabn");
   if(fn)fn.textContent=String(n);
  }
 }

 function paint(){
  var hearts=document.querySelectorAll(".vya-heart");
  for(var i=0;i<hearts.length;i++){
   var r=hearts[i].getAttribute("data-vya-ref");
   var on=!!state[r];
   hearts[i].setAttribute("aria-pressed",on?"true":"false");
   hearts[i].setAttribute("aria-label",(on?"Saved — remove ":"Save ")+"this piece");
  }
 }

 /* A heart over every link to a piece. The link's own box is made the positioning context, so the
    heart sits on the photograph rather than anywhere near it — and only over links that HAVE a
    photograph, because a heart floating over a text link is not a control anyone recognises. */
 function decorate(){
  var links=document.querySelectorAll('a[href*="/products/"]');
  for(var i=0;i<links.length;i++){
   var a=links[i];
   if(a.getAttribute("data-vya-hearted"))continue;
   var ref=refOf(a.getAttribute("href")||"");
   if(!ref)continue;
   if(!a.querySelector("img,picture,svg image"))continue;
   a.setAttribute("data-vya-hearted","1");
   a.classList.add("vya-hw");
   var b=document.createElement("button");
   b.className="vya-heart";
   b.type="button";
   b.setAttribute("data-vya-ref",ref);
   b.setAttribute("aria-pressed","false");
   b.setAttribute("aria-label","Save this piece");
   b.innerHTML=HEART;
   a.appendChild(b);
   if(state[ref]===undefined)state[ref]=false;
  }
  paint();
 }

 /* What this shopper already has, in ONE request rather than one per card. */
 function sync(){
  fetch(API+"/api/storefront/favorite/list?slug="+encodeURIComponent(SLUG),{credentials:"include"})
   .then(function(r){return r.json()})
   .then(function(d){
    var list=(d&&d.favorites)||[];
    signedIn=!!(d&&d.signedIn);
    state={};
    for(var i=0;i<list.length;i++)state[list[i].ref]=true;
    setCount(list.length);
    paint();
    render(list);
   }).catch(function(){});
 }

 function render(list){
  var box=document.getElementById("vya-wl-body");
  if(!box)return;
  if(!signedIn){
   /* Not "nothing saved yet" — that is a dead end for somebody who has a list and has simply not
      said who they are. */
   box.innerHTML='<p id="vya-wl-hint" style="font-size:14px;line-height:1.5"></p>'
    +'<button class="vya-primary" data-vya-wishlist-signin="1" style="width:100%;padding:13px;border:none;border-radius:6px;background:#111;color:#fff;font:600 12px/1 inherit;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;margin-top:14px">Sign in to save</button>'
    +'<p class="vya-note" style="margin-top:14px">No password — we email you a link.</p>';
   /* Her shop's name is seller-entered: written as text, never as markup. */
   document.getElementById("vya-wl-hint").textContent=
    "Sign in to "+SHOP+" to save pieces and find them again on any device.";
   return;
  }
  if(!list.length){
   box.innerHTML='<p class="vya-note">Nothing saved yet. Tap the heart on a piece to keep it here.</p>';
   return;
  }
  box.innerHTML='<p class="vya-note" id="vya-wl-line"></p><div id="vya-wl-list"></div>';
  document.getElementById("vya-wl-line").textContent=
   list.length===1?"1 piece saved":list.length+" pieces saved";
  var wrap=document.getElementById("vya-wl-list");
  list.forEach(function(it){
   var gone=it.status==="sold"||it.status==="removed";
   var row=document.createElement("div");
   row.className="vya-row"+(gone?" vya-gone":"");
   var a=document.createElement("a");
   a.href="/products/"+encodeURIComponent(it.ref);
   var img=document.createElement("img");
   img.loading="lazy";img.alt="";
   if(it.image)img.src=it.image;
   var t=document.createElement("b");
   var s=document.createElement("small");
   /* Seller-entered text, written as text and never as markup. */
   t.textContent=it.title;
   s.textContent=gone?(it.status==="sold"?"Sold":"No longer available"):money(it.priceCents,it.currency);
   a.appendChild(img);
   var col=document.createElement("span");col.style.cssText="display:block;min-width:0";
   col.appendChild(t);col.appendChild(s);
   a.appendChild(col);
   a.style.cssText="display:flex;gap:12px;align-items:center";
   var x=document.createElement("button");
   x.className="vya-x";x.type="button";x.setAttribute("data-vya-unsave",it.ref);
   x.setAttribute("aria-label","Remove from saved");x.innerHTML="&times;";
   row.appendChild(a);row.appendChild(x);
   wrap.appendChild(row);
  });
 }

 /* Sign in, at the moment they reached for something. The piece is put aside first so that signing
    in finishes what they started.

    localStorage, NOT sessionStorage. The sign-in is a link in an email, and an email client opens it
    in a NEW TAB — where sessionStorage is empty, so the piece they asked for would be quietly
    dropped and they would land on the shop wondering where it went. localStorage is per-origin and
    survives the hop. It is stamped, and only honoured for an hour, so a link clicked days later does
    not silently save something they have forgotten asking for. */
 function askToSignIn(ref){
  if(ref){try{localStorage.setItem("vya-wl-pending",JSON.stringify({ref:ref,at:Date.now()}))}catch(e){}}
  if(window.VYAAccount&&VYAAccount.open){VYAWish.close();VYAAccount.open();return;}
  /* A storefront with no account panel (an origin where the theme's scripts do not run) still has
     to say what is wrong rather than swallow the tap. */
  VYAWish.open();
 }

 function toggle(ref){
  if(!signedIn){askToSignIn(ref);return;}
  var next=!state[ref];
  state[ref]=next;          /* optimistic: a heart that waits on the network feels broken */
  paint();
  setCount(Object.keys(state).filter(function(k){return state[k]}).length);
  fetch(API+"/api/storefront/favorite",{
   method:"POST",credentials:"include",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({slug:SLUG,item:ref})
  }).then(function(r){
     if(r.status===401){signedIn=false;return null;}   /* the session expired while they browsed */
     return r.ok?r.json():null;
   })
    .then(function(d){
     if(d&&typeof d.favorited==="boolean")state[ref]=d.favorited;
     else state[ref]=!next;  /* the piece is gone, the save did not land, or they are signed out */
     paint();
     if(!signedIn){askToSignIn(ref);return;}
     if(document.getElementById("vya-wl").classList.contains("open"))sync();
    })
    .catch(function(){state[ref]=!next;paint();});
 }

 window.VYAWish={
  open:function(){
   document.getElementById("vya-wl").classList.add("open");
   document.getElementById("vya-wl").setAttribute("aria-hidden","false");
   document.getElementById("vya-wl-overlay").classList.add("open");
   sync();
  },
  close:function(){
   document.getElementById("vya-wl").classList.remove("open");
   document.getElementById("vya-wl").setAttribute("aria-hidden","true");
   document.getElementById("vya-wl-overlay").classList.remove("open");
  }
 };

 /* On window, in the capture phase: a heart sits INSIDE the seller's product link, and her theme
    binds its own handlers on that link. Without this the click navigates to the product page
    instead of saving it. Same reason the cart and the account panel do it. */
 window.addEventListener("click",function(e){
  var h=e.target.closest&&e.target.closest(".vya-heart");
  if(h){e.preventDefault();e.stopImmediatePropagation();toggle(h.getAttribute("data-vya-ref"));return;}
  var o=e.target.closest&&e.target.closest("[data-vya-wishlist-open]");
  if(o){e.preventDefault();e.stopImmediatePropagation();VYAWish.open();return;}
  var x=e.target.closest&&e.target.closest("[data-vya-unsave]");
  if(x){e.preventDefault();toggle(x.getAttribute("data-vya-unsave"));return;}
  var si=e.target.closest&&e.target.closest("[data-vya-wishlist-signin]");
  if(si){e.preventDefault();e.stopImmediatePropagation();askToSignIn(null);return;}
 },true);

 /* HER CONTROL FIRST. Most themes already have a favourites or wishlist link in the header — the
    same ones favourites-icon.ts puts a heart on. Binding those means saved pieces live exactly
    where her shoppers already look, in her own header, in her own type.
    Never an account link: telling those two apart is the whole point of favourites-icon.ts. */
 function bindHers(){
  var found=false;
  var all=document.querySelectorAll("a[href],button");
  for(var i=0;i<all.length;i++){
   var el=all[i];
   if(el.getAttribute("data-vya-wishlist-open")){found=true;continue;}
   var href=el.getAttribute("href")||"";
   if(/\\/account|customer_login|customer_authentication/i.test(href))continue;
   var label=(el.getAttribute("aria-label")||"")+" "+(el.getAttribute("title")||"")+" "+(el.className||"");
   if(/(^|\\/)(favou?rites?|wishlists?)(\\/|\\?|$)/i.test(href)||/favou?rite|wishlist/i.test(label)){
    el.setAttribute("data-vya-wishlist-open","1");
    found=true;
   }
  }
  return found;
 }

 /* AND OURS WHERE SHE HAS NONE. A shop whose shoppers can save pieces but cannot find them again
    has not got the feature. Deliberately a small corner button rather than something inserted into
    her header, which is hers — and it only appears once something is actually saved, so a shop with
    an empty list is not carrying a control for a list that does not exist. */
 function mountFab(){
  if(document.getElementById("vya-wl-fab"))return;
  var b=document.createElement("button");
  b.id="vya-wl-fab";b.type="button";
  b.setAttribute("data-vya-wishlist-open","1");
  b.setAttribute("aria-label","Saved pieces");
  b.innerHTML=HEART+'<b id="vya-wl-fabn">0</b>';
  document.body.appendChild(b);
 }

 /* The piece they were reaching for when we asked them to sign in. Saved now, so signing in
    finishes what they started instead of landing them on a shop with an empty list. */
 function finishPending(){
  var raw=null;
  try{raw=localStorage.getItem("vya-wl-pending");localStorage.removeItem("vya-wl-pending")}catch(e){}
  if(!raw||!signedIn)return;
  var p=null;try{p=JSON.parse(raw)}catch(e){}
  if(!p||!p.ref)return;
  if(!p.at||Date.now()-p.at>3600000)return;   /* an hour; a link clicked days later is not this */
  if(!state[p.ref])toggle(p.ref);
 }

 function start(){
  var hers=bindHers();
  if(!hers)mountFab();
  decorate();
  fetch(API+"/api/storefront/favorite/list?slug="+encodeURIComponent(SLUG),{credentials:"include"})
   .then(function(r){return r.json()})
   .then(function(d){
    var list=(d&&d.favorites)||[];
    signedIn=!!(d&&d.signedIn);
    state={};
    for(var i=0;i<list.length;i++)state[list[i].ref]=true;
    setCount(list.length);
    paint();
    render(list);
    finishPending();
   }).catch(function(){});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
 else start();
 /* A theme that paginates, filters or lazy-loads replaces its cards without reloading the page.
    Re-decorating on mutation is what keeps a heart on cards that arrive later. */
 if(window.MutationObserver){
  var t=null;
  new MutationObserver(function(){clearTimeout(t);t=setTimeout(function(){bindHers();decorate();},120)})
   .observe(document.documentElement,{childList:true,subtree:true});
 }
})();</script>`;

 return html.replace(/<\/body>/i, `${markup}</body>`);
}
