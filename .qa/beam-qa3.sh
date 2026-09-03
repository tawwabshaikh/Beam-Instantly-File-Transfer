#!/bin/bash
# Beam feature QA round 3 — reorder, CSV, stats strip, PWA button, landing.
cd /home/z/my-project

if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  nohup bun run dev > /dev/null 2>&1 &
  for i in $(seq 1 60); do
    curl -s -o /dev/null --max-time 3 http://localhost:3000 && break
    sleep 1
  done
fi
echo "== server up: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"

timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*"; }
ab wait 1000

# ---------- Landing ----------
ab open http://localhost:81/
ab wait --load networkidle
ab wait 1000
echo "== landing: $(ab eval "JSON.stringify({hero: document.body.innerText.includes('Move files between devices'), steps: ['Select','Scan','Transfer'].every(t=>document.body.innerText.includes(t)), installBtn: !!document.querySelector('button[aria-label=\"Install Beam as an app\"]')})")"
ab screenshot /home/z/my-project/download/qa3-landing.png

# ---------- Desktop session with 3 files ----------
ab eval "
(() => {
  const mk = (n, sz) => new File([new Uint8Array(sz).fill(1)], n, {type:'application/octet-stream'});
  window.__beam.store.getState().addFiles([mk('aaa-first.bin', 50000), mk('bbb-second.bin', 40000), mk('ccc-third.bin', 30000)]);
  return window.__beam.getState().selectedFiles.map(f=>f.name).join('|');
})()"
echo "== order before reorder: $(ab eval "window.__beam.getState().selectedFiles.map(f=>f.name).join('|')")"
ab eval "window.__beam.store.getState().createNewSession().then(()=>'ok').catch(e=>'err')"
ab wait 3500
CODE=$(ab eval "window.__beam.getState().session?.code || ''" | tr -d '"')
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
echo "== session: $CODE"
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -o '\-> \[t[0-9]*\]' | grep -o 't[0-9]*' | head -1)
echo "== desktop tab: $DESK_TAB"

# handles visible + hint text
echo "== drag handles: $(ab eval "String(document.querySelectorAll('button[aria-label^=Reorder]').length)")"
echo "== reorder hint: $(ab eval "String(document.body.innerText.includes('drag to reorder'))")"
ab screenshot /home/z/my-project/download/qa3-desktop-files.png

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
echo "== phone tab: $LOC"
for i in $(seq 1 16); do
  PH=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH" = "connected" ] && break
  sleep 1
done
echo "== phone phase: $PH"
echo "== phone manifest order: $(ab eval "window.__beam.getState().manifest.map(f=>f.name).join('|')")"

# ---------- Desktop reorder mid-session ----------
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
ab eval "window.__beam.store.getState().reorderSelectedFiles(window.__beam.getState().selectedFiles[0].id, window.__beam.getState().selectedFiles[2].id); 'moved'"
ab wait 1200
echo "== order after reorder: $(ab eval "window.__beam.getState().selectedFiles.map(f=>f.name).join('|')")"
# locked when connected -> handles hidden now
echo "== handles after connect (expect 0): $(ab eval "String(document.querySelectorAll('button[aria-label^=Reorder]').length)")"

# phone sees new order
timeout 20 agent-browser tab t2 > /dev/null 2>&1
ab wait 800
echo "== phone manifest after reorder: $(ab eval "window.__beam.getState().manifest.map(f=>f.name).join('|')")"
PH_PHONE=$(ab eval "window.__beam.getState().phase" | tr -d '"')
echo "== phone still: $PH_PHONE"

# ---------- History: record + CSV + stats ----------
# seed a history entry via engine recordHistory? Not exposed. Use localStorage directly.
ab eval "
(() => {
  const e = [{id:'qa1', name:'qa-csv-sample.bin', size:12345, direction:'p2d', status:'completed', createdAt: Date.now()-60000, sessionCode:'QACSV1'}];
  localStorage.setItem('beam.history.v1', JSON.stringify(e));
  window.dispatchEvent(new Event('beam:history-updated'));
  return 'seeded';
})()"
timeout 40 agent-browser open "http://localhost:81/#history" > /dev/null 2>&1
ab wait 1200
# nav via header button instead (hash may not switch view)
ab eval "[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('History'))?.click(); 'nav'"
ab wait 1000
echo "== history stats: $(ab eval "JSON.stringify({stat1: document.body.innerText.includes('Transfers'), stat2: document.body.innerText.includes('Data moved'), stat3: document.body.innerText.includes('Success rate'), csv: !!document.querySelector('button[aria-label*=\"as CSV\"]'), sample: document.body.innerText.includes('qa-csv-sample.bin')})")"
echo "== csv content: $(ab eval "
(() => {
  const btn = document.querySelector('button[aria-label*=\"as CSV\"]');
  if (!btn) return 'no-btn';
  // capture the generated CSV by intercepting URL.createObjectURL
  const orig = URL.createObjectURL.bind(URL);
  let captured = '';
  URL.createObjectURL = (blob) => { blob.text().then(t=>{captured=t; window.__csv=t;}); return orig(blob); };
  btn.click();
  URL.createObjectURL = orig;
  return 'clicked';
})()")"
ab wait 800
echo "== csv captured: $(ab eval "window.__csv ? window.__csv.replace(/\n/g,' \\\\n ').slice(0,140) : 'none'")"
ab screenshot /home/z/my-project/download/qa3-history.png

# ---------- PWA button synthetic ----------
ab eval "
(() => {
  const fake = new Event('beforeinstallprompt');
  fake.prompt = () => Promise.resolve();
  fake.userChoice = Promise.resolve({outcome:'dismissed'});
  window.dispatchEvent(fake);
  return 'dispatched';
})()"
ab wait 600
echo "== install button after event: $(ab eval "String(!!document.querySelector('button[aria-label=\"Install Beam as an app\"]'))")"

# console + errors
echo "== errors:"; ab errors 2>&1 | tail -4
echo "== QA3 DONE"
