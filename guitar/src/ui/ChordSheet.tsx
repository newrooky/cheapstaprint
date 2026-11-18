import { useState } from 'react'
import { ChordDiagram } from './ChordDiagram'
import { Sheet } from './Sheet'
import { shapesFor } from '../theory/shapes'
import { substitutes } from '../theory/simplify'
import { updateSettings, useSettings } from '../lib/store'
import type { Shape } from '../model/song'

/** Big diagram, other voicings, easier stand-ins and the "I can play this" toggle. */
export function ChordSheet({ name, authorShape, onClose }: { name: string | null; authorShape?: Shape; onClose: () => void }) {
  const settings = useSettings()
  const [i, setI] = useState(0)
  if (!name) return null
  const voicings = [...(authorShape ? [authorShape] : []), ...shapesFor(name)]
  const v = voicings[Math.min(i, voicings.length - 1)]
  const known = settings.known.includes(name)
  const learning = settings.learning.includes(name)
  const subs = substitutes(name)
  const toggle = (list: 'known' | 'learning') =>
    updateSettings((s) => {
      const other = list === 'known' ? 'learning' : 'known'
      const has = s[list].includes(name)
      return { [list]: has ? s[list].filter((c) => c !== name) : [...s[list], name], [other]: s[other].filter((c) => c !== name) }
    })

  return (
    <Sheet open onClose={() => (setI(0), onClose())} title={name}>
      <div className="flex items-center justify-center gap-4">
        <button className="btn-ghost text-2xl" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous voicing">‹</button>
        <ChordDiagram shape={v} width={180} leftHanded={settings.leftHanded} />
        <button className="btn-ghost text-2xl" disabled={i >= voicings.length - 1} onClick={() => setI(i + 1)} aria-label="Next voicing">›</button>
      </div>
      <p className="text-center text-sm text-[var(--muted)] mt-1">
        {voicings.length ? `Shape ${Math.min(i, voicings.length - 1) + 1} of ${voicings.length}${i === 0 && authorShape ? ' (the one this tab uses)' : ''}` : 'No diagram for this chord yet.'}
      </p>
      <div className="flex gap-2 justify-center mt-4">
        <button className={known ? 'btn-primary' : 'btn'} onClick={() => toggle('known')}>{known ? '✓ I can play this' : 'I can play this'}</button>
        <button className={learning ? 'btn-primary' : 'btn'} onClick={() => toggle('learning')}>{learning ? '✓ Learning' : 'Learning'}</button>
      </div>
      {subs.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Easier stand-ins</h3>
          <div className="grid grid-cols-2 gap-3">
            {subs.map((s) => (
              <div key={s.name} className="card p-3 flex flex-col items-center text-center">
                <ChordDiagram shape={s.shape ?? shapesFor(s.name)[0]} name={s.name} width={90} leftHanded={settings.leftHanded} />
                <p className="text-xs text-[var(--muted)] mt-1">{s.why}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
