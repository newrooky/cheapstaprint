import type { Shape, Song } from '../model/song'
import { transposeChord } from '../theory/chord'
import { chordDifficulty, shapeScore, shapesFor } from '../theory/shapes'
import { substitutes } from '../theory/simplify'
import type { Settings } from './store'

export interface ShownChord {
  written: string
  /** name after transpose (and swap, when on) */
  name: string
  /** what the chord would be without the swap */
  original: string
  shape?: Shape
  swapped: boolean
  known: boolean
  hard: boolean
  /** voicing given in the tab, even if we show an easier one */
  tabShape?: Shape
}

export function chordResolver(song: Song, settings: Settings, swapHard: boolean) {
  const cache = new Map<string, ShownChord>()
  const knownSet = new Set(settings.known)
  return (written: string): ShownChord => {
    const hit = cache.get(written)
    if (hit) return hit
    const original = transposeChord(written, song.transpose)
    // the tab author's voicing, unless it's clearly harder than the standard beginner shape
    const tabShape = song.transpose === 0 ? song.shapes[written] : undefined
    const easiest = shapesFor(original)[0]
    const authorShape = tabShape && (!easiest || shapeScore(tabShape) <= shapeScore(easiest) + 0.5) ? tabShape : undefined
    const hard = chordDifficulty(original, authorShape) >= 2.5
    const known = knownSet.has(original)
    let name = original
    let shape = authorShape ?? easiest
    let swapped = false
    if (swapHard && hard && !known) {
      const sub = substitutes(original)[0]
      if (sub) {
        name = sub.name
        shape = sub.shape ?? shapesFor(sub.name)[0]
        swapped = true
      }
    }
    const r = { written, name, original, shape, swapped, known, hard, tabShape }
    cache.set(written, r)
    return r
  }
}
