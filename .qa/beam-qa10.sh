#!/bin/bash
# Beam QA round 10 — i18n expansion (history/notes/mobile), compression presets, countdown ring, guest expiry fix.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

# --- seed one history entry, then open History and check EN strings ---
ab eval "
(() => {
  const entry = [{ id: 'qa10-1', name: 'qa10-sample.bin', size: 2048, direction: 'd2p', status: 'completed', createdAt: Date.now() - 60_000, sessionCode: 'QA10AB' }];
  localStorage.setItem('beam.history.v1', JSON.stringify(entry));
  return 'seeded';
})()" > /dev/null
ab eval "(() => { const b = [...document.querySelectorAll('header nav button')].find(x => x.textContent.trim() === 'History'); if (b) { b.click(); return 'clicked' } return 'NOT-FOUND' })()"
ab wait 900
H1=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1" | grep -q "Transfer history" && echo "== hist EN title: ok" || echo "== hist EN title: FAIL ($H1)"
PH=$(ab eval "document.querySelector('input[aria-label=\"Search history\"]')?.placeholder || ''")
echo "$PH" | grep -q "Search file names" && echo "== hist EN search: ok" || echo "== hist EN search: FAIL ($PH)"
ROWS=$(ab eval "document.querySelectorAll('main li').length")
echo "== hist rows rendered: $ROWS"

# --- switch to Hindi (live, while on history view) and re-check ---
ab click 'header nav button[aria-haspopup="menu"]' > /dev/null 2>&1
ab wait 700
ab eval "(() => { const el = [...document.querySelectorAll('[role=\"menuitem\"]')].find(e => e.textContent.includes('हिन्दी')); el?.click(); return 'ok' })()" > /dev/null
ab wait 800
H1H=$(ab eval "document.querySelector('h1')?.textContent || ''")
echo "$H1H" | grep -q "ट्रांसफ़र इतिहास" && echo "== hist HI title: ok" || echo "== hist HI title: FAIL ($H1H)"
PHH=$(ab eval "document.querySelector('input')?.placeholder || ''")
echo "$PHH" | grep -q "खोजें" && echo "== hist HI search: ok" || echo "== hist HI search: FAIL ($PHH)"
BADGE=$(ab eval "document.body.innerText.includes('डेस्कटॉप → फ़ोन') ? 'dir-ok' : 'MISSING'")
echo "== hist HI direction badge: $BADGE"

# --- back to English, clear seeded history ---
ab click 'header nav button[aria-haspopup="menu"]' > /dev/null 2>&1
ab wait 700
ab eval "(() => { const el = [...document.querySelectorAll('[role=\"menuitem\"]')].find(e => e.textContent.includes('English')); el?.click(); return 'ok' })()" > /dev/null
ab wait 800
ab eval "(() => { const b = [...document.querySelectorAll('header nav button')].find(x => x.textContent.trim() === 'Transfer' || x.textContent.trim() === 'ट्रांसफ़र'); if (b) { b.click(); return 'clicked' } return 'NOT-FOUND' })()" > /dev/null
ab wait 700
ab eval "localStorage.removeItem('beam.history.v1'); 'cleared'" > /dev/null
ab eval "
(() => {
  const b = new Uint8Array(700000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  const f1 = new File([b], 'qa10-d2p-a.bin', {type:'application/octet-stream'});
  const f2 = new File([new TextEncoder().encode('Beam QA10 notes payload')], 'qa10-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addFiles([f1, f2]);
  return 'added ' + window.__beam.getState().selectedFiles.length;
})()"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err:'+e.message)"
ab wait 3500
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
TTL=$(ab eval "window.__beam.getState().session?.sessionTtlMs || 0")
echo "== session: $CODE ttlMs: $TTL (expect ~600000)"

# --- countdown ring present on the waiting QR card ---
RING=$(ab eval "(() => { const circles = [...document.querySelectorAll('section[aria-label=\"QR pairing\"] circle')]; return circles.length >= 2 ? 'ring-ok(' + circles.length + ')' : 'MISSING(' + circles.length + ')' })()")
echo "== qr countdown ring: $RING"

TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)

# --- phone tab ---
ab wait 2500
timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
ab wait 2000
timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
ab wait 1500
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"

# --- guest expiry fix: phone now knows expiresAt + ttl (countdown timer + hairline bar) ---
GEXP=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({ expiresAt: s.session?.expiresAt > 0, ttl: s.session?.sessionTtlMs }) })()")
echo "== guest expiry: $GEXP"
TIMER=$(ab eval "(() => { const txt = document.querySelector('header code')?.textContent; const bar = !!document.querySelector('header .h-0\\\\.5'); return JSON.stringify({ code: txt, bar }) })()")
echo "== phone header: $TIMER"

# --- segmented preset control present; default from legacy '1' -> balanced ---
PRESETS=$(ab eval "(() => { const g = document.querySelector('[role=\"radiogroup\"]'); const radios = [...document.querySelectorAll('[role=\"radio\"]')]; return JSON.stringify({ group: !!g, n: radios.length, checked: radios.find(r => r.getAttribute('aria-checked') === 'true')?.textContent }) })()")
echo "== preset control: $PRESETS"

# --- preset ORIGINAL: passthrough ---
ab eval "window.__beam.store.getState().setOptimizePreset('original'); 'ok'" > /dev/null
PNG1=$(ab eval "
(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2400, 1600);
  const d = img.data; let seed = 22222;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed & 0xff; d[i+1] = (seed >> 8) & 0xff; d[i+2] = (seed >> 16) & 0xff; d[i+3] = 255; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.__qa10png1 = new File([blob], 'qa10-original.png', { type: 'image/png' });
  window.__beam.store.getState().addMobileFiles([window.__qa10png1]);
  return window.__qa10png1.size;
})()")
ab wait 900
ORIG=$(ab eval "(() => { const f = window.__beam.getState().mobileFiles.at(-1); return JSON.stringify({ name: f.name, size: f.size, marked: !!window.__beam.getState().mobileOptimized[f.id] }) })()")
echo "== original preset: $ORIG (png was $PNG1)"

# --- preset BALANCED: compresses at 2016px ---
ab eval "window.__beam.store.getState().setOptimizePreset('balanced'); 'ok'" > /dev/null
ab eval "
(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2400, 1600);
  const d = img.data; let seed = 33333;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed & 0xff; d[i+1] = (seed >> 8) & 0xff; d[i+2] = (seed >> 16) & 0xff; d[i+3] = 255; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], 'qa10-balanced.png', { type: 'image/png' });
  window.__qa10balancedSize = blob.size;
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 3500
BAL=$(ab eval "(() => { const s = window.__beam.getState(); const f = s.mobileFiles.at(-1); return JSON.stringify({ name: f.name, original: s.mobileOptimized[f.id], now: f.size }) })()")
echo "== balanced preset: $BAL (png was ' + window.__qa10balancedSize)"

# --- preset COMPACT: smaller than balanced ---
ab eval "window.__beam.store.getState().setOptimizePreset('compact'); 'ok'" > /dev/null
STORED=$(ab eval "localStorage.getItem('beam.optimize.v1')")
ab eval "
(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2400, 1600);
  const d = img.data; let seed = 44444;
  for (let i = 0; i < d.length; i += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed & 0xff; d[i+1] = (seed >> 8) & 0xff; d[i+2] = (seed >> 16) & 0xff; d[i+3] = 255; }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], 'qa10-compact.png', { type: 'image/png' });
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 3500
CMP=$(ab eval "(() => { const s = window.__beam.getState(); const f = s.mobileFiles.at(-1); return JSON.stringify({ name: f.name, original: s.mobileOptimized[f.id], now: f.size }) })()")
echo "== compact preset: $CMP"
echo "== pref stored: $STORED (expect compact)"

# --- remove photos, run transfer regression (text/bin unaffected by presets) ---
ab eval "(() => { const s = window.__beam.getState(); [...s.mobileFiles].forEach(f => s.removeMobileFile(f.id)); return s.mobileFiles.length })()" > /dev/null
ab wait 400
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"
D2P=$(ab eval "Promise.all(window.__beam.getState().received.map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== d2p hashes: $D2P"

PSHA=$(ab eval "crypto.subtle.digest('SHA-256', new TextEncoder().encode('Beam QA10 phone to desktop payload\n')).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
ab eval "
(() => {
  const f = new File([new TextEncoder().encode('Beam QA10 phone to desktop payload\n')], 'qa10-p2d.txt', {type:'text/plain'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 2500
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 12); do
  DT=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({received:s.received.length, stats:s.stats}) })()")
  echo "$DT" | grep -q '"received":4' && break
  sleep 2
done
echo "== desktop state: $DT"
P2D=$(ab eval "Promise.all(window.__beam.getState().received.filter(r=>r.name==='qa10-p2d.txt').map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== desktop p2d hash: $P2D (expect $PSHA)"
echo "== desktop console errors:"; ab errors 2>&1 | tail -3
echo "== QA10 DONE"
