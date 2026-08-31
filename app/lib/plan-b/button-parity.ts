/**
 * Make the buttons in a product's buy group the same size as each other.
 *
 * blummier's "Enquire" renders at 25.6px beside an "Add to cart" at 13px — same classes, same
 * parent, and on her own site the two match. Something in her stylesheet reaches the `<button>`
 * there and not on our copy; rather than hardcode a size per store, the group is made to agree with
 * itself in the browser, where the real computed sizes are known.
 *
 * Deliberately conservative. It only acts when the sizes actually disagree by a wide margin, and it
 * takes the SMALLEST size in the group — growing every button to match the odd one out would make
 * the page worse. A theme that already agrees with itself is never touched.
 */
const SCRIPT = `<script data-vya-button-parity="1">(function(){
 /* Only a wide disagreement. Themes do use a slightly larger primary button on purpose, and
    flattening a deliberate 1.1x difference would be the same mistake in reverse. */
 var RATIO=1.25;
 var GROUPS='.product-form__buttons,[class*="product-form__buttons"],form[action*="/cart/add"] .product-form__buttons';
 function fix(){
  document.querySelectorAll(GROUPS).forEach(function(g){
   var btns=[].slice.call(g.querySelectorAll("button,a,input[type=submit]")).filter(function(e){
    var r=e.getBoundingClientRect();return r.width>40&&r.height>16;
   });
   if(btns.length<2)return;
   var sizes=btns.map(function(e){return parseFloat(getComputedStyle(e).fontSize)||0}).filter(Boolean);
   if(sizes.length<2)return;
   var lo=Math.min.apply(null,sizes),hi=Math.max.apply(null,sizes);
   if(lo&&hi/lo>=RATIO)btns.forEach(function(e){e.style.fontSize=lo+"px"});
   /* Height too, measured AFTER the type is settled: matching the font alone still left one button
      ten pixels taller than the one beside it, because the padding differs as well. Set as a box
      that centres its own label, so nothing is clipped. */
   var hs=btns.map(function(e){return e.getBoundingClientRect().height}).filter(Boolean);
   var hlo=Math.min.apply(null,hs),hhi=Math.max.apply(null,hs);
   if(!hlo||hhi/hlo<1.12)return;
   btns.forEach(function(e){
    e.style.height=hlo+"px";
    e.style.minHeight=hlo+"px";
    e.style.display="inline-flex";
    e.style.alignItems="center";
    e.style.justifyContent="center";
   });
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fix);else fix();
 addEventListener("load",fix);
 setTimeout(fix,1200);
})();</script>`;

/** @param html a whole page; returned untouched when it has no buy group to correct. */
export function normaliseBuyButtons(html: string): string {
 if (!html || html.includes("data-vya-button-parity")) return html;
 if (!/product-form__buttons/.test(html)) return html;
 return html.includes("</body>") ? html.replace("</body>", SCRIPT + "</body>") : html + SCRIPT;
}
