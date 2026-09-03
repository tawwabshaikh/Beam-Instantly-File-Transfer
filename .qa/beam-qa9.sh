#!/bin/bash
# Beam QA round 9 — i18n (en/hi) + cross-network band + photo optimization + transfer regression.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

# --- cross-network band present on landing ---
echo "== band: $(ab eval "(() => { const h = document.getElementById('cross-network-title'); const pk = document.querySelectorAll('.beam-packet').length; return h ? 'title-ok packets=' + pk : 'MISSING' })()")"
ab eval "document.getElementById('cross-network-title')?.scrollIntoView({block:'center'}); 'ok'" > /dev/null
ab wait 600
ab screenshot .qa/shots/qa9-band.png > /dev/null

# --- i18n: default English ---
H1=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1" | grep -q "Move files between devices" && echo "== i18n default EN: ok" || echo "== i18n default EN: FAIL ($H1)"

# --- switch to Hindi via header dropdown (language-independent selector: labels translate!) ---
ab click 'header nav button[aria-haspopup="menu"]' > /dev/null 2>&1 || echo "click trigger fail"
ab wait 700
ab eval "(() => { const el = [...document.querySelectorAll('[role=\"menuitem\"]')].find(e => e.textContent.includes('हिन्दी')); if (el) { el.click(); return 'clicked' } return 'NOT-FOUND' })()"
ab wait 700
H1H=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1H" | grep -q "डिवाइस" && echo "== i18n Hindi hero: ok" || echo "== i18n Hindi hero: FAIL ($H1H)"
NAVH=$(ab eval "document.querySelector('header nav')?.textContent || ''")
echo "$NAVH" | grep -q "इतिहास" && echo "== i18n Hindi nav: ok" || echo "== i18n Hindi nav: FAIL ($NAVH)"
LANGATTR=$(ab eval "document.documentElement.lang")
echo "== html lang: $LANGATTR"
ab screenshot .qa/shots/qa9-hero-hindi.png > /dev/null

# --- persistence across reload ---
ab open http://127.0.0.1:81/ > /dev/null
ab wait --load networkidle
ab wait 1200
H1P=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1P" | grep -q "डिवाइस" && echo "== i18n persisted after reload: ok" || echo "== i18n persisted after reload: FAIL ($H1P)"

# --- back to English ---
ab click 'header nav button[aria-haspopup="menu"]' > /dev/null 2>&1
ab wait 700
ab eval "(() => { const el = [...document.querySelectorAll('[role=\"menuitem\"]')].find(e => e.textContent.includes('English')); if (el) { el.click(); return 'clicked' } return 'NOT-FOUND' })()"
ab wait 700
H1E=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1E" | grep -q "Move files" && echo "== i18n back to EN: ok" || echo "== i18n back to EN: FAIL ($H1E)"
STOREDL=$(ab eval "localStorage.getItem('beam.lang.v1')")
echo "== lang pref after switch-back: $STOREDL (expect en)"

# --- desktop: files + session (same 700000B pattern as baseline for known SHA) ---
ab eval "
(() => {
  const b = new Uint8Array(700000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  const f1 = new File([b], 'qa9-d2p-a.bin', {type:'application/octet-stream'});
  const f2 = new File([new TextEncoder().encode('Beam QA9 notes payload')], 'qa9-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addFiles([f1, f2]);
  return 'added ' + window.__beam.getState().selectedFiles.length;
})()"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err:'+e.message)"
ab wait 3500
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
echo "== session: $CODE"
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
echo "== desktop tab: $DESK_TAB"

# --- phone tab ---
ab wait 2500
timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
ab wait 2000
timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
ab wait 1500
LOC=$(ab eval "location.search.includes('s=') ? 'phone' : 'wrong'" | tr -d '"')
echo "== phone tab: $LOC"
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"

# --- optimize row visible on the phone upload card ---
OPT=$(ab eval "(() => { const l = document.getElementById('beam-optimize'); return l ? 'toggle-ok' : 'MISSING' })()")
echo "== optimize toggle: $OPT"
ab screenshot .qa/shots/qa9-optimize-row.png > /dev/null

# --- (a) optimize OFF: big PNG passes through untouched ---
PNGSIZE=$(ab eval "
(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2400, 1600);
  const d = img.data; let seed = 12345;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed & 0xff; d[i+1] = (seed >> 8) & 0xff; d[i+2] = (seed >> 16) & 0xff; d[i+3] = 255; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.__qa9png1 = new File([blob], 'qa9-photo-1.png', { type: 'image/png' });
  return window.__qa9png1.size;
})()")
echo "== noisy png size: $PNGSIZE (expect > 150000)"
PH1SHA=$(ab eval "window.__qa9png1.arrayBuffer().then(b=>crypto.subtle.digest('SHA-256',b).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')))")
echo "== phone photo-1 sha (original): $PH1SHA"
ab eval "window.__beam.store.getState().addMobileFiles([window.__qa9png1]); 'added'"
ab wait 800
PASSTHRU=$(ab eval "(() => { const s = window.__beam.getState(); const f = s.mobileFiles[0]; return JSON.stringify({ name: f.name, size: f.size, orig: f.file.size, optimizedMarked: !!s.mobileOptimized[f.id] }) })()")
echo "== passthrough: $PASSTHRU"

# --- (b) optimize ON: toggle via store + persistence assert, then add second PNG ---
ab eval "window.__beam.store.getState().setOptimizeUploads(true); 'on'"
ab wait 300
STORED=$(ab eval "localStorage.getItem('beam.optimize.v1')")
echo "== pref persisted: $STORED (expect 1)"
ab eval "
(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2400, 1600);
  const d = img.data; let seed = 98765;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed & 0xff; d[i+1] = (seed >> 8) & 0xff; d[i+2] = (seed >> 16) & 0xff; d[i+3] = 255; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.__qa9png2 = new File([blob], 'qa9-photo-2.png', { type: 'image/png' });
  window.__beam.store.getState().addMobileFiles([window.__qa9png2]);
  return window.__qa9png2.size;
})()"
ab wait 3500
COMPRESSED=$(ab eval "(() => { const s = window.__beam.getState(); const f = s.mobileFiles.at(-1); return JSON.stringify({ name: f.name, original: s.mobileOptimized[f.id], now: f.size, type: f.type }) })()")
echo "== compressed: $COMPRESSED"
ab screenshot .qa/shots/qa9-optimized-hint.png > /dev/null

# --- cleanup the photos (never sent) ---
ab eval "(() => { const s = window.__beam.getState(); s.mobileFiles.map(f => f.id).forEach(id => s.removeMobileFile(id)); return s.mobileFiles.length })()" > /dev/null
ab wait 400

# --- d2p regression: phone downloads both files ---
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"
D2P=$(ab eval "Promise.all(window.__beam.getState().received.map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== d2p hashes: $D2P"

# --- p2d regression: phone uploads text file ---
PSHA=$(ab eval "crypto.subtle.digest('SHA-256', new TextEncoder().encode('Beam QA9 phone to desktop payload\n')).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
echo "== expected p2d sha: $PSHA"
ab eval "
(() => {
  const f = new File([new TextEncoder().encode('Beam QA9 phone to desktop payload\n')], 'qa9-p2d.txt', {type:'text/plain'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 2500
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 12); do
  DT=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({received:s.received.length, stats:s.stats}) })()")
  echo "$DT" | grep -q '"received":1' && break
  sleep 2
done
echo "== desktop state: $DT"
P2D=$(ab eval "Promise.all(window.__beam.getState().received.filter(r=>r.name==='qa9-p2d.txt').map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== desktop p2d hash: $P2D"
# compressed photo arrived intact? (auto-sent when added while connected)
PH=$(ab eval "(() => { const s = window.__beam.getState(); const p1 = s.received.find(r=>r.name==='qa9-photo-1.png'); const p2 = s.received.find(r=>r.name==='qa9-photo-2.jpg'); return JSON.stringify({p1: p1?.size, p2: p2?.size}) })()")
echo "== desktop received photos (expect p1=11265306 p2=1627756): $PH"
P1SHA=$(ab eval "Promise.all(window.__beam.getState().received.filter(r=>r.name==='qa9-photo-1.png').map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))))).then(j=>JSON.stringify(j))")
echo "== desktop photo-1 sha: $P1SHA"
echo "== desktop console errors:"; ab errors 2>&1 | tail -3
timeout 20 agent-browser tab new > /dev/null 2>&1
echo "== QA9 DONE"
