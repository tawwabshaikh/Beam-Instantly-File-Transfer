#!/bin/bash
# Beam QA round 8 — share target handoff, speed graph, drag-out, edit & send back.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000

echo "=========== 1) SHARE TARGET HANDOFF ==========="
ab open "http://127.0.0.1:81/?title=Meeting%20notes&text=Beam%20share%20target%20works&url=https%3A%2F%2Fexample.com%2Fpage"
ab wait --load networkidle
ab wait 1800
echo "hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"
echo "url-cleaned: $(ab eval "location.search")"
ab eval "(() => { const b=document.querySelector('[data-testid=\"shared-text-banner\"]'); return JSON.stringify({banner: !!b, text: b ? b.textContent.slice(0,200) : null}) })()"
ab eval "(() => { const btn=[...document.querySelectorAll('[data-testid=\"shared-text-banner\"] button')].find(b=>b.textContent.includes('Add as file')); if(!btn) return 'NO-BTN'; btn.click(); return 'clicked' })()"
ab wait 1500
ab eval "(() => { const f=window.__beam.getState().selectedFiles[0]; if(!f) return 'NO-FILE'; return f.file.text().then(t=>JSON.stringify({name:f.name, body:t})) })()"
ab eval "window.__beam.getState().resetAll(); 'reset'"
ab wait 1500
timeout 30 agent-browser screenshot /home/z/my-project/download/qa8-share-banner.png >/dev/null 2>&1

echo "=========== 2) SESSION + SPEED GRAPH ==========="
ab eval "
(() => {
  const b = new Uint8Array(400000); for (let i=0;i<b.length;i++) b[i]=i&0xff;
  const f1 = new File([b], 'qa8-big.bin', {type:'application/octet-stream'});
  const f2 = new File([new TextEncoder().encode('Beam QA round8 desk notes')], 'qa8-notes.txt', {type:'text/plain'});
  window.__beam.store.getState().addFiles([f1, f2]);
  return 'added';
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

ab wait 2000
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
PH_TAB=$(ab tab | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
echo "== phone tab id: $PH_TAB"
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"

timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
ab eval "(() => { const g=document.querySelector('[data-testid=\"speed-graph\"]'); return JSON.stringify({graph: !!g, paths: g ? g.querySelectorAll('path').length : 0, gridlines: g ? g.querySelectorAll('line').length : 0}) })()"

echo "=========== 3) PHONE DOWNLOADS (regression) ==========="
timeout 20 agent-browser tab "$PH_TAB" > /dev/null 2>&1
ab wait 500
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 20); do
  R=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, err:Object.values(s.transfers).filter(r=>r.status==='error').length}) })()")
  echo "$R" | grep -q '"received":2' && break
  sleep 2
done
echo "== phone received: $R"

echo "=========== 4) PHONE UPLOAD + DRAG-OUT + EDIT ROUND TRIP ==========="
PSHA=$(ab eval "crypto.subtle.digest('SHA-256', new TextEncoder().encode('QA8 p2d payload')).then(h=>[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''))")
echo "== expected p2d sha: $PSHA"
ab eval "
(() => {
  const f = new File([new TextEncoder().encode('QA8 p2d payload')], 'qa8-shared.txt', {type:'text/plain'});
  window.__beam.store.getState().addMobileFiles([f]);
  return 'ok';
})()"
ab wait 2500
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 12); do
  DT=$(ab eval "(() => { const s=window.__beam.getState(); return JSON.stringify({received:s.received.length, names:s.received.map(r=>r.name)}) })()")
  echo "$DT" | grep -q '"received":1' && break
  sleep 2
done
echo "== desktop received: $DT"

echo "--- drag-out (DownloadURL) ---"
ab eval "
(() => {
  const li = [...document.querySelectorAll('li[draggable=\"true\"]')].find(l => l.textContent.includes('qa8-shared.txt'));
  if (!li) return 'NO-LI';
  const dt = new DataTransfer();
  li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  let got = null;
  try { got = dt.getData('DownloadURL'); } catch (e) { got = 'READ-ERR'; }
  return JSON.stringify({ got, hook: window.__beam.lastDragOut || null });
})()"
timeout 30 agent-browser screenshot /home/z/my-project/download/qa8-received-dragout.png >/dev/null 2>&1

echo "--- edit & send back ---"
ab eval "(() => { const b=document.querySelector('button[aria-label=\"Preview qa8-shared.txt\"]'); if(!b) return 'NO-EYE'; b.click(); return 'open' })()"
ab wait 1200
ab eval "(() => { const pre=document.querySelector('[role=\"dialog\"] pre'); return JSON.stringify({dialogText: pre ? pre.textContent : null}) })()"
ab eval "(() => { const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Edit & send back')); if(!btn) return 'NO-EDIT-BTN'; btn.click(); return 'editing' })()"
ab wait 600
ab eval "
(() => {
  const ta = document.querySelector('[role=\"dialog\"] textarea');
  if (!ta) return 'NO-TA';
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'QA8 EDITED on desktop: round trip complete');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()"
ab eval "(() => { const btn=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Send to phone')); if(!btn) return 'NO-SEND-BTN'; btn.click(); return 'sent' })()"
ab wait 2000
ab eval "(() => { const f=window.__beam.getState().selectedFiles.find(f=>f.name.includes('(edited)')); if(!f) return 'NO-EDITED-FILE'; return f.file.text().then(t=>JSON.stringify({name:f.name, body:t})) })()"

echo "=========== 5) PHONE RECEIVES EDITED COPY ==========="
timeout 20 agent-browser tab "$PH_TAB" > /dev/null 2>&1
ab wait 800
ab eval "(() => { const m = window.__beam.getState().manifest.find(f=>f.name.includes('(edited)')); if (!m) return 'NOT-IN-MANIFEST'; window.__beam.store.getState().requestDownload(m.id); return 'requested:'+m.name })()"
for i in $(seq 1 15); do
  ED=$(ab eval "(() => { const r = window.__beam.getState().received.find(r=>r.name.includes('(edited)')); if(!r) return null; return fetch(r.url).then(res=>res.text()).then(t=>JSON.stringify({name:r.name, text:t})) })()" | tr -d '\n')
  echo "$ED" | grep -q "edited" && break
  sleep 2
done
echo "== phone edited copy: $ED"

echo "=========== 6) ERRORS ==========="
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
echo "== console errors:"; ab errors 2>&1 | tail -4
echo "== QA8 DONE"
