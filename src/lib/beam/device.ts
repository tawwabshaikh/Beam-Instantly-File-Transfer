import type { DeviceInfo } from './protocol'

/** Parse a friendly device description from the browser UA. */
export function getDeviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { platform: 'Unknown', browser: 'Browser', isMobile: false }
  }
  const ua = navigator.userAgent
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)

  let platform = 'Unknown'
  if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iPhone'
  else if (/Android/i.test(ua)) platform = 'Android'
  else if (/Mac/i.test(ua)) platform = 'Mac'
  else if (/Windows/i.test(ua)) platform = 'Windows'
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) platform = 'Linux'

  let browser = 'Browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet'
  else if (/OPR\//i.test(ua)) browser = 'Opera'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua)) browser = 'Safari'

  return { platform, browser, isMobile }
}

export function describeDevice(device: DeviceInfo | null): string {
  if (!device) return 'Unknown device'
  return `${device.platform} · ${device.browser}`
}
