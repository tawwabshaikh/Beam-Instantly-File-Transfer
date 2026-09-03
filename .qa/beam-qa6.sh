#!/bin/bash
# Beam QA round 6 — QR scan-line + TTL chip, global drop overlay, save-to-folder UI,
# session summaries, scanner dialogs (FAB + invalid view), history polish.
cd /home/z/my-project
timeout 20 agent-browser close --all 2>/dev/null
ab() { timeout 45 agent-browser "$@" || echo "AB-FAIL: $*" ; }
ab wait 1000
ab open http://127.0.0.1:81/
ab wait --load networkidle
ab wait 1500
echo "== hook: $(ab eval "window.__beam ? window.__beam.version : 'MISSING'")"

PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

# ---------- 1) desktop: idle → ttl 5 → add 1 file ----------
ab eval "window.__beam.store.getState().setTtlMinutes(5); 'ttl5'"
ab eval "
(() => {
  const png = Uint8Array.from(atob('$PNG_B64'), c => c.charCodeAt(0));
  const f1 = new File([png], 'qa6-photo.png', {type:'image/png'});
  window.__beam.store.getState().addFiles([f1]);
  return 'added';
})()"
ab wait 3500
echo "== phase: $(ab eval "window.__beam.getState().phase" | tr -d '"')"
echo "== scan-line present: $(ab eval "!!document.querySelector('[data-qr-panel] .beam-scan-line, .beam-scan-line')")"
echo "== ttl chip: $(ab eval "(document.body.innerText.match(/Link valid for \\d+ min/) || ['none'])[0]")"
echo "== extend disabled: $(ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Extend')); return b ? b.disabled + '|' + b.title.slice(0,44) : 'no-btn' })()")"

# ---------- 2) global drop overlay (synthetic DragEvents) ----------
ab eval "
(() => {
  const mkDt = () => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(4)], 'dt.txt', {type:'text/plain'})); return dt };
  window.__qaDT = mkDt();
  document.body.dispatchEvent(new DragEvent('dragenter', {bubbles:true, cancelable:true, dataTransfer: window.__qaDT}));
  return 'dispatched';
})()"
ab wait 600
echo "== overlay visible: $(ab eval "!!document.querySelector('[data-beam-drop-overlay]')")"
echo "== overlay text: $(ab eval "(document.querySelector('[data-beam-drop-overlay]')?.textContent || '').slice(0,40)")"
echo "== overlay drop → files: $(ab eval "
(() => {
  const before = window.__beam.getState().selectedFiles.length;
  document.body.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer: window.__qaDT}));
  return before + '->' + window.__beam.getState().selectedFiles.length + ' overlay-gone:' + !document.querySelector('[data-beam-drop-overlay]');
})()")"
ab wait 3000
# double-add guard: drop directly on the DropzoneCard (stopPropagation + drop-complete)
echo "== card drop no-double-add: $(ab eval "
(() => {
  const before = window.__beam.getState().selectedFiles.length;
  const card = document.querySelector('[aria-label=\"Upload files: drag and drop or press Enter to browse\"]');
  if (!card) return 'no-card(idle-gone)';
  const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(4)], 'dt2.txt', {type:'text/plain'}));
  card.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer: dt}));
  return before + '->' + window.__beam.getState().selectedFiles.length + ' overlay-clean:' + !document.querySelector('[data-beam-drop-overlay]');
})()")"

# ---------- 3) phone join + transfers (regression through new UI) ----------
JOIN=$(ab eval "window.__beam.getState().session?.joinUrl || ''" | tr -d '"')
JOIN127=$(echo "$JOIN" | sed 's/localhost/127.0.0.1/')
TABLIST=$(ab tab)
DESK_TAB=$(echo "$TABLIST" | grep -oE '→ \[t[0-9]+\]' | grep -oE 't[0-9]+' | head -1)
ab wait 2000
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
ab eval "window.__beam.store.getState().downloadAll(); 'dl'"
for i in $(seq 1 15); do
  R=$(ab eval "JSON.stringify({r:window.__beam.getState().received.length, e:Object.values(window.__beam.getState().transfers).filter(t=>t.status==='error').length})")
  echo "$R" | grep -q '"r":1' && echo "$R" | grep -q '"e":0' && break
  sleep 2
done
echo "== phone received: $R (expect r:1 e:0)"
# phone uploads image → desktop received (thumbnails + save-to-folder UI)
ab eval "
(() => {
  const png = Uint8Array.from(atob('$PNG_B64'), c => c.charCodeAt(0));
  window.__beam.store.getState().addMobileFiles([new File([png], 'qa6-shot.png', {type:'image/png'})]);
  return 'up';
})()"
timeout 20 agent-browser tab "$DESK_TAB" > /dev/null 2>&1
ab wait 800
for i in $(seq 1 10); do
  RC=$(ab eval "window.__beam.getState().received.length")
  [ "$RC" = "1" ] && break
  sleep 2
done
echo "== desktop received: $RC"
echo "== received header: $(ab eval "document.querySelector('[aria-label=\"Received files\"] header')?.innerText.replace(/\\n/g,' | ')")"
echo "== save-to-folder btn: $(ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Save to folder')); return b ? 'present (not clicked — native picker)' : 'absent'; })()")"
echo "== fsapi supported: $(ab eval "typeof window.showDirectoryPicker")"

# ---------- 4) end session → terminal summary ----------
ab eval "void window.__beam.store.getState().endSession(); 'ending'"
ab wait 2500
for i in $(seq 1 8); do
  PH2=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$PH2" = "ended" ] && break
  sleep 1
done
echo "== phase: $PH2"
echo "== summary chip: $(ab eval "(document.body.innerText.match(/\\d+ files? · [^\\n]*moved/) || ['none'])[0]")"

# ---------- 5) history rows animated ----------
ab eval "document.querySelectorAll('nav button, header button').forEach(b => { if (b.textContent.trim().toLowerCase()==='history') b.click() }); 'nav'"
ab wait 1200
echo "== history rows: $(ab eval "(() => { const lis=[...document.querySelectorAll('main li')].filter(li=>li.className.includes('animate-row-in')); return lis.length })()")"

# ---------- 6) mobile emulation tab: FAB + scanner dialog ----------
ab wait 1500
timeout 30 agent-browser tab new about:blank > /dev/null 2>&1
ab wait 2000
timeout 20 agent-browser set device "iPhone 13" > /dev/null 2>&1
timeout 40 agent-browser open "http://127.0.0.1:81/" > /dev/null 2>&1
ab wait --load networkidle
ab wait 1500
echo "== fab visible: $(ab eval "(() => { const b=document.querySelector('[aria-label=\"Scan a desktop QR code to pair\"]'); return b ? 'yes w='+Math.round(b.getBoundingClientRect().width) : 'no' })()")"
ab eval "document.querySelector('[aria-label=\"Scan a desktop QR code to pair\"]')?.click(); 'fab-clicked'"
ab wait 2500
echo "== scanner dialog: $(ab eval "(() => { const d=document.querySelector('[role=\"dialog\"]'); if (!d) return 'no-dialog'; const t=d.innerText; return /Scan the desktop QR/.test(t) ? (t.includes('Searching for a QR') ? 'scanning' : t.includes('Starting camera') ? 'starting' : (t.includes('Camera') ? 'cam-state:' + t.slice(0,60) : 'opened')) : 'wrong-dialog' })()")"
ab eval "(() => { const b=[...document.querySelectorAll('[role=\"dialog\"] button')].find(x=>x.textContent.trim()==='Retry'); return b ? 'retry-present' : 'no-retry' })()"
ab eval "(() => { const b=[...document.querySelectorAll('[role=\"dialog\"] button')].find(x=>x.getAttribute('aria-label')==='Close' || x.textContent.trim()==='Close'); if (b) b.click(); return 'closed' })()"
ab wait 1000

# ---------- 7) invalid view scanner ----------
timeout 40 agent-browser open "http://127.0.0.1:81/?s=ZZZZZZ&t=badtoken123" > /dev/null 2>&1
ab wait 2500
for i in $(seq 1 8); do
  IV=$(ab eval "window.__beam.getState().phase" | tr -d '"')
  [ "$IV" = "invalid" ] && break
  sleep 1
done
echo "== invalid phase: $IV"
echo "== invalid scan btn: $(ab eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Scan a fresh QR')); return b ? 'present' : 'absent' })()")"
ab eval "[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Scan a fresh QR'))?.click(); 'clicked'"
ab wait 2000
echo "== invalid scanner dialog: $(ab eval "(() => { const d=document.querySelector('[role=\"dialog\"]'); return d ? (/Scan the desktop QR/.test(d.innerText) ? 'opened' : 'wrong') : 'none' })()")"

echo "== console errors:"; ab errors 2>&1 | tail -3
echo "== QA6 DONE"
