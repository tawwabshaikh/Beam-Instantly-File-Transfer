#!/bin/bash
# Beam feature QA round 3b — retry reorder + history with correct tab targeting.
cd /home/z/my-project

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  nohup bun run dev > /dev/null 2>&1 &
  for i in $(seq 1 60); do
    curl -s -o /dev/null --max-time 3 http://localhost:3000 && break
    sleep 1
  done
fi
echo "== server up: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"

ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }

# switch to the tab whose title/url line matches $1 (grep pattern)
switch_tab() {
  local id
  id=$(ab tab | grep -E "\[$1\]" -o | head -1)
  if [ -n "$id" ]; then
    timeout 20 agent-browser tab "$id" > /dev/null 2>&1
  fi
}

# ---------- Desktop session with 3 files ----------
ab open http://localhost:81/
ab wait --load networkidle
ab wait 1200
ab eval "
(() => {
  const mk = (n, sz) => new File([new Uint8Array(sz).fill(1)], n, {type:'application/octet-stream'});
  window.__beam.store.getState().addFiles([mk('aaa-first.bin', 50000), mk('bbb-second.bin', 40000), mk('ccc-third.bin', 30000)]);
  return 'ok';
})()"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err')"
ab wait 3500
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
echo "== session: $CODE"
DESK_TAB=$(ab tab | grep -oE '→ \[t[0-9]+\]|\-> \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
echo "== desktop tab: $DESK_TAB"

# ---------- Phone join ----------
ab wait 2000
for try in 1 2 3; do
  timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
  ab wait 1500
  timeout 40 agent-browser open "$JOIN127" > /dev/null 2>&1
  ab wait 1200
  LOC=$(ab eval "location.search.includes('s=') ? 'phone' : 'wrong'" | tr -d '"')
  [ "$LOC" = "phone" ] && break
  ab wait 3000
done
PHONE_TAB=$(ab tab | grep -oE '→ \[t[0-9]+\]|\-> \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone ($PHONE_TAB): $PH"
echo "== phone manifest order BEFORE: $(ab eval "window.__beam.getState().manifest.map(f=>f.name).join('|')")"

# ---------- Reorder on desktop (mid-session) ----------
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
F0=$(ab eval "window.__beam.getState().selectedFiles[0]?.name" | tr -d '"')
F2=$(ab eval "window.__beam.getState().selectedFiles[2]?.name" | tr -d '"')
echo "== moving [$F0] after [$F2]"
ab eval "
(() => {
  const s = window.__beam.getState();
  window.__beam.store.getState().reorderSelectedFiles(s.selectedFiles[0].id, s.selectedFiles[2].id);
  return 'moved';
})()"
ab wait 1200
echo "== order after reorder: $(ab eval "window.__beam.getState().selectedFiles.map(f=>f.name).join('|')")"
echo "== handles after connect (expect 0): $(ab eval "String(document.querySelectorAll('button[aria-label^=Reorder]').length)")"

# phone sees the new order
timeout 20 agent-browser tab "$PHONE_TAB" > /dev/null 2>&1
ab wait 800
echo "== phone manifest order AFTER: $(ab eval "window.__beam.getState().manifest.map(f=>f.name).join('|')")"
echo "== phone phase still: $(ab eval "window.__beam.getState().phase" | tr -d '"')"

# ---------- History: seed + stats + CSV (on DESKTOP tab, localhost origin) ----------
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 500
ab eval "
(() => {
  const e = [{id:'qa1', name:'qa-csv-sample.bin', size:12345, direction:'p2d', status:'completed', createdAt: Date.now()-60000, sessionCode:'QACSV1'}];
  localStorage.setItem('beam.history.v1', JSON.stringify(e));
  window.dispatchEvent(new Event('beam:history-updated'));
  return 'seeded-on-' + location.origin;
})()"
ab eval "[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('History'))?.click(); 'nav'"
ab wait 1000
echo "== history stats: $(ab eval "JSON.stringify({stat1: document.body.innerText.includes('Transfers'), stat2: document.body.innerText.includes('Data moved'), stat3: document.body.innerText.includes('Success rate'), csv: !!document.querySelector('button[aria-label*=\"as CSV\"]'), sample: document.body.innerText.includes('qa-csv-sample.bin')})")"
ab eval "
(() => {
  const btn = document.querySelector('button[aria-label*=\"as CSV\"]');
  if (!btn) return 'no-btn';
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { blob.text().then(t=>{window.__csv=t;}); return orig(blob); };
  btn.click();
  setTimeout(()=>{URL.createObjectURL = orig;}, 100);
  return 'clicked';
})()"
ab wait 800
echo "== csv captured: $(ab eval "window.__csv ? JSON.stringify(window.__csv.replace(/\r\n/g,' | ').slice(0,160)) : 'none'")"
ab screenshot /home/z/my-project/download/qa3-history.png
echo "== errors:"; ab errors 2>&1 | tail -4
echo "== QA3B DONE"
