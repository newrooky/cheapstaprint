// Microphone pitch detection by autocorrelation.
import { audioCtx } from './metronome'

export const STANDARD = [
  { name: 'E', octave: 2, freq: 82.41 },
  { name: 'A', octave: 2, freq: 110.0 },
  { name: 'D', octave: 3, freq: 146.83 },
  { name: 'G', octave: 3, freq: 196.0 },
  { name: 'B', octave: 3, freq: 246.94 },
  { name: 'e', octave: 4, freq: 329.63 },
]
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  let rms = 0
  for (const v of buf) rms += v * v
  rms = Math.sqrt(rms / buf.length)
  if (rms < 0.01) return null

  // trim quiet edges
  let a = 0
  let b = buf.length - 1
  const thr = 0.2
  while (a < buf.length / 2 && Math.abs(buf[a]) < thr) a++
  while (b > buf.length / 2 && Math.abs(buf[b]) < thr) b--
  const x = buf.slice(a, b)
  const n = x.length
  if (n < 256) return null

  const c = new Float32Array(n)
  for (let lag = 0; lag < n; lag++) {
    let s = 0
    for (let i = 0; i < n - lag; i++) s += x[i] * x[i + lag]
    c[lag] = s
  }
  let d = 0
  while (d < n - 1 && c[d] > c[d + 1]) d++
  let best = -1
  let bestVal = -Infinity
  for (let i = d; i < n; i++) if (c[i] > bestVal) ((bestVal = c[i]), (best = i))
  if (best <= 0 || best >= n - 1) return null
  // parabolic interpolation
  const y1 = c[best - 1]
  const y2 = c[best]
  const y3 = c[best + 1]
  const shift = (y3 - y1) / (2 * (2 * y2 - y1 - y3))
  const f = sampleRate / (best + (Number.isFinite(shift) ? shift : 0))
  return f > 60 && f < 1200 ? f : null
}

export function describe(freq: number) {
  const midi = 69 + 12 * Math.log2(freq / 440)
  const nearest = Math.round(midi)
  const cents = Math.round((midi - nearest) * 100)
  const string = STANDARD.reduce((best, s) => (Math.abs(Math.log2(freq / s.freq)) < Math.abs(Math.log2(freq / best.freq)) ? s : best))
  const stringCents = Math.round(1200 * Math.log2(freq / string.freq))
  return { note: NAMES[nearest % 12], octave: Math.floor(nearest / 12) - 1, cents, string, stringCents }
}

export async function startTuner(onPitch: (f: number | null) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
  const c = audioCtx()
  const src = c.createMediaStreamSource(stream)
  const an = c.createAnalyser()
  an.fftSize = 4096
  src.connect(an)
  const buf = new Float32Array(an.fftSize)
  let raf = 0
  let last = 0
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop)
    if (t - last < 60) return
    last = t
    an.getFloatTimeDomainData(buf)
    onPitch(detectPitch(buf.subarray(0, 2048) as Float32Array, c.sampleRate))
  }
  raf = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(raf)
    src.disconnect()
    stream.getTracks().forEach((t) => t.stop())
  }
}
