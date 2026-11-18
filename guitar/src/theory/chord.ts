// Chord name parsing and transposition.

export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_INDEX: Record<string, number> = {}
SHARPS.forEach((n, i) => (NOTE_INDEX[n] = i))
FLATS.forEach((n, i) => (NOTE_INDEX[n] = i))
Object.assign(NOTE_INDEX, { Cb: 11, Fb: 4, 'E#': 5, 'B#': 0 })

export interface Chord {
  root: number // 0..11
  rootName: string
  quality: string // everything between root and slash, e.g. "m7", "sus4", ""
  bass?: number
  bassName?: string
}

// root, quality, optional slash bass. Quality is a restricted vocabulary so that
// words like "Am" in lyrics still parse but "And" does not.
const CHORD_RE =
  /^([A-G](?:#|b)?)((?:maj|min|m|M|dim|aug|sus|add|\+|°|ø|-)?(?:\d{1,2})?(?:(?:sus|add|maj|M|b|#|\+|-|no)\d{1,2})*(?:\(?(?:b|#|add|sus|no)?\d{1,2}\)?)*)(?:\/([A-G](?:#|b)?))?$/

export function parseChord(name: string): Chord | null {
  const s = name.trim()
  const m = CHORD_RE.exec(s)
  if (!m) return null
  const root = NOTE_INDEX[m[1]]
  if (root === undefined) return null
  const c: Chord = { root, rootName: m[1], quality: m[2] ?? '' }
  if (m[3]) {
    const b = NOTE_INDEX[m[3]]
    if (b === undefined) return null
    c.bass = b
    c.bassName = m[3]
  }
  return c
}

export function isChord(token: string): boolean {
  return parseChord(token) !== null
}

export function noteName(i: number, flats = false): string {
  const n = ((i % 12) + 12) % 12
  return (flats ? FLATS : SHARPS)[n]
}

export function chordName(c: Chord, flats = false): string {
  let s = noteName(c.root, flats) + c.quality
  if (c.bass !== undefined) s += '/' + noteName(c.bass, flats)
  return s
}

// Keys guitarists usually spell with flats.
const FLAT_ROOTS = new Set([3, 10]) // Eb, Bb; C#, F#, G# read better sharp on guitar

export function transposeChord(name: string, semitones: number, preferFlats?: boolean): string {
  const c = parseChord(name)
  if (!c) return name
  if (semitones % 12 === 0) return name
  const root = (c.root + semitones + 120) % 12
  // minor chords on those roots read better sharp too (G#m, not Abm), except Ebm/Bbm
  const flats = preferFlats ?? (c.rootName.includes('b') || (FLAT_ROOTS.has(root)))
  return chordName({ ...c, root, bass: c.bass === undefined ? undefined : (c.bass + semitones + 120) % 12 }, flats)
}

export function isMinor(c: Chord): boolean {
  return /^(m|min|-)(?!aj)/.test(c.quality)
}
