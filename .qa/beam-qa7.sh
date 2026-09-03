#!/bin/bash
# Beam QA round 7 — universal preview, history filters/search, ZIP bundle, title badge, hero chips.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*" ; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"
echo "== skip-link: $(ab eval "!!document.querySelector('a[href=\"#beam-main\"]') && !!document.querySelector('main#beam-main')")"
echo "== hero chips: $(ab eval "document.querySelectorAll('.beam-float').length") (expect 4)"

# ---------- 1) desktop session with 2 files ----------
ab eval "window.__beam.store.getState().setTtlMinutes(5); 'ttl'" > /dev/null
ab eval "
(() => {
  const txt = new TextEncoder().encode('QA7 meeting notes — beam universal preview');
  const big = new Uint8Array(250000); for (let i=0;i<big.length;i++) big[i]=i&0xff;
  window.__beam.store.getState().addFiles([
    new File([txt], 'qa7-d2p.txt', {type:'text/plain'}),
    new File([big], 'qa7-d2p.bin', {type:'application/octet-stream'}),
  ]);
  return 'ok';
})()" > /dev/null
ab wait 3500
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')

# ---------- 2) phone joins + downloads ----------
timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
ab wait 2000
timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
ab wait 1500
for i in $(seq 1 16); do PH=$(ab eval "window.__beam.getState().phase" | tr -d '"'); [ "$PH" = "connected" ] && break; sleep 1; done
echo "== phone phase: $PH"
ab eval "window.__beam.store.getState().downloadAll(); 'dl'" > /dev/null
for i in $(seq 1 15); do R=$(ab eval "JSON.stringify({r:window.__beam.getState().received.length,e:Object.values(window.__beam.getState().transfers).filter(t=>t.status==='error').length})"); echo "$R" | grep -q '"r":2' && echo "$R" | grep -q '"e":0' && break; sleep 2; done
echo "== phone received: $R (expect 2, 0 err)"

# ---------- 3) phone uploads text + image (desktop gets ZIP + previews) ----------
ab eval "
(() => {
  const txt = new TextEncoder().encode('QA7 notes from the phone side');
  const png1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  window.__beam.store.getState().addMobileFiles([
    new File([txt], 'qa7-notes.txt', {type:'text/plain'}),
    new File([png1x1], 'qa7-pic.png', {type:'image/png'}),
  ]);
  return 'ok';
})()" > /dev/null
timeout 20 agent-browser tab t1 > /dev/null 2>&1
ab wait 800
for i in $(seq 1 10); do RC=$(ab eval "window.__beam.getState().received.length"); [ "$RC" = "2" ] && break; sleep 2; done
echo "== desktop received: $RC (expect 2)"
echo "== zip button: $(ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Download all (.zip)')); return b ? 'present' : 'absent' })()")"

# ---------- 4) ZIP bundle (stub createObjectURL, verify PK header) ----------
echo "== zip: $(ab eval "
(async () => {
  const orig = URL.createObjectURL.bind(URL);
  let captured = null;
  URL.createObjectURL = (b) => { captured = b; return 'blob:qa7-stub' };
  try {
    [...document.querySelectorAll('button')].find(x=>x.textContent.includes('Download all (.zip)'))?.click();
    for (let i=0;i<20 && !captured;i++) await new Promise(r=>setTimeout(r,200));
    if (!captured) return 'no-blob';
    const head = await captured.slice(0,2).text();
    return JSON.stringify({magic: head, bytes: captured.size});
  } finally { URL.createObjectURL = orig; }
})()")"

# ---------- 5) text preview ----------
echo "== text eye: $(ab eval "!!document.querySelector('[aria-label=\"Preview qa7-notes.txt\"]')")"
ab eval "document.querySelector('[aria-label=\"Preview qa7-notes.txt\"]')?.click(); 'clicked'" > /dev/null
ab wait 1500
echo "== text preview: $(ab eval "(() => { const d=document.querySelector('[role=\"dialog\"]'); if(!d) return 'no-dialog'; const pre=d.querySelector('pre'); return pre ? (pre.textContent.includes('QA7 notes from the phone side') ? 'content-ok' : 'wrong:'+pre.textContent.slice(0,40)) : 'no-pre' })()")"
ab eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.getAttribute('aria-label')??'').toLowerCase().includes('close')||x.textContent.trim()==='Close'); b?.click(); return 'closed' })()" > /dev/null
ab wait 800

# ---------- 6) image preview (regression) ----------
ab eval "document.querySelector('[aria-label^=\"Open preview\"]')?.click(); 'clicked'" > /dev/null
ab wait 1200
echo "== image preview: $(ab eval "(() => { const d=document.querySelector('[role=\"dialog\"]'); return d ? (d.querySelector('img') ? 'img-ok' : 'dialog-no-img') : 'no-dialog' })()")"
ab eval "(() => { const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>(x.getAttribute('aria-label')??'').toLowerCase().includes('close')||x.textContent.trim()==='Close'); b?.click(); return 'closed' })()" > /dev/null
ab wait 600

# ---------- 7) title badge while hidden ----------
ab eval "Object.defineProperty(document, 'visibilityState', {get: () => 'hidden', configurable: true}); 'hidden-sim'" > /dev/null
timeout 20 agent-browser tab t2 > /dev/null 2>&1
ab eval "
(() => {
  const txt = new TextEncoder().encode('QA7 third file for badge');
  window.__beam.store.getState().addMobileFiles([new File([txt], 'qa7-third.txt', {type:'text/plain'})]);
  return 'ok';
})()" > /dev/null
ab wait 2500
timeout 20 agent-browser tab t1 > /dev/null 2>&1
ab wait 600
echo "== badge title (sim): $(ab eval "(() => { for (let i=0;i<10;i++){ if (document.title.startsWith('(')) break; const rc=window.__beam.getState().received.length; if (rc===3) break; } return document.title.slice(0,40) })()")"
for i in $(seq 1 6); do RC=$(ab eval "window.__beam.getState().received.length"); [ "$RC" = "3" ] && break; sleep 2; done
echo "== desktop received now: $RC (expect 3)"
ab eval "Object.defineProperty(document, 'visibilityState', {get: () => 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange')); 'visible-sim'" > /dev/null
ab wait 500
echo "== title restored: $(ab eval "document.title")"

# ---------- 8) history filters ----------
ab eval "void window.__beam.store.getState().endSession(); 'end'" > /dev/null
ab wait 2200
ab eval "(() => { const b=[...document.querySelectorAll('nav button, header button')].find(x=>x.textContent.trim().toLowerCase()==='history'); b?.click(); return 'nav' })()" > /dev/null
ab wait 1200
echo "== history total rows: $(ab eval "document.querySelectorAll('main li').length")"
ab eval "(() => { const i=document.querySelector('input[aria-label=\"Search history\"]'); const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'qa7-notes'); i.dispatchEvent(new Event('input',{bubbles:true})); return 'typed' })()" > /dev/null
ab wait 900
echo "== search filter: $(ab eval "JSON.stringify({rows: document.querySelectorAll('main li').length, note: (document.body.innerText.match(/Showing \\d+ of \\d+/)||[''])[0]})")"
ab eval "(() => { const b=document.querySelector('[aria-label=\"Clear search\"]'); b?.click(); return 'cleared' })()" > /dev/null
ab eval "(() => { const g=document.querySelector('[aria-label=\"Filter by direction\"]'); const b=[...g.querySelectorAll('button')].find(x=>x.textContent.trim()==='To desktop'); b?.click(); return 'dir' })()" > /dev/null
ab wait 800
echo "== direction filter rows: $(ab eval "document.querySelectorAll('main li').length") (expect only p2d: 3)"
ab eval "(() => { const g=document.querySelector('[aria-label=\"Filter by status\"]'); const b=[...g.querySelectorAll('button')].find(x=>x.textContent.trim()==='Failed'); b?.click(); return 'st' })()" > /dev/null
ab wait 800
echo "== failed+dir → no-match: $(ab eval "/No transfers match/.test(document.body.innerText) && !!document.querySelector('button')")"
ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Reset filters'); b?.click(); return 'reset' })()" > /dev/null
ab wait 800
echo "== after reset rows: $(ab eval "document.querySelectorAll('main li').length")"

echo "== console errors:"; ab errors 2>&1 | tail -3
echo "== QA7 DONE"
