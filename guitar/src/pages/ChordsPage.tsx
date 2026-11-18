import { useEffect, useRef, useState } from 'react'
import { TopBar } from '../App'
import { ChordDiagram } from '../ui/ChordDiagram'
import { ChordSheet } from '../ui/ChordSheet'
import { loadChordDb, shapesFor } from '../theory/shapes'
import { updateSettings, useSettings } from '../lib/store'

const STAGES: { name: string; chords: string[] }[] = [
  { name: 'First chords', chords: ['Em', 'E', 'Am', 'A', 'D', 'G', 'C'] },
  { name: 'Next up', chords: ['Dm', 'E7', 'A7', 'D7', 'G7', 'C7', 'Em7', 'Am7'] },
  { name: 'Pretty and easy', chords: ['Cadd9', 'Dsus4', 'Dsus2', 'Asus2', 'Asus4', 'Fmaj7', 'Dmaj7', 'Amaj7'] },
  { name: 'Barre chords', chords: ['F', 'Bm', 'B7', 'F#m', 'Bb', 'C#m', 'Gm', 'Cm'] },
]

export function ChordsPage() {
  const settings = useSettings()
  const [, setReady] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => void loadChordDb().then(() => setReady(true)), [])

  return (
    <div className="min-h-screen pb-16">
      <TopBar title="My chords" />
      <main className="max-w-3xl mx-auto px-4">
        <p className="text-sm text-[var(--muted)] mt-4">
          Tap a chord and mark it "I can play this". Songs then flag the chords you haven't learned, and the Easier button can swap them.
        </p>
        <Trainer />
        {STAGES.map((st) => (
          <section key={st.name} className="mt-6">
            <h2 className="font-semibold mb-2">{st.name}</h2>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1">
              {st.chords.map((c) => {
                const known = settings.known.includes(c)
                const learning = settings.learning.includes(c)
                return (
                  <button key={c} onClick={() => setOpen(c)} className={`relative rounded-xl p-1 ${known ? 'bg-[var(--hl)]' : 'hover:bg-[var(--soft)]'}`}>
                    <ChordDiagram shape={shapesFor(c)[0]} name={c} width={70} leftHanded={settings.leftHanded} showFingers={false} />
                    {known && <span className="absolute top-1 right-1.5 text-xs text-green-600">✓</span>}
                    {learning && <span className="absolute top-1 right-1.5 text-[10px] text-[var(--accent)]">learning</span>}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </main>
      <ChordSheet name={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Trainer() {
  const settings = useSettings()
  const pool = [...new Set([...settings.learning, ...settings.known, 'G', 'C', 'D', 'Em', 'Am'])]
  const [a, setA] = useState(pool[0])
  const [b, setB] = useState(pool[1])
  const [left, setLeft] = useState(0)
  const [count, setCount] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const key = [a, b].sort().join('|')
  const best = settings.trainerBest[key] ?? 0
  const running = left > 0

  useEffect(() => () => clearInterval(timer.current), [])
  const start = () => {
    setCount(0)
    setLeft(60)
    clearInterval(timer.current)
    timer.current = window.setInterval(() => setLeft((l) => (l <= 1 ? (clearInterval(timer.current), 0) : l - 1)), 1000)
  }
  useEffect(() => {
    if (left === 0 && count > 0 && count > best) updateSettings((s) => ({ trainerBest: { ...s.trainerBest, [key]: count } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  return (
    <section className="card p-4 mt-5">
      <h2 className="font-semibold">One-minute changes</h2>
      <p className="text-sm text-[var(--muted)]">Switch between two chords for a minute. Tap the big button every time you land the new chord. Aim for 30+.</p>
      <div className="flex items-center gap-2 mt-3">
        <select className="input !w-auto" value={a} onChange={(e) => setA(e.target.value)} disabled={running} aria-label="First chord">
          {pool.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span>↔</span>
        <select className="input !w-auto" value={b} onChange={(e) => setB(e.target.value)} disabled={running} aria-label="Second chord">
          {pool.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="text-sm text-[var(--muted)] ml-auto">Best: {best}</span>
      </div>
      <div className="flex justify-center gap-6 mt-4">
        <ChordDiagram shape={shapesFor(a)[0]} name={a} width={90} leftHanded={settings.leftHanded} dim={running && count % 2 === 1} />
        <ChordDiagram shape={shapesFor(b)[0]} name={b} width={90} leftHanded={settings.leftHanded} dim={running && count % 2 === 0} />
      </div>
      {running ? (
        <button className="btn-primary w-full mt-4 h-20 text-2xl" onClick={() => setCount((c) => c + 1)}>
          {count} · {left}s
        </button>
      ) : (
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-primary flex-1" onClick={start} disabled={a === b}>Start 60 seconds</button>
          {count > 0 && <span className="font-semibold">{count} changes{count >= best ? ' 🎉 new best' : ''}</span>}
        </div>
      )}
    </section>
  )
}
