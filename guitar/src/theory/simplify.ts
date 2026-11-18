// Suggest easier stand-ins for hard chords.
import { chordName, isMinor, parseChord } from './chord'
import type { Shape } from '../model/song'

export interface Substitute {
  name: string
  why: string
  /** a specific beginner voicing, when the stand-in is a shape rather than a different chord */
  shape?: Shape
}

const s = (frets: number[], fingers: number[]): Shape => ({ frets, fingers, baseFret: 1 })

// Well-known beginner voicings for the usual troublemakers.
const MINI: Record<string, Substitute> = {
  F: { name: 'Fmaj7', why: 'No barre. Sounds close to F in most songs.', shape: s([-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]) },
  Bm: { name: 'Bm7', why: 'Two-finger shape instead of a barre.', shape: s([-1, 2, 0, 2, 0, 2], [0, 1, 0, 2, 0, 3]) },
  B: { name: 'B7', why: 'Open shape, no barre.', shape: s([-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4]) },
  'F#m': { name: 'F#m (mini)', why: 'Three strings, no barre.', shape: s([-1, -1, 4, 2, 2, 2], [0, 0, 3, 1, 1, 1]) },
  'F#': { name: 'F# (mini)', why: 'Top four strings only.', shape: s([-1, -1, 4, 3, 2, 2], [0, 0, 3, 2, 1, 1]) },
  'C#m': { name: 'C#m (mini)', why: 'Top four strings only.', shape: { frets: [-1, -1, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1 } },
  Gm: { name: 'Gm (mini)', why: 'Top four strings only.', shape: { frets: [-1, -1, 3, 1, 1, 1], fingers: [0, 0, 3, 1, 1, 1], baseFret: 3 } },
  Cm: { name: 'Cm (mini)', why: 'Top four strings only.', shape: { frets: [-1, -1, 3, 3, 2, 1], fingers: [0, 0, 3, 4, 2, 1], baseFret: 3 } },
  Bb: { name: 'Bb (mini)', why: 'Top four strings only.', shape: s([-1, -1, 3, 3, 3, 1], [0, 0, 2, 3, 4, 1]) },
  Fm: { name: 'Fm (mini)', why: 'Top four strings only.', shape: s([-1, -1, 3, 1, 1, 1], [0, 0, 3, 1, 1, 1]) },
}

export function substitutes(name: string): Substitute[] {
  const out: Substitute[] = []
  const c = parseChord(name)
  if (!c) return out
  if (c.bass !== undefined) {
    out.push({ name: chordName({ ...c, bass: undefined }), why: 'Drop the bass note after the slash; the band covers it.' })
  }
  const triad = chordName({ root: c.root, rootName: c.rootName, quality: isMinor(c) ? 'm' : '' })
  if (c.quality && triad !== chordName({ ...c, bass: undefined })) {
    out.push({ name: triad, why: `Plain ${isMinor(c) ? 'minor' : 'major'} chord. Loses the colour, keeps the harmony.` })
  }
  for (const n of [chordName({ ...c, bass: undefined }), triad, chordName({ ...c, bass: undefined }, true), chordName({ root: c.root, rootName: c.rootName, quality: isMinor(c) ? 'm' : '' }, true)]) {
    if (MINI[n] && !out.some((o) => o.name === MINI[n].name)) out.push(MINI[n])
  }
  return out
}
