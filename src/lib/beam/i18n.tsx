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
