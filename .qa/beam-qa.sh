#!/bin/bash
# Beam QA sweep v2 — correct tab targeting.
cd /home/z/my-project

# 1) dev server — reuse if alive, else start fresh
if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  nohup bun run dev > /dev/null 2>&1 &
  for i in $(seq 1 60); do
    curl -s -o /dev/null --max-time 3 http://localhost:3000 && break
    sleep 1
  done
fi
echo "== server up: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"

# 2) clean browser state
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://localhost:81/
ab wait --load networkidle
ab wait 1200
echo "== beam hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

# 3) desktop: add files + create session
ab eval "
(() => {
  const b = new Uint8Array(700000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  const f1 = new File([b], 'qa-d2p-a.bin', {type:'application/octet-stream'});
  const f2 = new File([new TextEncoder().encode('Beam QA desktop notes r3')], 'qa-d2p-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addFiles([f1, f2]);
  return 'added ' + window.__beam.getState().selectedFiles.length;
})()"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err:'+e.message)"
ab wait 3500
SESS=$(ab eval "(() => { const s = window.__beam.getState(); return JSON.stringify({phase:s.phase, code:s.session?.code, files:s.selectedFiles.length}) })()" | tr -d '"')
echo "== desktop state: $SESS"
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
echo "== session: $CODE"

# remember desktop tab id (active tab marker)
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -o '\-> \[t[0-9]*\]' | grep -o 't[0-9]*' | head -1)
[ -z "$DESK_TAB" ] && DESK_TAB=$(echo "$TABLIST" | grep -o '→ \[t[0-9]*\]' | grep -o 't[0-9]*' | head -1)
echo "== desktop tab: $DESK_TAB"
ab eval "document.querySelector('canvas, img[alt]') ? 'qr-el-present' : 'no-qr-el'"
ab screenshot /home/z/my-project/download/qa-desktop-waiting.png

# 4) phone tab
ab wait 3000
PHONE_OK=""
for try in 1 2 3 4; do
  timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
  ab wait 2000
  timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
  ab wait 1500
  ab wait --load networkidle
  LOC=$(ab eval "location.search.includes('s=') ? 'phone-tab' : 'wrong-tab'" | tr -d '"')
  echo "== phone tab try $try: loc=$LOC"
  [ "$LOC" = "phone-tab" ] && PHONE_OK=1 && break
  ab wait 5000
done
[ -z "$PHONE_OK" ] && { echo 'FATAL: could not open phone tab'; exit 1; }
PHONE_TAB=$(ab tab | grep -o '\-> \[t[0-9]*\]' | grep -o 't[0-9]*' | head -1)
echo "== phone tab: $PHONE_TAB"
ab wait 1000
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"
ab eval "JSON.stringify({phase:window.__beam.getState().phase, manifest:window.__beam.getState().manifest.length, mode:window.__beam.getState().mode})"
ab screenshot /home/z/my-project/download/qa-phone-connected.png

# 5) phone downloads all + hashes
ab eval "window.__beam.store.getState().downloadAll(); 'dl-all'"
ab wait 2000
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"
D2P_HASH=$(ab eval "
(() => {
  const rec = window.__beam.getState().received;
  return Promise.all(rec.map(r => fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256', buf).then(h=>({name:r.name, size:r.size, bytes:buf.byteLength, sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})))));
})().then(j=>JSON.stringify(j))")
echo "== phone d2p hashes: $D2P_HASH"
ab screenshot /home/z/my-project/download/qa-phone-downloaded.png

# 6) phone uploads a file (auto-push)
PAYLOAD_SHA=$(ab eval "crypto.subtle.digest('SHA-256', new TextEncoder().encode('Beam QA phone -> desktop upload r3\nline-two\n')).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
echo "== expected p2d sha: $PAYLOAD_SHA"
ab eval "
(() => {
  const payload = 'Beam QA phone -> desktop upload r3\nline-two\n';
  const f = new File([new TextEncoder().encode(payload)], 'qa-p2d-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'mfiles ' + window.__beam.getState().mobileFiles.length;
})()"
ab wait 2000
P2D_ROW=$(ab eval "(() => { const s=window.__beam.getState(); const r=Object.values(s.transfers).find(t=>t.direction==='p2d'); return r?JSON.stringify({st:r.status,tr:r.transferred}):'none' })()")
echo "== phone p2d row: $P2D_ROW"

# 7) desktop: switch back, verify incoming/received
ab wait 1000
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 12); do
  DT=$(ab eval "(() => { const s=window.__beam.getState(); const r=Object.values(s.transfers).find(t=>t.direction==='p2d'); return JSON.stringify({incoming:s.incomingFiles.length, received:s.received.length, p2d:r?{st:r.status,tr:r.transferred}:null, stats:s.stats}) })()")
  echo "desktop t=$i: $DT"
  echo "$DT" | grep -q '"received":1' && break
  sleep 2
done
P2D_HASH=$(ab eval "
(() => {
  const rec = window.__beam.getState().received.filter(r=>r.name==='qa-p2d-notes.txt');
  return Promise.all(rec.map(r => fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256', buf).then(h=>({name:r.name, size:r.size, bytes:buf.byteLength, sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')})))));
})().then(j=>JSON.stringify(j))")
echo "== desktop p2d hashes: $P2D_HASH"
ab screenshot /home/z/my-project/download/qa-desktop-received.png

# 8) console + errors per tab
echo "== desktop console:"; ab console 2>&1 | tail -4
echo "== desktop errors:"; ab errors 2>&1 | tail -4
timeout 20 agent-browser tab "$PHONE_TAB" > /dev/null 2>&1
ab wait 500
echo "== phone console:"; ab console 2>&1 | tail -4
echo "== phone errors:"; ab errors 2>&1 | tail -4
echo "== phone final:"; ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({phase:s.phase, stats:s.stats}) })()"

# cleanup extra tabs (keep memory low)
echo "== QA DONE"
