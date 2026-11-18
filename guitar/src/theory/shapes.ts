// Chord voicings from the bundled chords-db (MIT), plus difficulty scoring.
import type { Shape } from '../model/song'
import { parseChord, SHARPS } from './chord'

interface DbPosition {
  frets: number[]
  fingers: number[]
  baseFret: number
  barres: number[]
  capo?: boolean
}
interface DbChord {
  key: string
  suffix: string
  positions: DbPosition[]
}
type Db = Record<string, DbChord[]>

let db: Db | null = null
let loading: Promise<Db> | null = null

export function loadChordDb(): Promise<Db> {
  if (db) return Promise.resolve(db)
  loading ??= import('@tombatossals/chords-db/lib/guitar.json').then((m) => {
    const data = (m as unknown as { default?: { chords: Db }; chords: Db }).default ?? m
    db = (data as { chords: Db }).chords
    return db
  })
  return loading
}
export function chordDbReady(): boolean {
  return db !== null
}

const DB_KEYS = ['C', 'Csharp', 'D', 'Eb', 'E', 'F', 'Fsharp', 'G', 'Ab', 'A', 'Bb', 'B']

/** Map a chord quality as written in tabs to the db's suffix vocabulary. */
export function qualityToSuffix(q: string): string {
  const s = q.replace(/[()]/g, '').replace(/^min(?!or)/, 'm').replace(/^-/, 'm').replace(/^M(?=\d)/, 'maj').replace(/^\+$/, 'aug').replace(/^°/, 'dim').replace(/^ø7?/, 'm7b5')
  const table: Record<string, string> = {
    '': 'major',
    M: 'major',
    maj: 'major',
    m: 'minor',
    '5': 'major', // power chord; db has none, a major shape is a reasonable stand-in
    '2': 'sus2',
    sus: 'sus4',
    '4': 'sus4',
    '7sus': '7sus4',
    add2: 'add9',
    madd2: 'madd9',
    m7b5: 'm7b5',
    mM7: 'mmaj7',
    mmaj7: 'mmaj7',
    dim7: 'dim7',
    '9sus4': '7sus4',
    '6/9': '69',
    '7+5': 'aug7',
    '7#5': 'aug7',
  }
  return table[s] ?? s
}

function fromDb(p: DbPosition): Shape {
  return { frets: p.frets, fingers: p.fingers, baseFret: p.baseFret, barres: p.barres }
}

/** All known voicings for a chord name, easiest first. */
export function shapesFor(name: string): Shape[] {
  if (!db) return []
  const c = parseChord(name)
  if (!c) return []
  const list = db[DB_KEYS[c.root]]
  if (!list) return []
  let suffix = qualityToSuffix(c.quality)
  if (c.bass !== undefined) {
    const bass = SHARPS[c.bass].replace('A#', 'Bb')
    const slash = (suffix === 'minor' ? 'm/' : '/') + bass
    const hit = list.find((x) => x.suffix === slash)
    if (hit) return hit.positions.map(fromDb).sort((a, b) => shapeScore(a) - shapeScore(b))
  }
  let entry = list.find((x) => x.suffix === suffix)
  if (!entry) {
    // fall back to the nearest simpler chord
    suffix = /^m(?!aj)/.test(suffix) ? 'minor' : 'major'
    entry = list.find((x) => x.suffix === suffix)
  }
  return entry ? entry.positions.map(fromDb).sort((a, b) => shapeScore(a) - shapeScore(b)) : []
}

/** 1 = first-week chord, 5 = hard. */
export function shapeScore(s: Shape): number {
  let score = 1
  const barre = (s.barres?.length ?? 0) > 0
  if (barre) score += 2
  if (s.baseFret > 1) score += 1
  const used = new Set((s.fingers ?? []).filter((f) => f > 0)).size
  if (used >= 4) score += 1
  const played = s.frets.filter((f) => f > 0)
  if (played.length && Math.max(...played) - Math.min(...played) >= 3) score += 0.5
  const muted = s.frets.filter((f) => f < 0).length
  if (muted >= 2) score += 0.25
  return Math.min(5, score)
}

// Chords beginners learn first, with their natural difficulty.
const EASY: Record<string, number> = {
  Em: 1, E: 1.3, Am: 1.3, A: 1.5, D: 1.5, G: 1.7, C: 1.8, Dm: 1.8, Em7: 1, G7: 2, C7: 2, A7: 1.3, D7: 1.7, E7: 1.2, Am7: 1.2,
  Cadd9: 1.5, Dsus4: 1.5, Dsus2: 1.5, Asus4: 1.5, Asus2: 1.3, A7sus4: 1.5, Esus4: 1.3, Fmaj7: 2, Dmaj7: 2, Amaj7: 2, Gmaj7: 2.2,
  B7: 2.5, Em9: 1.5,
}

export function chordDifficulty(name: string, override?: Shape): number {
  if (override) return shapeScore(override)
  if (EASY[name] !== undefined) return EASY[name]
  const c = parseChord(name)
  if (!c) return 3
  const s = shapesFor(name)[0]
  let d = s ? shapeScore(s) : 3
  if (c.bass !== undefined) d += 0.5
  return Math.min(5, d)
}

export function difficultyLabel(avg: number): 'Easy' | 'Medium' | 'Hard' {
  return avg < 1.9 ? 'Easy' : avg < 2.8 ? 'Medium' : 'Hard'
}
