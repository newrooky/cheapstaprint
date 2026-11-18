// Sample-accurate metronome using Web Audio look-ahead scheduling.

let ctx: AudioContext | null = null
export function audioCtx(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export class Metronome {
  bpm = 80
  perBeat = 2
  beats = 4
  /** play a soft tick on every subdivision, not just beats */
  subClicks = true
  private timer: number | undefined
  private next = 0
  private step = 0
  onTick: (step: number) => void = () => {}

  get running() {
    return this.timer !== undefined
  }

  start() {
    const c = audioCtx()
    this.stop()
    this.step = 0
    this.next = c.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.schedule()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private schedule() {
    const c = audioCtx()
    const stepDur = 60 / this.bpm / this.perBeat
    const total = this.perBeat * this.beats
    while (this.next < c.currentTime + 0.12) {
      const s = this.step % total
      const onBeat = s % this.perBeat === 0
      if (onBeat || this.subClicks) this.click(this.next, s === 0 ? 1600 : onBeat ? 1000 : 700, onBeat ? 0.5 : 0.15)
      const delay = Math.max(0, (this.next - c.currentTime) * 1000)
      window.setTimeout(() => this.onTick(s), delay)
      this.next += stepDur
      this.step++
    }
  }

  private click(t: number, freq: number, gain: number) {
    const c = audioCtx()
    const o = c.createOscillator()
    const g = c.createGain()
    o.frequency.value = freq
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    o.connect(g).connect(c.destination)
    o.start(t)
    o.stop(t + 0.06)
  }
}

/** Tap tempo: call on each tap, returns BPM once there are enough taps. */
export function makeTapTempo() {
  let taps: number[] = []
  return () => {
    const now = performance.now()
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = []
    taps.push(now)
    if (taps.length > 6) taps.shift()
    if (taps.length < 3) return null
    const gaps = taps.slice(1).map((t, i) => t - taps[i])
    return Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))
  }
}
