import type { ChordPos, Line, Section, Shape } from '../model/song'
import { isChord } from '../theory/chord'

export interface ParsedSheet {
  sections: Section[]
  shapes: Record<string, Shape>
  meta: { title?: string; artist?: string; capo?: number; key?: string }
  format: 'ug' | 'chordpro' | 'plain'
}

const SECTION_WORDS =
  /^(intro|verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|outro|solo|interlude|instrumental|refrain|hook|coda|ending|break|riff|tag)\b/i

// Tokens that can sit on a chord line without making it "not a chord line".
const IGNORABLE = /^(\||\|\||-+|\/+|\.+|x\d+|\(x?\d+x?\)|\d+x|n\.?c\.?|\(|\)|%|:|\*+|>|<|riff\d*|\d)$/i

const TAB_LINE = /^\s*[A-Ga-g]?[#b]?\s*[|:]?[-–0-9xXhpbrsvt/\\~^()<>.=|*\s]+$/

function isTabLine(s: string): boolean {
  if (!TAB_LINE.test(s)) return false
  const dashes = (s.match(/[-–]/g) || []).length
  return dashes >= 6 && s.includes('|')
}

function parseFrets(spec: string): number[] | null {
  const t = spec.trim()
  let parts: string[]
  if (/[-\s]/.test(t)) parts = t.split(/[-\s]+/).filter(Boolean)
  else parts = t.split('')
  if (parts.length !== 6) return null
  const frets = parts.map((p) => (/^x$/i.test(p) ? -1 : Number(p)))
  if (frets.some((f) => Number.isNaN(f) || f > 24)) return null
  return frets
}

/** Absolute frets (low E first, -1 muted) to a Shape with a baseFret. */
export function fretsToShape(abs: number[], fingers?: number[]): Shape {
  const played = abs.filter((f) => f > 0)
  const max = played.length ? Math.max(...played) : 0
  const min = played.length ? Math.min(...played) : 0
  const baseFret = max > 4 ? min : 1
  const frets = abs.map((f) => (f <= 0 ? f : f - baseFret + 1))
  // a barre: the lowest fret is held on two strings with higher frets between them
  const lowest = Math.min(...frets.filter((f) => f > 0))
  const at = frets.map((f, i) => (f === lowest ? i : -1)).filter((i) => i >= 0)
  const barres = at.length >= 2 && frets.slice(at[0], at[at.length - 1] + 1).some((f) => f > lowest) ? [lowest] : []
  return { frets, fingers, baseFret, barres }
}

function chordDefinition(s: string): [string, Shape] | null {
  const m = /^\s*(\S+)\s*[:=]?\s+((?:[xX0-9]{1,2}[-\s]?){6})\s*$/.exec(s)
  if (!m || !isChord(m[1])) return null
  const frets = parseFrets(m[2])
  return frets ? [m[1], fretsToShape(frets)] : null
}

function sectionHeader(s: string): string | null {
  const t = s.trim()
  const b = /^\[([^\]]+)\]$/.exec(t)
  if (b && !isChord(b[1])) return b[1].trim()
  // "Verse 1", "Chorus:", "Pre-Chorus (x2)", "Guitar solo" - at most two words
  const plain = /^([A-Za-z][\w'-]*(?:\s+[\w'-]+)?)\s*(\(.*\)|x\d+)?\s*:?$/.exec(t)
  if (plain && (SECTION_WORDS.test(plain[1]) || SECTION_WORDS.test(plain[1].split(/\s+/)[1] ?? '')) && t.length <= 30)
    return t.replace(/:$/, '')
  return null
}

/** Chord positions if `s` is a line of nothing but chords (plain text). */
function plainChordLine(s: string): ChordPos[] | null {
  if (!s.trim()) return null
  const out: ChordPos[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const tok = m[0]
    const bare = tok.replace(/^[(|]+|[)|,]+$/g, '')
    if (bare && isChord(bare)) out.push({ chord: bare, col: m.index + tok.indexOf(bare) })
    else if (!IGNORABLE.test(tok)) return null
  }
  return out.length ? out : null
}

interface RawLine {
  text: string
  chords: ChordPos[] | null // chords pulled from markup ([ch] or inline [G])
  chordOnly: boolean
}

function stripUgLine(line: string): RawLine {
  const chords: ChordPos[] = []
  let out = ''
  const re = /\[ch\](.*?)\[\/ch\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    out += line.slice(last, m.index)
    chords.push({ chord: m[1].trim(), col: out.length })
    out += m[1]
    last = re.lastIndex
  }
  out += line.slice(last)
  if (!chords.length) return { text: out, chords: null, chordOnly: false }
  let rest = out
  for (const c of [...chords].reverse()) rest = rest.slice(0, c.col) + ' '.repeat(c.chord.length) + rest.slice(c.col + c.chord.length)
  const chordOnly = rest.split(/\s+/).filter(Boolean).every((t) => IGNORABLE.test(t) || /^[-|.]+$/.test(t))
  if (chordOnly) return { text: out, chords, chordOnly: true }
  // chords inline inside lyrics: remove them from the text and keep positions
  return inlineToPositions(line.replace(/\[ch\](.*?)\[\/ch\]/g, '[$1]'))
}

function inlineToPositions(line: string): RawLine {
  const chords: ChordPos[] = []
  let text = ''
  const re = /\[([^\]]+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (!isChord(m[1])) continue
    text += line.slice(last, m.index)
    const col = Math.max(text.length, chords.length ? chords[chords.length - 1].col + chords[chords.length - 1].chord.length + 1 : 0)
    chords.push({ chord: m[1], col })
    last = re.lastIndex
  }
  text += line.slice(last)
  if (!chords.length) return { text: line, chords: null, chordOnly: false }
  return { text, chords, chordOnly: !text.trim() }
}

export function detectFormat(text: string): ParsedSheet['format'] {
  if (/\[ch\]/.test(text)) return 'ug'
  if (/^\s*\{\s*(title|t|artist|soc|start_of_chorus|c|comment)\s*[:}]/im.test(text)) return 'chordpro'
  if (/[a-z]\[[A-G][#b]?[^\]\s]{0,6}\]|\[[A-G][#b]?[^\]\s]{0,6}\][a-z]/.test(text)) return 'chordpro'
  return 'plain'
}

export function parseSheet(input: string): ParsedSheet {
  const format = detectFormat(input)
  const text = input.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\[\/?tab\]/g, '')
  const meta: ParsedSheet['meta'] = {}
  const shapes: Record<string, Shape> = {}
  const sections: Section[] = []
  let cur: Section = { name: '', lines: [] }
  const push = (l: Line) => cur.lines.push(l)
  const newSection = (name: string) => {
    if (cur.lines.some((l) => l.kind !== 'blank') || cur.name) sections.push(cur)
    cur = { name, lines: [] }
  }

  const rows = text.split('\n')
  let pending: ChordPos[] | null = null
  let tabBuf: string[] = []
  const flushTab = () => {
    if (tabBuf.length) push({ kind: 'tab', text: tabBuf.join('\n') })
    tabBuf = []
  }
  const flushPending = () => {
    if (pending) push({ kind: 'lyric', chords: pending, text: '' })
    pending = null
  }

  for (const row of rows) {
    const line = row.replace(/\s+$/, '')

    if (format === 'chordpro') {
      const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line)
      if (d) {
        flushPending()
        flushTab()
        const [, k, v = ''] = d
        const key = k.toLowerCase()
        if (key === 'title' || key === 't') meta.title = v
        else if (key === 'artist' || key === 'subtitle' || key === 'st') meta.artist ??= v
        else if (key === 'capo') meta.capo = Number(v) || 0
        else if (key === 'key') meta.key = v
        else if (key === 'soc' || key === 'start_of_chorus') newSection(v || 'Chorus')
        else if (key === 'sov' || key === 'start_of_verse') newSection(v || 'Verse')
        else if (key === 'sob' || key === 'start_of_bridge') newSection(v || 'Bridge')
        else if (key === 'c' || key === 'comment' || key === 'ci') {
          if (SECTION_WORDS.test(v)) newSection(v)
          else push({ kind: 'text', text: v })
        } else if (key === 'define') {
          const m = /^(\S+).*?frets\s+([x\d\s]+)/i.exec(v)
          const fr = m && parseFrets(m[2])
          if (m && fr) shapes[m[1]] = fretsToShape(fr)
        }
        continue
      }
    }

    if (!line.trim()) {
      flushPending()
      flushTab()
      if (cur.lines.length && cur.lines[cur.lines.length - 1].kind !== 'blank') push({ kind: 'blank' })
      continue
    }

    const def = chordDefinition(line.replace(/\[\/?ch\]/g, ''))
    if (def) {
      flushPending()
      shapes[def[0]] = def[1]
      continue
    }

    if (isTabLine(line)) {
      flushPending()
      tabBuf.push(line)
      continue
    }
    flushTab()

    const header = sectionHeader(line.replace(/\[\/?ch\]/g, ''))
    if (header && !plainChordLine(line)) {
      flushPending()
      newSection(header)
      continue
    }

    let raw: RawLine
    if (format === 'ug') raw = stripUgLine(line)
    else if (format === 'chordpro') raw = inlineToPositions(line)
    else {
      const pc = plainChordLine(line)
      raw = pc ? { text: line, chords: pc, chordOnly: true } : { text: line, chords: null, chordOnly: false }
    }

    if (raw.chords && raw.chordOnly) {
      flushPending()
      pending = raw.chords
      continue
    }
    if (raw.chords) {
      flushPending()
      push({ kind: 'lyric', chords: raw.chords, text: raw.text })
      continue
    }
    if (pending) {
      push({ kind: 'lyric', chords: pending, text: line })
      pending = null
      continue
    }
    push({ kind: 'text', text: line })
  }
  flushPending()
  flushTab()
  sections.push(cur)

  for (const s of sections) while (s.lines.length && s.lines[s.lines.length - 1].kind === 'blank') s.lines.pop()
  return { sections: sections.filter((s) => s.lines.length || s.name), shapes, meta, format }
}
