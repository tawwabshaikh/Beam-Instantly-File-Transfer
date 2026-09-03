#!/bin/bash
# Beam QA round 4 — baseline regression two-device flow.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== beam hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

# desktop: add files + create session
ab eval "
(() => {
  const b = new Uint8Array(700000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  const f1 = new File([b], 'qa4-d2p-a.bin', {type:'application/octet-stream'});
  const f2 = new File([new TextEncoder().encode('Beam QA round4 notes')], 'qa4-notes.txt', {type:'text/plain'});
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
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"
D2P=$(ab eval "Promise.all(window.__beam.getState().received.map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,sz:r.size,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== phone d2p hashes: $D2P"

# phone upload
PSHA=$(ab eval "crypto.subtle.digest('SHA-256', new TextEncoder().encode('Beam QA4 phone to desktop payload\n')).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
echo "== expected p2d sha: $PSHA"
ab eval "
(() => {
  const f = new File([new TextEncoder().encode('Beam QA4 phone to desktop payload\n')], 'qa4-p2d.txt', {type:'text/plain'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 2500
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 12); do
  DT=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, stats:s.stats}) })()")
  echo "$DT" | grep -q '"received":1' && break
  sleep 2
done
echo "== desktop state: $DT"
P2D=$(ab eval "Promise.all(window.__beam.getState().received.filter(r=>r.name==='qa4-p2d.txt').map(r=>fetch(r.url).then(res=>res.arrayBuffer()).then(buf=>crypto.subtle.digest('SHA-256',buf).then(h=>({n:r.name,bytes:buf.byteLength,sha:[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}))))).then(j=>JSON.stringify(j))")
echo "== desktop p2d hash: $P2D"
echo "== console errors:"; ab errors 2>&1 | tail -3
echo "== QA4 BASELINE DONE"
