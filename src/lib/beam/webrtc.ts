import { getIceServers } from './config'
import { LIMITS } from './protocol'

/** WebRTC plumbing used by the transfer engine. */

export const CHANNEL_D2P = 'beam-d2p' // host → guest file stream
export const CHANNEL_P2D = 'beam-p2d' // guest → host file stream

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: getIceServers(),
    iceCandidatePoolSize: 4,
  })
}

/** Resolve when the data channel is open (or throw on timeout / failure). */
export function waitUntilOpen(dc: RTCDataChannel, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (dc.readyState === 'open') return resolve()
    const to = setTimeout(() => {
      cleanup()
      reject(new Error('Data channel timed out'))
    }, timeoutMs)
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Data channel closed'))
    }
    const cleanup = () => {
      clearTimeout(to)
      dc.removeEventListener('open', onOpen)
      dc.removeEventListener('close', onClose)
      dc.removeEventListener('error', onClose)
    }
    dc.addEventListener('open', onOpen)
    dc.addEventListener('close', onClose)
    dc.addEventListener('error', onClose)
  })
}

/** Wait for the send buffer to drain below the low-water mark. */
export function waitForDrain(dc: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    if (dc.bufferedAmount <= LIMITS.BUFFER_LOW_WATER) return resolve()
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearInterval(poll)
      dc.removeEventListener('bufferedamountlow', done)
      resolve()
    }
    dc.bufferedAmountLowThreshold = LIMITS.BUFFER_LOW_WATER
    dc.addEventListener('bufferedamountlow', done)
    // Safety poll in case the event never fires (browser quirks)
    const poll = setInterval(() => {
      if (dc.readyState !== 'open') return done()
      if (dc.bufferedAmount <= LIMITS.BUFFER_LOW_WATER) done()
    }, 25)
  })
}
