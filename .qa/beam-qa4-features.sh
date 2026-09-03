#!/bin/bash
# Beam QA round 4 — notes both directions, extend UI, SW, transfer regression.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== beam hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"
echo "== hero shimmer: $(ab eval "String(!!document.querySelector('.hero-shimmer'))")"
ab screenshot /home/z/my-project/download/qa4-landing.png

# desktop: files + session
ab eval "
(() => {
  const b = new Uint8Array(300000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  window.__beam.store.getState().addFiles([new File([b], 'qa4-big.bin', {type:'application/octet-stream'}), new File([new TextEncoder().encode('round four')], 'qa4.txt', {type:'text/plain'})]);
  return 'added';
})()"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err')"
ab wait 3500
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
echo "== session: $CODE"
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
echo "== desktop tab: $DESK_TAB"

# extend button present but disabled on fresh session
echo "== extend btn (waiting): $(ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Extend')); return b? (b.disabled?'visible-disabled':'visible-enabled') : 'absent' })()")"

# phone tab
ab wait 2500
for try in 1 2 3; do
  timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
  ab wait 2000
  timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
  ab wait 1500
  LOC=$(ab eval "location.search.includes('s=') ? 'phone' : 'wrong'" | tr -d '"')
  [ "$LOC" = "phone" ] && break
  ab wait 4000
done
echo "== phone tab: $LOC"
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"

# service worker registered?
echo "== sw: $(ab eval "navigator.serviceWorker.getRegistration().then(r => r ? 'registered:' + r.scope : 'none')")"

# ---- Notes: desktop → phone ----
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
ab eval "
(() => {
  const ta = document.querySelector('section[aria-label=Notes] textarea');
  if (!ta) return 'no-textarea';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'wifi password: beam-rocks-2026');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()"
ab wait 300
ab eval "[...document.querySelectorAll('section[aria-label=Notes] button')].find(b=>b.textContent.includes('Send'))?.click(); 'sent'"
ab wait 1200
echo "== desktop notes count: $(ab eval "window.__beam.getState().notes.length")"
timeout 20 agent-browser tab t2 > /dev/null 2>&1
ab wait 800
echo "== phone received note: $(ab eval "(() => { const n=window.__beam.getState().notes; return n.length===1 && n[0].from==='host' && n[0].text==='wifi password: beam-rocks-2026' ? 'ok' : JSON.stringify(n) })()")"
echo "== phone bubble rendered: $(ab eval "String(document.body.innerText.includes('wifi password: beam-rocks-2026'))")"
ab screenshot /home/z/my-project/download/qa4-phone-note.png

# ---- Notes: phone → desktop ----
ab eval "
(() => {
  const ta = document.querySelector('section[aria-label=Notes] textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'photo incoming, check transfers');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()"
ab wait 300
ab eval "[...document.querySelectorAll('section[aria-label=Notes] button')].find(b=>b.textContent.includes('Send'))?.click(); 'sent'"
ab wait 1200
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
echo "== desktop notes: $(ab eval "(() => { const n=window.__beam.getState().notes; return JSON.stringify(n.map(x=>x.from+':'+x.text)) })()")"

# ---- transfers still work: download all on phone + verify sizes ----
timeout 20 agent-browser tab t2 > /dev/null 2>&1
ab wait 500
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"
D2P=$(ab eval "Promise.all(window.__beam.getState().received.map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>({n:r.name,bytes:buf.byteLength}))))).then(j=>JSON.stringify(j))" 2>/dev/null || ab eval "Promise.all(window.__beam.getState().received.map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>({n:r.name,bytes:buf.byteLength})))).then(j=>JSON.stringify(j))")
echo "== phone d2p sizes: $D2P"
echo "== console errors:"; ab errors 2>&1 | tail -3
ab screenshot /home/z/my-project/download/qa4-desktop-final.png
echo "== QA4 FEATURES DONE"
