// The imported-site builder's half of the in-page editor.
//
// Injected by prepareEditMode right AFTER the editor's own script (EDITOR_JS in site-capture.ts) and
// kept apart from it on purpose: that script is the most contended code in the repo. It reaches the
// editor only through `window.__vyaEd` — a small bridge at the end of EDITOR_JS — and through the
// page's own messages. Step 2 adds:
//
//  · PRODUCT GRIDS. A grid is an empty marker ([data-vya-grid]); its cards are fetched from
//    /api/store/capture/grid-preview, which renders exactly what a shopper gets from live inventory.
//    The parent's Grid panel sends {vya:"gridset"}; the marker's settings change and the grid refetches.
//  · + BETWEEN SECTIONS. Hover the seam between two sections, press +, pick what goes there.
//  · HIDE, DON'T DELETE. {vya:"hidesec"/"showsec"} marks a captured section; the save sends
//    {sec, hidden} and shoppers stop seeing it. Deleting for good stays the page's own "delsec".
//  · UNDO THAT SURVIVES SAVE. {vya:"undoany"} uses the page's own undo stack while it has anything,
//    and otherwise tells the parent to step back through the saved versions instead.
//  · THE SAVE'S SHAPE. window.__vyaShapeSave rewrites the save payload the editor built: grids become
//    {new:"products", grid} / {sec, grid} (never their cards), hide/show become {sec, hidden}, and the
//    numbering rule rides along (app/lib/site-builder/numbering.ts).
//
// ES5, no template substitutions, no closing script tag: this string is written straight into a <script>.
export const SITE_BUILDER_EDITOR_JS = String.raw`(function(){
var E=window.__vyaEd,EDIT=window.__VYA_EDIT;if(!E||!EDIT)return;
var PATH=EDIT.path||"/";
function post(m){if(window.parent!==window)window.parent.postMessage(m,"*")}
/* verbatim copy of vyaStore in EDITOR_JS: an admin's ?store= for the page's own store */
function vyaStore(u){var m=/^\/site\/([^/?#]+)/.exec(location.pathname||"");if(!m||!m[1])return u;return u+(u.indexOf("?")>=0?"&":"?")+"store="+encodeURIComponent(m[1])}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function newId(){var s="";while(s.length<8)s+=Math.floor(Math.random()*36).toString(36);return "g_"+s.slice(0,8)}
function isId(v){return typeof v==="string"&&/^g_[a-z0-9]{4,16}$/.test(v)}
var css=document.createElement("style");css.setAttribute("data-vya-edit-only","1");
css.textContent='#vya-plus{position:fixed;z-index:2147483646;display:none;place-items:center;width:26px;height:26px;padding:0;border-radius:50%;border:2px solid #fff;background:#5D0F17;color:#fff;font:600 18px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25)}'
+'#vya-pm{position:fixed;z-index:2147483647;display:none;flex-direction:column;min-width:170px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:6px;box-shadow:0 16px 38px -12px rgba(43,36,29,.42)}'
+'#vya-pm button{background:transparent;color:#44403c;border:none;text-align:left;padding:8px 12px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer;border-radius:7px}#vya-pm button:hover{background:#f5f4f2;color:#5D0F17}'
+'[data-vya-grid-loading]{min-height:180px;background:repeating-linear-gradient(90deg,rgba(0,0,0,.03) 0 25%,rgba(0,0,0,.06) 25% 50%)}'
+'[data-vya-hidden]{position:relative}[data-vya-hidden]>*{opacity:.35}[data-vya-hidden]::before{content:"Hidden from shoppers";position:absolute;top:12px;left:12px;z-index:9;background:#5D0F17;color:#fff;font:600 11px/1 -apple-system,system-ui,sans-serif;padding:6px 9px;border-radius:6px}'
+'#vya-hidbar{position:fixed;z-index:2147483646;left:0;right:0;top:0;display:flex;align-items:center;justify-content:center;gap:10px;background:#5D0F17;color:#fff;font:600 12px/1 -apple-system,system-ui,sans-serif;padding:9px 12px}'
+'#vya-hidbar button{background:#fff;color:#5D0F17;border:0;border-radius:6px;padding:5px 10px;font:600 12px -apple-system,system-ui,sans-serif;cursor:pointer}';
document.head.appendChild(css);

/* Sections, as the save counts them — top-level only. */
function secList(){return [].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(n){return !n.classList.contains("vya-del")&&!(n.parentNode&&n.parentNode.closest&&n.parentNode.closest("[data-vya-sec],[data-vya-block]"))})}
function gridCfg(el){try{return JSON.parse(el.getAttribute("data-vya-grid")||"{}")}catch(e){return{}}}
function infoOf(s,pc){var g=s.hasAttribute("data-vya-grid");return{vya:"secinfo",block:s.hasAttribute("data-vya-block"),hidden:s.hasAttribute("data-vya-hidden"),grid:g?{id:s.getAttribute("data-vya-grid-id"),config:gridCfg(s)}:null,item:pc?pc.getAttribute("data-vya-item"):null,itemTitle:pc?pc.getAttribute("data-vya-item-title"):null}}

/* ── the save ── */
var HID0={};[].slice.call(document.querySelectorAll("[data-vya-sec][data-vya-hidden]")).forEach(function(n){HID0[n.getAttribute("data-vya-sec")]=1});
window.__vyaShapeSave=function(b){try{b.numbering=EDIT.numbering||0;if(!b.sections)return b;
var els=[].slice.call(document.querySelectorAll("[data-vya-sec],[data-vya-block]")).filter(function(el){return !el.classList.contains("vya-del")});
if(els.length!==b.sections.length)return b;
b.sections=b.sections.map(function(entry,i){var el=els[i],si=el.getAttribute("data-vya-sec"),g=el.getAttribute("data-vya-grid");
if(g!==null){if(si!==null)return{sec:parseInt(si,10),grid:gridCfg(el)};return{"new":"products",grid:gridCfg(el),gridId:el.getAttribute("data-vya-grid-id")||""}}
if(si!==null){var h=el.hasAttribute("data-vya-hidden");if(h!==!!HID0[si]){if(typeof entry==="number")return{sec:parseInt(si,10),hidden:h};entry.hidden=h}}
return entry})}catch(e){}return b};

/* ── product grids ── */
function park(root){[].slice.call(root.querySelectorAll("a[href]")).forEach(function(a){if(a.getAttribute("data-vya-href")===null){a.setAttribute("data-vya-href",a.getAttribute("href")||"");a.setAttribute("href","#")}})}
var seq=0;
function fillGrid(el,done){var id=el.getAttribute("data-vya-grid-id")||"";var my=String(++seq);el.setAttribute("data-vya-seq",my);el.setAttribute("data-vya-grid-loading","1");
fetch(vyaStore("/api/store/capture/grid-preview?path="+encodeURIComponent(PATH)+"&id="+encodeURIComponent(id)+"&config="+encodeURIComponent(el.getAttribute("data-vya-grid")||"{}")),{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(d){
if(el.getAttribute("data-vya-seq")!==my)return;el.removeAttribute("data-vya-seq");el.removeAttribute("data-vya-grid-loading");
if(!d||!d.ok){el.innerHTML='<div data-vya-grid-note="1" style="padding:48px 24px;text-align:center;opacity:.6">'+esc((d&&d.error)||"This grid couldn’t load.")+'</div>';return}
if(d.config)el.setAttribute("data-vya-grid",JSON.stringify(d.config));
el.innerHTML=d.html||"";park(el);
if(d.kitCss&&!document.querySelector("style[data-vya-kit-css]")){var s=document.createElement("style");s.setAttribute("data-vya-kit-css","1");s.textContent=d.kitCss;document.head.appendChild(s)}
post({vya:"gridstate",id:id,config:d.config||gridCfg(el),kit:d.kit||null,empty:!!d.empty});if(typeof done==="function")done()
}).catch(function(){if(el.getAttribute("data-vya-seq")===my){el.removeAttribute("data-vya-seq");el.removeAttribute("data-vya-grid-loading")}})}
function refillEmpty(){[].slice.call(document.querySelectorAll("[data-vya-grid]")).forEach(function(g){if(!g.children.length&&!g.hasAttribute("data-vya-grid-loading"))fillGrid(g)})}
function selectGrid(g){[].slice.call(document.querySelectorAll(".vya-sel")).forEach(function(x){x.classList.remove("vya-sel")});g.classList.add("vya-sel");window.__vyaSel=g;var r=g.getBoundingClientRect();post({vya:"section",index:-1,fields:[],style:{},rect:{top:r.top,cx:r.left+r.width/2}});post(infoOf(g,null))}
function anchorNear(){var s=E.sel();if(s&&s.parentNode&&!s.classList.contains("vya-del"))return s;var cds=secList(),vh=window.innerHeight||800,best=null,bd=1/0;cds.forEach(function(n){var r=n.getBoundingClientRect();if(r.bottom<=0||r.top>=vh)return;var dd=Math.abs(r.top+r.height/2-vh/2);if(dd<bd){bd=dd;best=n}});return best||cds[cds.length-1]||null}
function addGrid(after){var g=document.createElement("div");g.setAttribute("data-vya-block","1");g.setAttribute("data-vya-newtype","products");g.setAttribute("data-vya-grid-id",newId());
/* no collection yet: the server fills in the first of hers that her page links to */
g.setAttribute("data-vya-grid",JSON.stringify({count:8,cols:4,mcols:2,ratio:"theme",card:"theme"}));
if(after&&after.parentNode)after.parentNode.insertBefore(g,after.nextSibling);else(document.querySelector("main")||document.body).appendChild(g);
E.mark();selectGrid(g);fillGrid(g,function(){post(infoOf(g,null));g.scrollIntoView({behavior:"smooth",block:"center"})});g.scrollIntoView({behavior:"smooth",block:"center"})}

/* ── + between sections ── */
var plus=document.createElement("button");plus.id="vya-plus";plus.type="button";plus.title="Add a section here";plus.textContent="+";E.ui(plus);
var pm=document.createElement("div");pm.id="vya-pm";pm.innerHTML='<button type="button" data-add="products">Product grid</button><button type="button" data-add="text">Text</button><button type="button" data-add="image">Image</button><button type="button" data-add="button">Button</button><button type="button" data-add="divider">Divider</button><button type="button" data-add="more">More layouts…</button>';E.ui(pm);
var gapAfter=null,pmAfter=null,raf=0,lastEv=null;
function seam(){raf=0;var e=lastEv;if(!e||pm.style.display==="flex")return;var list=secList(),hit=null;
for(var i=0;i<list.length-1;i++){var ra=list[i].getBoundingClientRect(),rb=list[i+1].getBoundingClientRect();if(ra.height<4||rb.height<4)continue;if(Math.abs(ra.bottom-rb.top)>48)continue;var y=(ra.bottom+rb.top)/2;if(Math.abs(e.clientY-y)<=14){hit={after:list[i],y:y,x:ra.left+ra.width/2};break}}
if(hit){gapAfter=hit.after;plus.style.display="grid";plus.style.top=(hit.y-13)+"px";plus.style.left=(Math.max(16,Math.min(hit.x,(window.innerWidth||1280)-16))-13)+"px"}else if(e.target!==plus){plus.style.display="none"}}
document.addEventListener("mousemove",function(e){lastEv=e;if(!raf)raf=requestAnimationFrame(seam)},{passive:true});
window.addEventListener("scroll",function(){plus.style.display="none"},true);
function closePm(){pm.style.display="none"}
plus.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();pmAfter=gapAfter;var r=plus.getBoundingClientRect();pm.style.display="flex";pm.style.top=Math.max(8,Math.min(r.bottom+6,(window.innerHeight||800)-260))+"px";pm.style.left=Math.max(8,r.left-72)+"px"});
pm.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-add]");if(!b)return;e.preventDefault();e.stopPropagation();var t=b.getAttribute("data-add"),after=pmAfter;closePm();plus.style.display="none";if(!after)return;
if(t==="products"){addGrid(after);return}
/* The page's own add path puts a new section after window.__vyaSel. Point it at the section above the seam for this one call, then put her selection back. "More layouts" leaves it there, so the Layout rail's next pick lands in the seam too. */
var prev=window.__vyaSel;window.__vyaSel=after;
if(t==="more"){post({vya:"openlayout"});return}
window.dispatchEvent(new MessageEvent("message",{data:{vya:"addblock",type:t}}));window.__vyaSel=prev});
document.addEventListener("click",function(e){if(!(e.target.closest&&e.target.closest("#vya-pm,#vya-plus")))closePm()},true);
document.addEventListener("keydown",function(e){if(e.key==="Escape"||e.key==="Esc")closePm()});

/* ── what she clicked: tell the panel whether it is a grid, a block or a hidden section ── */
document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest("#vya-tb,#vya-sb,#vya-am,#vya-lb,#vya-eb,#vya-lk,#vya-plus,#vya-pm"))return;var s=e.target.closest&&e.target.closest("[data-vya-sec],[data-vya-block]");if(!s)return;post(infoOf(s,e.target.closest("[data-vya-item]")))});

/* ── messages from the panel ── */
window.addEventListener("message",function(ev){var d=ev.data||{};if(!d.vya)return;
if(d.vya==="addgrid"){addGrid(anchorNear())}
else if(d.vya==="gridset"){if(!isId(d.id))return;var g=document.querySelector('[data-vya-grid-id="'+d.id+'"]');if(!g)return;g.setAttribute("data-vya-grid",JSON.stringify(d.config||{}));E.mark();fillGrid(g)}
else if(d.vya==="gridrefresh"){[].slice.call(document.querySelectorAll("[data-vya-grid]")).forEach(function(g){fillGrid(g)})}
else if(d.vya==="hidesec"||d.vya==="showsec"){var s=E.sel();if(!s||s.getAttribute("data-vya-sec")===null||s.hasAttribute("data-vya-block"))return;if(d.vya==="hidesec")s.setAttribute("data-vya-hidden","1");else s.removeAttribute("data-vya-hidden");E.mark();post(infoOf(s,null))}
else if(d.vya==="undoany"){if(E.canUndo()){E.undo();post({vya:"unsaved"});setTimeout(refillEmpty,0)}else post({vya:"undoempty",path:PATH})}
else if(d.vya==="undo"||d.vya==="redo"){setTimeout(refillEmpty,0)}
else if(d.vya==="dupsec"){var s2=E.sel(),c2=s2&&s2.nextElementSibling;if(c2&&s2.hasAttribute("data-vya-grid")&&c2.getAttribute("data-vya-grid-id")===s2.getAttribute("data-vya-grid-id")){c2.removeAttribute("data-vya-sec");c2.classList.remove("vya-sel");c2.setAttribute("data-vya-grid-id",newId());c2.innerHTML="";fillGrid(c2)}}
});
/* ── a page she has hidden ──
   She can still open and edit it — hiding is about shoppers, not about her. One bar says so, and
   offers the way back; the panel does the write and reloads this frame. */
if(EDIT.hidden){var hb=document.createElement("div");hb.id="vya-hidbar";
hb.appendChild(document.createTextNode("This page is hidden from shoppers"));
var sb2=document.createElement("button");sb2.type="button";sb2.textContent="Show";
sb2.addEventListener("click",function(){post({vya:"showpage",path:PATH})});
hb.appendChild(sb2);E.ui(hb)}
refillEmpty();
})();`;
