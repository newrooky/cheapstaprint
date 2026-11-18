export type Stroke = 'D' | 'U' | '-' | 'xD' | 'xU' | 'D>' | 'U>'

export interface StrumPattern {
  name: string
  /** strokes per beat: 2 = eighth notes, 4 = sixteenths, 3 = triplets/6-8 feel */
  perBeat: number
  beats: number
  strokes: Stroke[]
  bpm?: number
  part?: string
}

export interface ChordPos {
  chord: string
  col: number
}

export type Line =
  | { kind: 'lyric'; chords: ChordPos[]; text: string }
  | { kind: 'tab'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'blank' }

export interface Section {
  name: string
  lines: Line[]
}

/** frets low E to high e, -1 = muted */
export interface Shape {
  frets: number[]
  fingers?: number[]
  baseFret: number
  barres?: number[]
}

export interface Song {
  id: string
  title: string
  artist: string
  source: 'paste' | 'ug' | 'chordpro'
  sourceUrl?: string
  rating?: number
  votes?: number
  key?: string
  capo: number
  tuning?: string
  sections: Section[]
  /** voicings given by the tab author, keyed by chord name */
  shapes: Record<string, Shape>
  strums: StrumPattern[]
  bpm?: number
  // user state
  transpose: number
  userCapo?: number
  strumIndex?: number
  spotify?: { id: string; uri: string; name: string; artists: string; durationMs: number; image?: string }
  /** line index (flattened) -> ms in the Spotify track */
  marks: Record<number, number>
  scrollSpeed?: number
  createdAt: number
  lastOpened?: number
}

export function allLines(song: Song): Line[] {
  return song.sections.flatMap((s) => s.lines)
}

export function chordsInOrder(song: Song): string[] {
  const seen: string[] = []
  for (const l of allLines(song)) {
    if (l.kind !== 'lyric') continue
    for (const c of l.chords) if (!seen.includes(c.chord)) seen.push(c.chord)
  }
  return seen
}
