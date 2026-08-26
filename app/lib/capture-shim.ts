// Capture shim: recovers the INTERACTIVITY that stripping the source's JavaScript takes away
// (site-capture.ts strips all <script> tags — see the comment there on why: re-hosting a third
// party's JS on our origin is an XSS risk we're not taking). This is the "behavioral reconstruction,
// not code execution" half of that trade-off — a small, VYA-authored, defensive script + CSS
// fallback, built from the REAL markup of themes we've profiled across the seller list.
//
// Every rule here is defensive (guarded by existence checks) so it safely no-ops on pages that
// don't have the element it targets — this is injected on EVERY captured page, unconditionally,
// exactly like CART_UI in site-capture.ts.
//
// Carousels in the wild come in three flavours, and each needs its own treatment:
//   1. Dawn's custom elements  — <slideshow-component>/<slideshow-slides>, plus ".slider" rows.
//      Its ANNOUNCEMENT BAR is also a <slideshow-component>, but must show ONE message at a time
//      and rotate, whereas a category/product ".slider" row shows several side by side.
//   2. Theme-authored sliders  — hand-rolled hero carousels. Found by SHAPE, not class name: a
//      flex track that animates transform, holding full-width slides. The theme's own CSS already
//      animates it; only the JS that set translateX is missing, so that's all we supply.
//   3. Third-party libraries   — swiper/slick/flickity/splide/owl markup that never initialises
//      because we don't load the library. We lay these out with scroll-snap and wire their arrows.
//
// Squarespace (section 7) is a different problem from all three. On Shopify the theme's CSS has
// already laid the page out and only the behaviour is missing; on Squarespace the CSS deliberately
// ships content INVISIBLE (opacity:0 / display:none) and the gallery reel entirely UNSIZED, because
// site-bundle.js is expected to reveal and measure it. So a captured Squarespace store doesn't lose
// its interactivity — it loses its content. Those rules have to reveal, not just wire.

export const CAPTURE_SHIM = `
<style data-vya-shim="1">
/* ── CSS is deliberately MINIMAL. The theme's own stylesheets are inlined into every captured
      page, so the theme still lays itself out: Dawn's ".slider--everywhere/--tablet" already set
      overflow-x:auto + scroll-snap, and ".grid--4-col-desktop" already sizes items to 25%. What's
      missing is only the JS. An earlier version of this shim restyled those rows anyway and broke
      them — flattening the 4-up product grid to 3-up and making the one-at-a-time announcement bar
      show all three messages at once. Rule of thumb: only add what the theme genuinely CANNOT do
      without its JavaScript. ── */

/* Third-party carousel libraries (swiper/slick/flickity/splide/owl) are the real gap: they build
   their layout from inline styles at runtime, so their markup has NO layout at all without the
   library. Give them the strip + spacing (their "spaceBetween") the library would have applied. */
.slick-track,.swiper-wrapper,.flickity-slider,.splide__list,.owl-stage{display:flex;gap:20px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;transform:none!important;scrollbar-width:none}
.slick-track::-webkit-scrollbar,.swiper-wrapper::-webkit-scrollbar,.flickity-slider::-webkit-scrollbar,.splide__list::-webkit-scrollbar,.owl-stage::-webkit-scrollbar{display:none}
.slick-slide,.swiper-slide,.splide__slide,.owl-item{flex:0 0 calc(33.333% - 14px);scroll-snap-align:start;opacity:1;height:auto}
@media (max-width:749px){.slick-slide,.swiper-slide,.splide__slide,.owl-item{flex-basis:80%}}
/* Their arrows are positioned by the theme's CSS; just make sure they're clickable. */
.swiper-button-prev,.swiper-button-next,.slick-prev,.slick-next,.splide__arrow{cursor:pointer;pointer-events:auto;z-index:5}

/* ── Dawn desktop dropdown nav: inert without JS (unlike header-drawer, a native <details>) ──
      Explicit white ground: the theme's own --color-background is an "R,G,B" triplet meant for
      rgb(), so using it bare here would be invalid and leave the panel transparent. */
mega-menu{position:absolute;top:100%;left:0;z-index:60;background:#fff;color:#111;box-shadow:0 12px 30px rgba(0,0,0,.14);display:none;min-width:240px;padding:20px 24px;text-align:left}
mega-menu a{color:inherit}
li:hover>mega-menu,li:focus-within>mega-menu,mega-menu.vya-open{display:block}

/* ── Squarespace. Everything above is Shopify/Dawn; Squarespace is a different platform with a
      different failure mode. Its markup ships HIDDEN AND UNSIZED and leans on site-bundle.js to
      finish the render: content sits at opacity:0 (or display:none) until that script adds
      .loaded/.is-loaded/.animation-loaded/[data-visible], and the gallery reel's slides get their
      width and position from JS alone. Strip the script — as Plan A always does — and a captured
      Squarespace store is a working header above a blank white page. So unlike the Dawn rules
      above, which only WIRE markup the theme already laid out, these must also REVEAL it. ── */
.product-list .product-list-item,.blog-basic-grid--container,.blog-single-column--container,
.blog-side-by-side .blog-item,.blog-alternating-side-by-side .blog-item,.blog-masonry .entry,
.lazy-load,.collection-content-wrapper .grid-item,.portfolio-grid-basic .grid-item,
[data-animation-role]{opacity:1!important;transform:none!important}
.sqs-gallery-block-grid img,.gallery-lightbox-item-img,.gallery-slideshow-thumbnails-thumb img,
.product-gallery-slides-item .product-gallery-slides-item-image,.product-gallery-thumbnails-item,
.sqs-block-summary-v2 .summary-thumbnail-container img{opacity:1!important}

/* The gallery reel is a horizontal filmstrip whose slides the stylesheet gives NO width and NO
   height at all — Squarespace's JS measures each image and sets both, plus the translateX that
   scrolls the strip. Without it every slide is a 0x0 absolutely-positioned box whose wrapper also
   sits at z-index:-1 (behind the page), so an 80vh hero renders as pure white with two working
   arrows under it. Rebuild it as a scroll-snap strip — the same treatment section 3 gives library
   carousels — and let the JS below turn each image's real dimensions into a slide width.
   Deliberately NO position override on the list: it is absolute when the arrows overlay the reel
   and relative when they sit below it, and a flex row lays out correctly either way. Height comes
   from flex:1 1 auto inside .gallery-reel-wrapper (a full-height flex column) so the slides'
   height:100% resolves in both arrangements. */
.gallery-reel-list{display:flex!important;flex:1 1 auto;min-height:0;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.gallery-reel-list::-webkit-scrollbar{display:none}
.gallery-reel-item{position:relative!important;flex:0 0 auto;height:100%;transform:none!important;scroll-snap-align:start}
.gallery-reel-item-wrapper{position:relative!important;width:100%;height:100%;z-index:auto!important}
.gallery-reel-item-src{position:relative!important;display:block!important;opacity:1!important;width:100%;height:100%}
.gallery-reel-control-btn{pointer-events:auto;cursor:pointer}
/* Squarespace ships EVERY candidate image in a product card inline-hidden and lets its JS pick the
   one to show; the losers also carry .grid-item-additional-image/.grid-image-not-selected, whose
   opacity:0 is !important. So the reveal has to out-rank both the inline style and that important
   rule — hence a dedicated class rather than setting style.opacity from JS. */
img.vya-sqs-img{display:block!important;opacity:1!important}
</style>
<script data-vya-shim="1">
(function(){
if(window.__vyaShim)return;window.__vyaShim=1;
function ready(fn){if(document.readyState!=="loading")fn();else document.addEventListener("DOMContentLoaded",fn)}
function w(el){return el.getBoundingClientRect().width||el.offsetWidth||1}
/* Auto-advance that pauses on hover and stops for good once a human takes over. */
function autoplay(el,step,ms){
 if(!el||!(ms>0))return;
 var t=setInterval(step,ms),stop=function(){clearInterval(t)};
 el.addEventListener("pointerdown",stop,{once:true});
 el.addEventListener("mouseenter",function(){clearInterval(t)});
 el.addEventListener("mouseleave",function(){clearInterval(t);t=setInterval(step,ms)});
}
/* Scroll a snap-strip by one "page" (its own width), wrapping at the end. */
function advance(track,dir){
 var atEnd=track.scrollLeft+w(track)>=track.scrollWidth-4;
 if(dir>0&&atEnd)track.scrollTo({left:0,behavior:"smooth"});
 else if(dir<0&&track.scrollLeft<=4)track.scrollTo({left:track.scrollWidth,behavior:"smooth"});
 else track.scrollBy({left:dir*w(track),behavior:"smooth"});
}
/* Bind a pair of prev/next buttons to a track, once. */
function wire(prev,next,onPrev,onNext){
 if(prev&&!prev.__vya){prev.__vya=1;prev.addEventListener("click",function(e){e.preventDefault();onPrev()})}
 if(next&&!next.__vya){next.__vya=1;next.addEventListener("click",function(e){e.preventDefault();onNext()})}
}

ready(function(){
 /* Progressive-enhancement flag some themes gate content on (e.g. Dwell). */
 var root=document.documentElement;
 if(root.classList.contains("no-js")){root.classList.remove("no-js");root.classList.add("js")}

 /* ── 1. Announcement bar: rotate one message at a time (honours data-speed, in seconds). ── */
 document.querySelectorAll(".announcement-bar").forEach(function(bar){
  var track=bar.querySelector(".slider, .grid.slider");
  if(!track||track.children.length<2)return;
  var speed=parseFloat(track.getAttribute("data-speed")||"5")||5;
  wire(bar.querySelector(".slider-button--prev"),bar.querySelector(".slider-button--next"),
   function(){advance(track,-1)},function(){advance(track,1)});
  if(track.getAttribute("data-autoplay")!=="false")autoplay(bar,function(){advance(track,1)},speed*1000);
 });

 /* ── 2. Dawn hero slideshows (<slideshow-component>, excluding the announcement bar). ── */
 document.querySelectorAll("slideshow-component:not(.announcement-bar)").forEach(function(comp){
  var track=comp.querySelector("slideshow-slides")||comp.querySelector(".slideshow__slides");
  if(!track||track.children.length<2)return;
  wire(comp.querySelector('[on\\\\:click="/previous"], .slideshow-control--previous, [aria-label="Previous slide" i]'),
       comp.querySelector('[on\\\\:click="/next"], .slideshow-control--next, [aria-label="Next slide" i]'),
       function(){advance(track,-1)},function(){advance(track,1)});
  autoplay(comp,function(){advance(track,1)},6000);
 });

 /* ── 3. Theme-authored sliders, found STRUCTURALLY. ──
        Matching one store's class names only ever fixes that store, so this looks for the shape
        every hand-rolled slider shares: a flex track that animates transform, holding two or more
        full-width slides. The theme's CSS already animates; only the JS is missing. */
 document.querySelectorAll("div, ul, section").forEach(function(track){
  if(track.__vyaTrack)return;
  var cs=getComputedStyle(track);
  if(cs.display!=="flex")return;
  if(!/transform|all/.test(cs.transitionProperty||""))return;
  var kids=[].slice.call(track.children).filter(function(k){return k.nodeType===1});
  if(kids.length<2)return;
  var box=track.getBoundingClientRect().width;
  if(!box)return;
  /* every slide must fill the track — that's what makes it a one-at-a-time slider */
  for(var i=0;i<kids.length;i++){ if(kids[i].getBoundingClientRect().width < box*0.9) return; }
  track.__vyaTrack=1;
  var stage=track.parentElement||track, idx=0;
  var go=function(n){idx=(n+kids.length)%kids.length;track.style.transform="translateX(-"+(idx*100)+"%)"};
  wire(stage.querySelector("[class*='prev'], [aria-label*='Previous' i]"),
       stage.querySelector("[class*='next'], [aria-label*='Next' i]"),
       function(){go(idx-1)},function(){go(idx+1)});
  autoplay(stage,function(){go(idx+1)},5000);
 });

 /* ── 3a. The OTHER hand-rolled slider shape: slides hidden with display:none, one shown via an
        "active" class (Bootstrap's carousel and many bespoke ones work this way). The flex-track
        detector above can't see these — nothing is laid out in a row — so without this only the
        first slide is ever visible. Detected by shape again: a container whose element children are
        mostly hidden with exactly one showing. */
 document.querySelectorAll("div, ul, section").forEach(function(box){
  if(box.__vyaFade)return;
  var kids=[].slice.call(box.children).filter(function(k){return k.nodeType===1});
  if(kids.length<2||kids.length>24)return;
  var hidden=[],shown=[];
  for(var i=0;i<kids.length;i++){ (getComputedStyle(kids[i]).display==="none"?hidden:shown).push(kids[i]); }
  /* exactly one visible, the rest hidden, and they must look alike (a real slide set, not a
     tab panel with one open) */
  if(shown.length!==1||hidden.length<1)return;
  var tag=kids[0].tagName, sameTag=kids.every(function(k){return k.tagName===tag});
  if(!sameTag)return;
  if(!box.querySelector("img"))return; /* slides carry imagery; menus and dialogs don't */
  box.__vyaFade=1;
  var idx=kids.indexOf(shown[0]);
  var show=function(n){
   idx=(n+kids.length)%kids.length;
   kids.forEach(function(k,i){
    if(i===idx){k.style.display="";k.classList.add("active")}
    else{k.style.display="none";k.classList.remove("active")}
   });
  };
  var stage=box.parentElement||box;
  wire(stage.querySelector("[class*='prev'], [data-bs-slide='prev'], [aria-label*='Previous' i]"),
       stage.querySelector("[class*='next'], [data-bs-slide='next'], [aria-label*='Next' i]"),
       function(){show(idx-1)},function(){show(idx+1)});
  autoplay(stage,function(){show(idx+1)},5000);
 });

 /* ── 3b. Sticky headers. The theme ships the class; its JS added it on scroll. (6 of 20 stores.) */
 var header=document.querySelector("[class*='sticky-header'], header[class*='sticky'], .header-wrapper");
 if(header&&getComputedStyle(header).position!=="sticky"&&getComputedStyle(header).position!=="fixed"){
  header.style.position="sticky";header.style.top="0";header.style.zIndex="50";
 }

 /* ── 3c. Search. Captured search boxes are inert: the theme's predictive-search widget owned the
        input (11 of 20 stores). Submitting to the store's own /search URL keeps the box working —
        and the serving route already logs that query for the seller's analytics. */
 document.querySelectorAll("input[type='search'], input[name='q'], input[name='query']").forEach(function(input){
  if(input.__vyaSearch)return;input.__vyaSearch=1;
  var form=input.closest("form");
  if(form){ if(!form.getAttribute("action")) form.setAttribute("action","search"); form.setAttribute("method","get"); if(!input.getAttribute("name")) input.setAttribute("name","q"); return; }
  input.addEventListener("keydown",function(e){
   if(e.key!=="Enter")return;
   e.preventDefault();
   var q=(input.value||"").trim();
   /* NOTE the doubled backslash: this whole shim lives in a template literal, and \/ is not an
      escape sequence there — it collapses to a bare /, which turned this regex into a // line
      comment and threw "Unexpected token }" that killed the ENTIRE shim on every captured page. */
   if(q)location.href=location.pathname.replace(/\\/$/,"")+"/search?q="+encodeURIComponent(q);
  });
 });

 /* ── 3d. Quick-add buttons. They POSTed to the old platform's cart, so they're dead markup now.
        Send them to the product card's own link instead of leaving a button that does nothing. */
 document.querySelectorAll("[class*='quick-add'] button, [class*='quick-add'] a, [class*='quickview'], [class*='quick-view']").forEach(function(btn){
  if(btn.__vyaQuick)return;btn.__vyaQuick=1;
  var card=btn.closest("li, [class*='card'], [class*='product']");
  var link=card&&card.querySelector("a[href]");
  if(link){ btn.addEventListener("click",function(e){e.preventDefault();location.href=link.getAttribute("href")}); }
  else { btn.style.display="none"; }
 });

 /* ── 3e. Product-image zoom / lightbox (5 of 20 stores). The theme's JS opened an overlay; the
        markup that's left is a dead cursor:zoom-in image. Give it a real lightbox of our own —
        clicking the main product image opens it full-size, Escape or a click closes it. */
 var lb=null;
 document.querySelectorAll("[data-zoom], [class*='js-zoom'], [class*='lightbox'], [class*='product__media'] img, [class*='product-single__photo'] img").forEach(function(node){
  var img=node.tagName==="IMG"?node:node.querySelector("img");
  if(!img||img.__vyaZoom)return;img.__vyaZoom=1;
  img.style.cursor="zoom-in";
  img.addEventListener("click",function(e){
   var full=img.getAttribute("data-zoom")||img.currentSrc||img.src;
   if(!full)return;
   e.preventDefault();
   if(!lb){
    lb=document.createElement("div");
    lb.setAttribute("data-vya-lightbox","1");
    lb.style.cssText="position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;cursor:zoom-out";
    lb.innerHTML='<img alt="" style="max-width:94vw;max-height:94vh;object-fit:contain">';
    lb.addEventListener("click",function(){lb.style.display="none"});
    document.body.appendChild(lb);
    document.addEventListener("keydown",function(ev){if(ev.key==="Escape"&&lb)lb.style.display="none"});
   }
   lb.querySelector("img").setAttribute("src",full);
   lb.style.display="flex";
  });
 });

 /* ── 3f. Collection filters + sort (3 of 20 stores). These were <form>s the theme submitted with
        JS; the plain markup left behind does nothing. Wiring them to a normal GET submit makes
        them work again, and the storefront route reads the resulting query. */
 document.querySelectorAll("form[id*='Filter'], form[class*='facets'], [class*='facets'] form, form[class*='filter']").forEach(function(form){
  if(form.__vyaFilter)return;form.__vyaFilter=1;
  form.setAttribute("method","get");
  form.querySelectorAll("input[type='checkbox'], input[type='radio'], select").forEach(function(ctrl){
   ctrl.addEventListener("change",function(){ if(typeof form.requestSubmit==="function")form.requestSubmit(); else form.submit(); });
  });
 });
 document.querySelectorAll("select[name='sort_by'], select[class*='sort']").forEach(function(sel){
  if(sel.__vyaSort)return;sel.__vyaSort=1;
  sel.addEventListener("change",function(){
   var f=sel.closest("form");
   if(f){f.setAttribute("method","get");(typeof f.requestSubmit==="function")?f.requestSubmit():f.submit();return}
   var u=new URL(location.href);u.searchParams.set("sort_by",sel.value);location.href=u.toString();
  });
 });

 /* ── 4. Third-party library carousels: wire whatever arrows the theme rendered. ── */
 document.querySelectorAll(".swiper, .swiper-container, [class*='swiper'], .slick-slider, .splide, .flickity-enabled").forEach(function(box){
  var track=box.querySelector(".swiper-wrapper, .slick-track, .splide__list, .flickity-slider");
  if(!track||track.children.length<2)return;
  var scope=box.closest("section, .shopify-section, div")||box;
  wire(scope.querySelector(".swiper-button-prev, .slick-prev, .splide__arrow--prev, [class*='button-prev']"),
       scope.querySelector(".swiper-button-next, .slick-next, .splide__arrow--next, [class*='button-next']"),
       function(){advance(track,-1)},function(){advance(track,1)});
 });

 /* ── 5. Dawn ".slider" rows: wire their prev/next buttons to the row they belong to. ── */
 document.querySelectorAll("slider-component, .slider-buttons").forEach(function(box){
  if(box.closest(".announcement-bar"))return; /* handled above, one-at-a-time */
  var scope=box.closest("slider-component, section, .shopify-section")||box;
  var track=scope.querySelector("ul.slider, .grid.slider, .slider");
  if(!track||track.children.length<2)return;
  wire(scope.querySelector(".slider-button--prev"),scope.querySelector(".slider-button--next"),
   function(){advance(track,-1)},function(){advance(track,1)});
 });

 /* ── 6. Desktop dropdown nav: click-toggle (CSS handles hover/focus), Escape + outside click close. ── */
 document.querySelectorAll("mega-menu").forEach(function(menu){
  var trigger=menu.previousElementSibling;
  if(!trigger)return;
  trigger.addEventListener("click",function(e){
   if(menu.classList.contains("vya-open")){menu.classList.remove("vya-open");return}
   e.preventDefault();
   document.querySelectorAll("mega-menu.vya-open").forEach(function(m){m.classList.remove("vya-open")});
   menu.classList.add("vya-open");
  });
 });
 document.addEventListener("click",function(e){
  if(!e.target.closest||!e.target.closest("mega-menu, li"))
   document.querySelectorAll("mega-menu.vya-open").forEach(function(m){m.classList.remove("vya-open")});
 });
 document.addEventListener("keydown",function(e){
  if(e.key==="Escape")document.querySelectorAll("mega-menu.vya-open").forEach(function(m){m.classList.remove("vya-open")});
 });

 /* ── 7. Squarespace gallery reel: supply the per-slide width its JS would have computed.
        CSS alone can't do this — the width is the image's aspect ratio scaled to the reel's
        height, and no stylesheet can read data-image-dimensions — so set an aspect-ratio here
        and let the strip rules above resolve it into a width. */
 document.querySelectorAll(".gallery-reel").forEach(function(reel){
  var list=reel.querySelector(".gallery-reel-list");
  if(!list||!list.children.length)return;
  list.querySelectorAll(".gallery-reel-item").forEach(function(item){
   var img=item.querySelector("img");
   if(!img)return;
   /* data-image-dimensions ("3024x4032") is authoritative and available before load; the width/
      height attributes and naturalWidth are fallbacks for slides that lack it. */
   var d=(img.getAttribute("data-image-dimensions")||"").split("x");
   var iw=parseInt(d[0],10)||parseInt(img.getAttribute("width")||"",10)||img.naturalWidth;
   var ih=parseInt(d[1],10)||parseInt(img.getAttribute("height")||"",10)||img.naturalHeight;
   /* A slot of some kind beats leaving a zero-width box that renders as nothing. */
   if(iw>0&&ih>0)item.style.aspectRatio=iw+" / "+ih;
   else item.style.width="60vh";
  });
  wire(reel.querySelector(".gallery-reel-control-btn-previous"),
       reel.querySelector(".gallery-reel-control-btn-next"),
       function(){advance(list,-1)},function(){advance(list,1)});
 });

 /* ── 8. Squarespace's image loader (data-loader="sqs"). Its JS is what finally SHOWS a grid image:
        it clears the inline display:none on the one candidate to display, and swaps sizes="0" — a
        placeholder meaning "slot not measured yet" — for the slot's real width. Left alone a product
        grid is a row of empty boxes, and any image that does appear downloads the 100w thumbnail
        because a 0px slot selects the smallest srcset candidate. */
 /* Batched deliberately: every read below is done before any write. Interleaving them made the
        browser re-layout once per image — 1400+ forced reflows on a big catalogue page, which took
        the shop page ~30s to settle. Read all, then write all, and it is one layout. */
 var cards=[].slice.call(document.querySelectorAll(".product-list-item-image, .grid-item .grid-image, .summary-thumbnail"));
 var reveal=[];
 cards.forEach(function(box){
  var cands=[].slice.call(box.querySelectorAll("img"));
  if(!cands.length)return;
  /* If the theme already leaves one showing, it doesn't need us. */
  for(var i=0;i<cands.length;i++){ if(getComputedStyle(cands[i]).display!=="none")return; }
  reveal.push(cands[0]);
 });
 reveal.forEach(function(img){ img.classList.add("vya-sqs-img"); });
 var slots=[].slice.call(document.querySelectorAll("img[sizes='0']"));
 var widths=slots.map(function(img){
  return Math.round(img.getBoundingClientRect().width)||Math.round((img.parentElement||img).getBoundingClientRect().width);
 });
 slots.forEach(function(img,i){
  /* No measurable slot: drop the attribute so it defaults to 100vw. Over-fetches a little, but
     that beats leaving a 0px slot to pick the 100w thumbnail and render it as a blur. */
  if(widths[i]>0)img.setAttribute("sizes",widths[i]+"px");
  else img.removeAttribute("sizes");
 });
});
})();
</script>`;
