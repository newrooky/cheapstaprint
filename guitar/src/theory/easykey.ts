// Find the capo position / transposition with the easiest chord shapes.
import { transposeChord } from './chord'
import { chordDifficulty } from './shapes'

export interface CapoOption {
  capo: number
  /** semitones applied to the written chords to get the shapes you play */
  shift: number
  shapes: string[]
  score: number
}

function avg(names: string[]): number {
  if (!names.length) return 0
  return names.reduce((s, n) => s + chordDifficulty(n), 0) / names.length
}

/**
 * The song sounds the same with capo `c` and shapes transposed down by c - originalCapo.
 * `chords` are the shapes as written for `writtenCapo`.
 */
export function capoOptions(chords: string[], writtenCapo = 0, maxCapo = 7): CapoOption[] {
  const out: CapoOption[] = []
  for (let capo = 0; capo <= maxCapo; capo++) {
    const shift = writtenCapo - capo
    const shapes = chords.map((c) => transposeChord(c, shift))
    // small penalty for high capo: harder to reach, sounds thinner
    out.push({ capo, shift, shapes, score: avg(shapes) + capo * 0.04 })
  }
  return out.sort((a, b) => a.score - b.score)
}

export function bestCapo(chords: string[], writtenCapo = 0): CapoOption {
  return capoOptions(chords, writtenCapo)[0]
}
