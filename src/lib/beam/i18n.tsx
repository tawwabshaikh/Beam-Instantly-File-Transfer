'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Beam i18n skeleton — a tiny dictionary layer for the most visible UI.
 *
 * Why not next-intl: Beam is a single-route, fully client-side app with
 * client-side view switching. A ~100-line reactive module gives us typed
 * dictionaries, localStorage persistence, navigator.language detection and
 * cross-tab sync without touching routing/SSR — zero risk to the transfer
 * pipeline. Full-string coverage can migrate onto this same API later.
 *
 * Hydration-safe: useSyncExternalStore renders the server snapshot ('en')
 * during hydration, then flips to the persisted language right after mount.
 */

export type Lang = 'en' | 'hi'

const STORAGE_KEY = 'beam.lang.v1'
const SUPPORTED: Lang[] = ['en', 'hi']

const en = {
  'skip.content': 'Skip to content',

  'nav.transfer': 'Transfer',
  'nav.history': 'History',
  'nav.about': 'About',

  'lang.aria': 'Change language',

  'hero.badge': 'Encrypted · Temporary sessions · No sign-up',
  'hero.title': 'Move files between devices.',
  'hero.shimmer': 'Instantly.',
  'hero.sub': 'Scan once. Transfer securely. No cables. No apps.',
  'hero.subEm': 'No shared Wi-Fi required.',
  'hero.cta': 'Start Transfer',
  'hero.how': 'How it works',
  'hero.fine': 'Desktop ⇄ Phone · Works across different networks · Files never touch our servers',

  'band.title': 'Different networks? No problem.',
  'band.sub': 'Wi-Fi on one side, mobile data on the other — Beam picks the best available route between your devices, automatically.',
  'band.a': 'Wi-Fi',
  'band.b': 'Internet',
  'band.c': 'Mobile data',

  'steps.title': 'Three steps. That’s it.',
  'steps.sub': 'From file pick-up to transfer in under ten seconds.',
  'steps.s1.title': 'Select',
  'steps.s1.body': 'Choose a file on your desktop — drag, drop, or paste. Images, videos, PDFs, archives, anything.',
  'steps.s2.title': 'Scan',
  'steps.s2.body': 'Point your phone’s camera at the QR code. Your browser opens instantly — no app install.',
  'steps.s3.title': 'Transfer',
  'steps.s3.body': 'Download files to your phone, or send files back to the desktop. Both directions, one session.',

  'features.title': 'Built for real-world transfers',
  'features.f1.title': 'Fast transfers',
  'features.f1.body': 'Direct device-to-device channels when possible — the file takes the shortest path.',
  'features.f2.title': 'Phone ⇄ Desktop',
  'features.f2.body': 'Send in both directions. Photos from your phone land on the desktop in one tap.',
  'features.f3.title': 'QR pairing',
  'features.f3.body': 'Your phone camera is the scanner. Every session gets a unique, one-time code.',
  'features.f4.title': 'Any network',
  'features.f4.body': 'Wi-Fi on one side, 5G on the other? Different countries? It still just works.',
  'features.f5.title': 'Secure by design',
  'features.f5.body': 'Cryptographic pairing tokens, {ttl}-minute expiry, encryption in transit, zero storage.',
  'features.f6.title': 'Large files',
  'features.f6.body': 'Chunked streaming keeps memory flat — videos and archives up to 2 GB each.',

  'tip.title': 'Your phone doesn’t need the same Wi-Fi.',
  'tip.body': 'Mobile data, another network, another country — the QR link works anywhere the internet reaches.',

  'fab.scan': 'Scan QR',
  'fab.aria': 'Scan a desktop QR code to pair',

  'footer.tag': 'Instant file transfer',
  'footer.safe': 'Encrypted in transit · Sessions expire automatically · No files stored on our servers',

  /* ---- history view ---- */
  'hist.title': 'Transfer history',
  'hist.sub': 'Stored only in this browser — never on our servers. File contents are not kept.',
  'hist.exportCsv': 'Export CSV',
  'hist.exportCsvAria': 'Export {n} history entries as CSV',
  'hist.clear': 'Clear history',
  'hist.stat.transfers': 'Transfers',
  'hist.stat.data': 'Data moved',
  'hist.stat.success': 'Success rate',
  'hist.search.placeholder': 'Search file names or session codes…',
  'hist.search.aria': 'Search history',
  'hist.search.clear': 'Clear search',
  'hist.filter.direction': 'Direction',
  'hist.filter.status': 'Status',
  'hist.filter.all': 'All',
  'hist.filter.toPhone': 'To phone',
  'hist.filter.toDesktop': 'To desktop',
  'hist.filter.done': 'Done',
  'hist.filter.failed': 'Failed',
  'hist.aria.byDirection': 'Filter by direction',
  'hist.aria.byStatus': 'Filter by status',
  'hist.noMatch.title': 'No transfers match',
  'hist.noMatch.sub': 'Try a different search or reset the filters.',
  'hist.reset': 'Reset filters',
  'hist.showing': 'Showing {shown} of {total} transfers',
  'hist.dir.d2p': 'Desktop → Phone',
  'hist.dir.p2d': 'Phone → Desktop',
  'hist.status.completed': 'Completed',
  'hist.status.failed': 'Failed',
  'hist.session': 'session {code}',
  'hist.empty.title': 'No transfers yet',
  'hist.empty.sub': 'Completed transfers from this device will show up here — with direction, size, and status.',

  /* ---- notes panel ---- */
  'notes.title': 'Notes',
  'notes.aria': 'Notes',
  'notes.badge': 'never stored · device to device',
  'notes.empty.connected': 'Send a link, a Wi-Fi password, a code snippet — it lands on the other device instantly.',
  'notes.empty.locked': 'Text notes unlock once both devices are paired.',
  'notes.listAria': 'Notes conversation',
  'notes.placeholder.connected': 'Type a note… (Enter to send)',
  'notes.placeholder.locked': 'Available once paired',
  'notes.inputAria': 'Note text',
  'notes.hint': 'Shift+Enter for a new line',
  'notes.send': 'Send',
  'notes.copyHint': 'Click to copy',
  'notes.you': 'You',
  'notes.other': 'Other device',

  /* ---- mobile session ---- */
  'mob.footer.safe': 'Encrypted session · Files go device-to-device',
  'mob.sound.on': 'Turn sound on',
  'mob.sound.off': 'Turn sound off',
  'mob.opening.title': 'Opening session…',
  'mob.opening.sub': 'Validating your secure pairing link',
  'mob.connecting.title': 'Connecting…',
  'mob.connecting.relay': 'Routing through secure relay…',
  'mob.connecting.direct': 'Establishing a secure channel to your desktop',
  'mob.connecting.s1': 'Link verified',
  'mob.connecting.s2': 'Pairing with desktop',
  'mob.connecting.s3': 'Securing transfer channel',
  'mob.banner.title': 'Connected to Desktop',
  'mob.banner.ready': 'Your computer is ready to exchange files',
  'mob.banner.waiting': 'Waiting for the computer to appear…',
  'mob.banner.aria': 'Connection status: connected',
  'mob.from.title': 'From desktop',
  'mob.from.downloadAll': 'Download All',
  'mob.from.empty.title': 'No files yet',
  'mob.from.empty.peer': 'The desktop hasn’t added any files. Use the send section below to push files to it.',
  'mob.from.empty.nopeer': 'Keep this page open — it will connect automatically.',
  'mob.row.shareAria': 'Share or re-save {name}',
  'mob.row.saved': 'Saved',
  'mob.row.retry': 'Retry',
  'mob.row.download': 'Download',
  'mob.row.busy': 'Busy…',
  'mob.row.failed': 'Download failed',
  'mob.batch.downloading': 'Downloading {current} of {total}',
  'mob.batch.done': '{done} of {total} downloaded',
  'mob.send.title': 'Send files to desktop',
  'mob.send.sub': 'Photos, videos, voice notes — they land on your computer',
  'mob.send.select': 'Select Files',
  'mob.send.camera': 'Camera',
  'mob.send.optimize': 'Optimize photos',
  'mob.send.optimizeSub': 'Shrinks large photos before sending — faster on mobile data',
  'mob.send.optimizeAria': 'Optimize photos before sending',
  'mob.preset.original': 'Original',
  'mob.preset.balanced': 'Balanced',
  'mob.preset.compact': 'Compact',
  'mob.preset.sub.original': 'Sends photos exactly as they are',
  'mob.preset.sub.balanced': 'Shrinks large photos before sending — faster on mobile data',
  'mob.preset.sub.compact': 'Smallest size — great for sharing and slow networks',
  'mob.send.delivered': 'Delivered to desktop',
  'mob.send.queued': 'Queued…',
  'mob.send.optimized': 'optimized',
  'mob.send.uploading': 'Uploading to desktop…',
  'mob.send.stopAria': 'Stop sending {name}',
  'mob.relay.notice': 'Direct connection wasn’t possible — transfers are relaying through Beam’s secure server. Everything stays encrypted.',
  'mob.lost.title': 'Connection lost',
  'mob.lost.fallback': 'The connection to your desktop dropped.',
  'mob.lost.reconnect': 'Reconnect',
  'mob.lost.note': 'The QR code on your desktop is still valid.',
  'mob.expired.title': 'Session expired',
  'mob.expired.body': 'This pairing session expired after {ttl} minutes. Ask the desktop for a fresh QR code.',
  'mob.invalid.titleFallback': 'Invalid or expired link',
  'mob.invalid.bodyFallback': 'This QR link is no longer valid. Scan a fresh code from the desktop.',
  'mob.invalid.scanFresh': 'Scan a fresh QR code',
  'mob.invalid.placeholder': 'Paste pairing link or CODE-KEY',
  'mob.invalid.inputAria': 'Pairing link or manual code',
  'mob.invalid.tryKey': 'Try pairing key',
  'mob.ended.title': 'Session ended',
  'mob.ended.body': 'The desktop closed this transfer session.',
  'mob.failed.titleFallback': 'Something went wrong',
  'mob.failed.bodyFallback': 'An unexpected error occurred.',
  'mob.failed.retry': 'Try again',
  'mob.startOver': 'Go to Beam home',
  'mob.summary.one': '{n} file · {bytes} moved',
  'mob.summary.many': '{n} files · {bytes} moved',
}

export type Dict = typeof en

const hi: Dict = {
  'skip.content': 'सामग्री पर जाएँ',

  'nav.transfer': 'ट्रांसफ़र',
  'nav.history': 'इतिहास',
  'nav.about': 'परिचय',

  'lang.aria': 'भाषा बदलें',

  'hero.badge': 'एन्क्रिप्टेड · अस्थायी सेशन · साइन-अप नहीं',
  'hero.title': 'डिवाइस के बीच फ़ाइलें भेजें।',
  'hero.shimmer': 'तुरंत।',
  'hero.sub': 'एक बार स्कैन करें। सुरक्षित ट्रांसफ़र। न केबल, न ऐप।',
  'hero.subEm': 'वही वाई-फ़ाई ज़रूरी नहीं।',
  'hero.cta': 'ट्रांसफ़र शुरू करें',
  'hero.how': 'यह कैसे काम करता है',
  'hero.fine': 'डेस्कटॉप ⇄ फ़ोन · अलग-अलग नेटवर्क पर भी काम करता है · फ़ाइलें कभी हमारे सर्वर पर नहीं रहतीं',

  'band.title': 'अलग नेटवर्क? कोई दिक्कत नहीं।',
  'band.sub': 'एक तरफ़ वाई-फ़ाई, दूसरी तरफ़ मोबाइल डेटा — Beam आपके डिवाइस के बीच सबसे अच्छा उपलब्ध रास्ता अपने आप चुनता है।',
  'band.a': 'वाई-फ़ाई',
  'band.b': 'इंटरनेट',
  'band.c': 'मोबाइल डेटा',

  'steps.title': 'तीन चरण। बस इतना ही।',
  'steps.sub': 'फ़ाइल चुनने से ट्रांसफ़र तक — दस सेकंड से भी कम में।',
  'steps.s1.title': 'चुनें',
  'steps.s1.body': 'अपने डेस्कटॉप पर फ़ाइल चुनें — ड्रैग करें, ड्रॉप करें या पेस्ट करें। तस्वीरें, वीडियो, PDF, आर्काइव — कुछ भी।',
  'steps.s2.title': 'स्कैन करें',
  'steps.s2.body': 'फ़ोन के कैमरे से QR कोड को देखें। ब्राउज़र तुरंत खुल जाता है — ऐप इंस्टॉल करने की ज़रूरत नहीं।',
  'steps.s3.title': 'भेजें',
  'steps.s3.body': 'फ़ाइलें फ़ोन पर डाउनलोड करें या डेस्कटॉप पर वापस भेजें। दोनों दिशाएँ, एक ही सेशन में।',

  'features.title': 'असली दुनिया के ट्रांसफ़र के लिए बनाया गया',
  'features.f1.title': 'तेज़ ट्रांसफ़र',
  'features.f1.body': 'जहाँ संभव हो, सीधा डिवाइस-से-डिवाइस चैनल — फ़ाइल सबसे छोटे रास्ते से जाती है।',
  'features.f2.title': 'फ़ोन ⇄ डेस्कटॉप',
  'features.f2.body': 'दोनों दिशाओं में भेजें। फ़ोन की फ़ोटो एक टैप में डेस्कटॉप पर पहुँच जाती है।',
  'features.f3.title': 'QR पेयरिंग',
  'features.f3.body': 'आपका फ़ोन कैमरा ही स्कैनर है। हर सेशन का अपना वन-टाइम कोड होता है।',
  'features.f4.title': 'कोई भी नेटवर्क',
  'features.f4.body': 'एक तरफ़ वाई-फ़ाई, दूसरी पर 5G? अलग देश? फिर भी बस काम करता है।',
  'features.f5.body': 'क्रिप्टोग्राफ़िक पेयरिंग टोकन, {ttl}-मिनट की समाप्ति, ट्रांज़िट में एन्क्रिप्शन, ज़ीरो स्टोरेज।',
  'features.f5.title': 'सुरक्षा सबसे पहले',
  'features.f6.title': 'बड़ी फ़ाइलें',
  'features.f6.body': 'चंक्ड स्ट्रीमिंग से मेमोरी सपाट रहती है — 2 GB तक की वीडियो और आर्काइव।',

  'tip.title': 'फ़ोन को वही वाई-फ़ाई चाहिए ही नहीं।',
  'tip.body': 'मोबाइल डेटा, कोई और नेटवर्क या कोई और देश — QR लिंक इंटरनेट जहाँ तक पहुँचता है, वहाँ कहीं भी काम करता है।',

  'fab.scan': 'QR स्कैन करें',
  'fab.aria': 'पेयर करने के लिए डेस्कटॉप का QR कोड स्कैन करें',

  'footer.tag': 'तुरंत फ़ाइल ट्रांसफ़र',
  'footer.safe': 'ट्रांज़िट में एन्क्रिप्टेड · सेशन अपने आप समाप्त · हमारे सर्वर पर कोई फ़ाइल नहीं रहती',

  'hist.title': 'ट्रांसफ़र इतिहास',
  'hist.sub': 'सिर्फ़ इसी ब्राउज़र में सुरक्षित — कभी हमारे सर्वर पर नहीं। फ़ाइल की सामग्री नहीं रखी जाती।',
  'hist.exportCsv': 'CSV निर्यात करें',
  'hist.exportCsvAria': '{n} इतिहास प्रविष्टियाँ CSV के रूप में निर्यात करें',
  'hist.clear': 'इतिहास साफ़ करें',
  'hist.stat.transfers': 'ट्रांसफ़र',
  'hist.stat.data': 'भेजा गया डेटा',
  'hist.stat.success': 'सफलता दर',
  'hist.search.placeholder': 'फ़ाइल नाम या सेशन कोड खोजें…',
  'hist.search.aria': 'इतिहास खोजें',
  'hist.search.clear': 'खोज साफ़ करें',
  'hist.filter.direction': 'दिशा',
  'hist.filter.status': 'स्थिति',
  'hist.filter.all': 'सभी',
  'hist.filter.toPhone': 'फ़ोन को',
  'hist.filter.toDesktop': 'डेस्कटॉप को',
  'hist.filter.done': 'पूर्ण',
  'hist.filter.failed': 'विफल',
  'hist.aria.byDirection': 'दिशा के अनुसार फ़िल्टर करें',
  'hist.aria.byStatus': 'स्थिति के अनुसार फ़िल्टर करें',
  'hist.noMatch.title': 'कोई ट्रांसफ़र मेल नहीं खाता',
  'hist.noMatch.sub': 'कोई और खोज आज़माएँ या फ़िल्टर रीसेट करें।',
  'hist.reset': 'फ़िल्टर रीसेट करें',
  'hist.showing': '{total} में से {shown} ट्रांसफ़र दिखाए जा रहे हैं',
  'hist.dir.d2p': 'डेस्कटॉप → फ़ोन',
  'hist.dir.p2d': 'फ़ोन → डेस्कटॉप',
  'hist.status.completed': 'पूर्ण',
  'hist.status.failed': 'विफल',
  'hist.session': 'सेशन {code}',
  'hist.empty.title': 'अभी कोई ट्रांसफ़र नहीं',
  'hist.empty.sub': 'इस डिवाइस से हुए पूर्ण ट्रांसफ़र यहाँ दिखेंगे — दिशा, आकार और स्थिति के साथ।',

  'notes.title': 'नोट्स',
  'notes.aria': 'नोट्स',
  'notes.badge': 'कभी सेव नहीं · डिवाइस से डिवाइस',
  'notes.empty.connected': 'कोई लिंक, वाई-फ़ाई पासवर्ड या कोड स्निपेट भेजें — यह तुरंत दूसरे डिवाइस पर पहुँच जाएगा।',
  'notes.empty.locked': 'दोनों डिवाइस पेयर होने पर टेक्स्ट नोट्स चालू हो जाते हैं।',
  'notes.listAria': 'नोट्स बातचीत',
  'notes.placeholder.connected': 'नोट लिखें… (भेजने के लिए Enter)',
  'notes.placeholder.locked': 'पेयर होने पर उपलब्ध',
  'notes.inputAria': 'नोट टेक्स्ट',
  'notes.hint': 'नई लाइन के लिए Shift+Enter',
  'notes.send': 'भेजें',
  'notes.copyHint': 'कॉपी करने के लिए क्लिक करें',
  'notes.you': 'आप',
  'notes.other': 'दूसरा डिवाइस',

  'mob.footer.safe': 'एन्क्रिप्टेड सेशन · फ़ाइलें डिवाइस-से-डिवाइस',
  'mob.sound.on': 'ध्वनि चालू करें',
  'mob.sound.off': 'ध्वनि बंद करें',
  'mob.opening.title': 'सेशन खोल रहे हैं…',
  'mob.opening.sub': 'आपका सुरक्षित पेयरिंग लिंक जाँचा जा रहा है',
  'mob.connecting.title': 'कनेक्ट हो रहे हैं…',
  'mob.connecting.relay': 'सुरक्षित रिले से रूट हो रहा है…',
  'mob.connecting.direct': 'डेस्कटॉप से सुरक्षित चैनल बनाया जा रहा है',
  'mob.connecting.s1': 'लिंक सत्यापित',
  'mob.connecting.s2': 'डेस्कटॉप से पेयरिंग',
  'mob.connecting.s3': 'ट्रांसफ़र चैनल सुरक्षित किया जा रहा है',
  'mob.banner.title': 'डेस्कटॉप से कनेक्टेड',
  'mob.banner.ready': 'आपका कंप्यूटर फ़ाइल एक्सचेंज के लिए तैयार है',
  'mob.banner.waiting': 'कंप्यूटर के जुड़ने का इंतज़ार…',
  'mob.banner.aria': 'कनेक्शन स्थिति: कनेक्टेड',
  'mob.from.title': 'डेस्कटॉप से',
  'mob.from.downloadAll': 'सब डाउनलोड करें',
  'mob.from.empty.title': 'अभी कोई फ़ाइल नहीं',
  'mob.from.empty.peer': 'डेस्कटॉप पर अभी कोई फ़ाइल नहीं जोड़ी गई। नीचे वाले सेक्शन से उसे फ़ाइलें भेजें।',
  'mob.from.empty.nopeer': 'इस पेज को खुला रखें — यह अपने आप कनेक्ट हो जाएगा।',
  'mob.row.shareAria': '{name} शेयर करें या फिर से सेव करें',
  'mob.row.saved': 'सेव हो गया',
  'mob.row.retry': 'फिर कोशिश करें',
  'mob.row.download': 'डाउनलोड',
  'mob.row.busy': 'व्यस्त…',
  'mob.row.failed': 'डाउनलोड विफल',
  'mob.batch.downloading': '{total} में से {current} डाउनलोड हो रही हैं',
  'mob.batch.done': '{total} में से {done} डाउनलोड हो गईं',
  'mob.send.title': 'डेस्कटॉप को फ़ाइलें भेजें',
  'mob.send.sub': 'तस्वीरें, वीडियो, वॉयस नोट्स — सब आपके कंप्यूटर पर पहुँच जाते हैं',
  'mob.send.select': 'फ़ाइलें चुनें',
  'mob.send.camera': 'कैमरा',
  'mob.send.optimize': 'फ़ोटो ऑप्टिमाइज़ करें',
  'mob.send.optimizeSub': 'भेजने से पहले बड़ी फ़ोटो छोटी करता है — मोबाइल डेटा पर तेज़',
  'mob.send.optimizeAria': 'भेजने से पहले फ़ोटो ऑप्टिमाइज़ करें',
  'mob.preset.original': 'मूल',
  'mob.preset.balanced': 'संतुलित',
  'mob.preset.compact': 'कॉम्पैक्ट',
  'mob.preset.sub.original': 'फ़ोटो जैसी हैं वैसी ही भेजता है',
  'mob.preset.sub.balanced': 'भेजने से पहले बड़ी फ़ोटो छोटी करता है — मोबाइल डेटा पर तेज़',
  'mob.preset.sub.compact': 'सबसे छोटा आकार — शेयरिंग और धीमे नेटवर्क के लिए बढ़िया',
  'mob.send.delivered': 'डेस्कटॉप पर पहुँच गई',
  'mob.send.queued': 'क़तार में…',
  'mob.send.optimized': 'ऑप्टिमाइज़्ड',
  'mob.send.uploading': 'डेस्कटॉप पर अपलोड हो रहा है…',
  'mob.send.stopAria': '{name} भेजना रोकें',
  'mob.relay.notice': 'सीधा कनेक्शन संभव नहीं था — ट्रांसफ़र Beam के सुरक्षित सर्वर से रिले हो रहे हैं। सब कुछ एन्क्रिप्टेड रहता है।',
  'mob.lost.title': 'कनेक्शन टूट गया',
  'mob.lost.fallback': 'डेस्कटॉप से कनेक्शन बीच में टूट गया।',
  'mob.lost.reconnect': 'दोबारा जुड़ें',
  'mob.lost.note': 'डेस्कटॉप पर बना QR कोड अभी भी वैध है।',
  'mob.expired.title': 'सेशन समाप्त हो गया',
  'mob.expired.body': 'यह पेयरिंग सेशन {ttl} मिनट बाद समाप्त हो गया। डेस्कटॉप से नया QR कोड लें।',
  'mob.invalid.titleFallback': 'अवैध या समाप्त लिंक',
  'mob.invalid.bodyFallback': 'यह QR लिंक अब काम नहीं करता। डेस्कटॉप से नया कोड स्कैन करें।',
  'mob.invalid.scanFresh': 'नया QR कोड स्कैन करें',
  'mob.invalid.placeholder': 'पेयरिंग लिंक या CODE-KEY पेस्ट करें',
  'mob.invalid.inputAria': 'पेयरिंग लिंक या मैन्युअल कोड',
  'mob.invalid.tryKey': 'पेयरिंग की आज़माएँ',
  'mob.ended.title': 'सेशन बंद कर दिया गया',
  'mob.ended.body': 'डेस्कटॉप ने यह ट्रांसफ़र सेशन बंद कर दिया।',
  'mob.failed.titleFallback': 'कुछ गड़बड़ हो गई',
  'mob.failed.bodyFallback': 'अनपेक्षित त्रुटि आई।',
  'mob.failed.retry': 'फिर कोशिश करें',
  'mob.startOver': 'Beam होम पर जाएँ',
  'mob.summary.one': '{n} फ़ाइल · {bytes} भेजी गई',
  'mob.summary.many': '{n} फ़ाइलें · {bytes} भेजी गईं',
}

const DICTS: Record<Lang, Dict> = { en, hi }

/* ------------------------------------------------------------------ */
/* Reactive language store (module-level, cross-tab synced)            */
/* ------------------------------------------------------------------ */

let cached: Lang | null = null
const listeners = new Set<() => void>()

function detectInitial(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && (SUPPORTED as string[]).includes(stored)) return stored as Lang
  } catch {
    // storage unavailable — fall through
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('hi')) return 'hi'
  return 'en'
}

function ensure(): Lang {
  if (cached === null) cached = detectInitial()
  return cached
}

export function getLang(): Lang {
  return ensure()
}

export function setLang(lang: Lang) {
  if (lang === ensure()) return
  cached = lang
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // non-fatal
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'hi' ? 'hi' : 'en'
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue && (SUPPORTED as string[]).includes(e.newValue)) {
      const next = e.newValue as Lang
      if (next !== cached) {
        cached = next
        listeners.forEach((l) => l())
      }
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** Apply the persisted language to <html lang> once on boot. */
export function initDocumentLang() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = ensure() === 'hi' ? 'hi' : 'en'
}

/* ------------------------------------------------------------------ */
/* Translation lookup + hook                                           */
/* ------------------------------------------------------------------ */

function lookup(lang: Lang, key: string): string {
  const dict = DICTS[lang] ?? DICTS.en
  return (dict as Record<string, string>)[key] ?? (DICTS.en as Record<string, string>)[key] ?? key
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: Translator } {
  const lang = useSyncExternalStore(
    subscribe,
    getLang,
    () => 'en' as Lang, // server + hydration snapshot
  )
  const t = useMemo<Translator>(
    () => (key, vars) => {
      let out = lookup(lang, key)
      if (vars) {
        for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
      }
      return out
    },
    [lang],
  )
  const set = useCallback((l: Lang) => setLang(l), [])
  return { lang, setLang: set, t }
}
