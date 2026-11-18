import type { StrumPattern } from '../model/song'
import { countLabels } from '../data/strums'

/** One row per bar; cells shrink to fit so 16th-note bars fit a phone screen. */
export function StrumView({ pattern, active = -1 }: { pattern: StrumPattern; active?: number }) {
  const beatsPerBar = pattern.beats <= 4 ? pattern.beats : 4
  const barLen = pattern.perBeat * beatsPerBar
  const labels = countLabels(pattern.perBeat, beatsPerBar)
  const bars: number[][] = []
  for (let i = 0; i < pattern.strokes.length; i += barLen) bars.push(Array.from({ length: Math.min(barLen, pattern.strokes.length - i) }, (_, k) => i + k))

  return (
    <div className="space-y-2" aria-label={`Strum pattern ${pattern.name}`}>
      {bars.map((bar, bi) => (
        <div key={bi} className="grid gap-x-0.5 max-w-xl" style={{ gridTemplateColumns: `repeat(${barLen}, minmax(0, 1fr))` }}>
          {bar.map((i) => {
            const s = pattern.strokes[i]
            const pos = i % barLen
            const onBeat = pos % pattern.perBeat === 0
            const down = s.includes('D')
            const up = s.includes('U')
            const muted = s.startsWith('x')
            const accent = s.endsWith('>')
            return (
              <div
                key={i}
                className={`flex flex-col items-center rounded-md py-1 transition-colors ${i === active ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : onBeat ? 'bg-[var(--soft)]' : ''}`}
              >
                <span className={`text-xl sm:text-2xl leading-none ${s === '-' ? 'opacity-25' : ''} ${accent ? 'font-black' : ''}`} aria-label={down ? 'down' : up ? 'up' : 'rest'}>
                  {down ? (muted ? '⤓' : '↓') : up ? (muted ? '⤒' : '↑') : '·'}
                </span>
                <span className={`text-[11px] mt-1 ${onBeat ? 'font-bold' : 'opacity-60'}`}>{labels[pos]}</span>
              </div>
            )
          })}
        </div>
      ))}
      {pattern.strokes.some((s) => s.startsWith('x')) && <p className="text-xs text-[var(--muted)]">⤓ ⤒ = muted strum: rest your strumming hand on the strings for a "chk" sound.</p>}
    </div>
  )
}
