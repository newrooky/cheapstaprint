import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../App'
import { describe, STANDARD, startTuner } from '../audio/tuner'

export function TunerPage() {
  const [on, setOn] = useState(false)
  const [freq, setFreq] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const stop = useRef<(() => void) | null>(null)
  const smooth = useRef<number | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const start = async () => {
    setErr(null)
    try {
      stop.current = await startTuner((f) => {
        if (f === null) return
        // ignore octave jumps and smooth the needle
        const prev = smooth.current
        smooth.current = prev && Math.abs(Math.log2(f / prev)) < 0.08 ? prev * 0.7 + f * 0.3 : f
        setFreq(smooth.current)
      })
      setOn(true)
    } catch {
      setErr('Microphone access was blocked. Allow it in your browser settings and try again.')
    }
  }

  const d = freq ? describe(freq) : null
  const cents = d ? Math.max(-50, Math.min(50, d.stringCents)) : 0
  const inTune = d && Math.abs(d.stringCents) <= 5
  return (
    <div className="min-h-screen">
      <TopBar title="Tuner" />
      <main className="max-w-md mx-auto px-4 py-8 text-center">
        {!on ? (
          <>
            <p className="text-[var(--muted)] mb-4">Play one string at a time. The tuner listens through your microphone.</p>
            <button className="btn-primary text-base px-6" onClick={start}>Start tuner</button>
            {err && <p className="text-sm text-[var(--warn)] mt-3">{err}</p>}
          </>
        ) : (
          <>
            <div className={`text-8xl font-bold tabular-nums ${inTune ? 'text-green-500' : ''}`}>{d ? d.string.name : '–'}</div>
            <div className="text-[var(--muted)] mt-1 h-6">{d ? `${freq!.toFixed(1)} Hz · ${d.stringCents > 0 ? '+' : ''}${d.stringCents} cents` : 'Listening…'}</div>
            <div className="relative h-16 mt-6 rounded-xl bg-[var(--soft)] overflow-hidden" aria-label="Tuning needle">
              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-green-500" />
              <div className="absolute inset-y-2 w-1.5 rounded-full bg-[var(--accent)] transition-[left] duration-100" style={{ left: `calc(${50 + cents}% - 3px)` }} />
              <span className="absolute left-2 top-1 text-xs text-[var(--muted)]">flat</span>
              <span className="absolute right-2 top-1 text-xs text-[var(--muted)]">sharp</span>
            </div>
            <p className="mt-4 font-medium h-6">{d ? (inTune ? 'In tune' : d.stringCents < 0 ? 'Tighten (tune up)' : 'Loosen (tune down)') : ''}</p>
            <div className="flex justify-center gap-2 mt-8">
              {STANDARD.map((s) => (
                <span key={s.name} className={`size-11 grid place-items-center rounded-full border ${d?.string.name === s.name ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-transparent' : 'border-[var(--line)]'}`}>{s.name}</span>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)] mt-3">Standard tuning, thickest string first</p>
          </>
        )}
      </main>
    </div>
  )
}
