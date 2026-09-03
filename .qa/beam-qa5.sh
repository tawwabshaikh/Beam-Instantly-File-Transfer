#!/bin/bash
# Beam QA round 5b — TTL picker (idle + recreate-on-change), thumbnails, lightbox, offline page.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== beam hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

# 1) idle phase: pick TTL BEFORE adding files
ab eval "window.__beam.store.getState().setTtlMinutes(5); 'set5-idle'"

# desktop: add files (image + bin + txt)
ab eval "
(() => {
  const png = Uint8Array.from(atob('$PNG_B64'), c => c.charCodeAt(0));
  const f1 = new File([png], 'qa5-photo.png', {type:'image/png'});
  const big = new Uint8Array(700000); for (let i=0;i<big.length;i++) big[i]=i&0xff;
  const f2 = new File([big], 'qa5-data.bin', {type:'application/octet-stream'});
  const f3 = new File([new TextEncoder().encode('QA5 notes')], 'qa5-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addFiles([f1, f2, f3]);
  return 'added ' + window.__beam.getState().selectedFiles.length;
})()"
ab wait 3500
CODE1=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
TTLCHK=$(ab eval "(() => { const e = window.__beam.getState().session?.expiresAt ?? 0; return ((e - Date.now())/60000).toFixed(2) + ' min' })()")
echo "== session A: $CODE1 ttl-remaining: $TTLCHK (expect ~5.0)"

# 2) recreate-on-change: set TTL 15 while waiting → new session
ab eval "window.__beam.store.getState().setTtlMinutes(15); 'set15-waiting'"
ab wait 4000
CODE2=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
TTLCHK2=$(ab eval "(() => { const e = window.__beam.getState().session?.expiresAt ?? 0; return ((e - Date.now())/60000).toFixed(2) + ' min' })()")
STORE_TTL=$(ab eval "window.__beam.getState().ttlMinutes")
echo "== session B: $CODE2 (was $CODE1 — must differ) ttl: $TTLCHK2 (expect ~15) store.ttl: $STORE_TTL"

JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)

# 3) phone tab join
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
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
PH_TAB=$(ab tab | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
echo "== phone phase: $PH (tab $PH_TAB)"

# 4) phone downloads everything (d2p)
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":3' && break
  sleep 2
done
echo "== phone received: $R (expect 3, err 0)"

# 5) phone uploads an image (p2d) — thumbnail in upload list
ab eval "
(() => {
  const png = Uint8Array.from(atob('$PNG_B64'), c => c.charCodeAt(0));
  const f = new File([png], 'qa5-cam-shot.png', {type:'image/png'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 1200
echo "== phone upload-row img: $(ab eval "document.querySelectorAll('[aria-label=\"Send files to desktop\"] img').length") (expect 1)"
ab wait 2500

# 6) desktop: received image → thumbnail + lightbox
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 10); do
  RC=$(ab eval "window.__beam.getState().received.length")
  [ "$RC" = "1" ] && break
  sleep 2
done
echo "== desktop received: $RC (expect 1)"
echo "== desktop thumb imgs: $(ab eval "document.querySelectorAll('[aria-label=\"Received files\"] img').length") (expect >=1)"
ab eval "document.querySelector('[aria-label=\"Received files\"] button[aria-label^=\"Open preview\"]').click(); 'clicked'"
ab wait 1200
echo "== lightbox: $(ab eval "(() => { const d = document.querySelector('[role=\"dialog\"]'); return d ? (d.querySelector('img') ? 'img-shown' : 'dialog-no-img') : 'no-dialog' })()")"
echo "== lightbox caption: $(ab eval "(document.querySelector('[role=\"dialog\"]')?.textContent || '').slice(0, 60)")"
ab eval "(() => { window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); return 'esc' })()"
ab wait 800
echo "== lightbox closed: $(ab eval "!document.querySelector('[role=\"dialog\"]')")"

# 7) offline page + SW
echo "== offline.html status: $(ab eval "fetch('/offline.html').then(r => r.status)")"
echo "== sw: $(ab eval "navigator.serviceWorker.getRegistration().then(r => r ? 'sw-registered' : 'no-sw')")"

echo "== console errors:"; ab errors 2>&1 | tail -3
echo "== QA5B DONE"
