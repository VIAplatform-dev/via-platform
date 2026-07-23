// Shared behavior for VYA subpages (nav theme, scroll state, reveals, forms)
(function(){
  var nav=document.getElementById('nav');
  var sections=[].slice.call(document.querySelectorAll('[data-theme]'));
  function updateNav(){
    var y=window.scrollY;
    if(nav) nav.classList.toggle('scrolled', y>20);
    var line=y+36, theme='light';
    for(var i=0;i<sections.length;i++){
      var s=sections[i], top=s.offsetTop, bot=top+s.offsetHeight;
      if(line>=top && line<bot){ theme=s.getAttribute('data-theme'); break; }
    }
    if(nav){ nav.classList.toggle('theme-dark', theme==='dark'); nav.classList.toggle('theme-light', theme!=='dark'); }
  }
  window.addEventListener('scroll',updateNav,{passive:true});
  window.addEventListener('resize',updateNav);
  updateNav();

  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
  },{threshold:0.12,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });

  // Styled forms (ready to wire) — show a success state, no backend
  document.querySelectorAll('form[data-mock]').forEach(function(f){
    f.addEventListener('submit',function(ev){
      ev.preventDefault();
      if(!f.checkValidity()){ f.reportValidity(); return; }
      var ok=f.parentElement.querySelector('.form-ok');
      f.classList.add('hide');
      if(ok) ok.classList.add('show');
    });
  });
})();

// Company thesis stats — scramble/flicker into their final value when in view
(function(){
  var stats=[].slice.call(document.querySelectorAll('.tstat-n'));
  if(!stats.length) return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  function flick(el){
    var val=el.getAttribute('data-val');
    if(reduce){ el.textContent=val; return; }
    var m=val.match(/^(\D*)(\d+)(.*)$/);
    if(!m){ el.textContent=val; return; }
    var pre=m[1], digits=m[2], suf=m[3], len=digits.length;
    var start=performance.now(), dur=1050;
    el.classList.add('flick');
    function frame(now){
      var t=(now-start)/dur;
      if(t>=1){ el.textContent=val; el.classList.remove('flick'); return; }
      var lock=Math.floor(t*len*1.25);
      var out='';
      for(var i=0;i<len;i++){ out += (i<lock ? digits[i] : String(Math.floor(Math.random()*10))); }
      el.textContent=pre+out+suf;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var io=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting){ flick(e.target); io.unobserve(e.target); } });},{threshold:0.6});
  stats.forEach(function(s){ io.observe(s); });
})();

// Rotating mission line — "VYA can help you ___" rolls through phrases
(function(){
  var track=document.querySelector('.rotor-track'); if(!track) return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce) return;
  var total=track.children.length; // real phrases + 1 duplicate of the first
  var i=0, ease='transform .7s cubic-bezier(.76,0,.24,1)';
  function step(){
    i++;
    track.style.transition=ease;
    track.style.transform='translateY(-'+(i*100/total)+'%)';
    if(i===total-1){
      setTimeout(function(){ track.style.transition='none'; i=0; track.style.transform='translateY(0)'; },720);
    }
  }
  setInterval(step, 2400);
})();

// Who we build for — reveal each persona as it scrolls into view (special.co style)
(function(){
  var items=[].slice.call(document.querySelectorAll('.who-row'));
  if(!items.length) return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce){ items.forEach(function(i){i.classList.add('show');}); return; }
  var io=new IntersectionObserver(function(es){es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('show'); io.unobserve(e.target); } });},{threshold:0.4,rootMargin:'0px 0px -12% 0px'});
  items.forEach(function(i){ io.observe(i); });
})();
