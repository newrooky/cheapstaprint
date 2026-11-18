import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseSheet } from '../src/parse/chordsheet'
import { parseChord, transposeChord } from '../src/theory/chord'
import { extractStore, parseSearch, parseTab } from '../functions/_lib/ug'
import { capoOptions } from '../src/theory/easykey'
import { substitutes } from '../src/theory/simplify'
import { loadChordDb, shapesFor, qualityToSuffix } from '../src/theory/shapes'

describe('chords', () => {
  it('parses chord names', () => {
    for (const c of ['C', 'Am', 'F#m7', 'Bb', 'Dsus4', 'A7sus4', 'Cadd9', 'G/F#', 'Ebmaj7', 'C#m7b5', 'E5', 'Asus2', 'D/F#', 'Gm6', 'Bdim', 'Caug', 'C(add9)'])
      expect(parseChord(c), c).not.toBeNull()
    for (const w of ['And', 'Am I', 'Go', 'Do', 'Bad', 'Cat', 'x4', 'Intro', 'Em7a']) expect(parseChord(w), w).toBeNull()
  })
  it('transposes', () => {
    expect(transposeChord('G', 2)).toBe('A')
    expect(transposeChord('F#m', -2)).toBe('Em')
    expect(transposeChord('D/F#', 2)).toBe('E/G#')
    expect(transposeChord('A', 1)).toBe('Bb')
    expect(transposeChord('Bb', 2)).toBe('C')
  })
})

describe('sheet parser', () => {
  it('plain chord-over-lyrics', () => {
    const s = parseSheet(`Verse 1:
G         D          Em
Here comes the sun, doo-doo
C    G
Sun  sun

[Chorus]
Am   F   C   G   x2
Break my heart again`)
    expect(s.format).toBe('plain')
    expect(s.sections.map((x) => x.name)).toEqual(['Verse 1', 'Chorus'])
    const l = s.sections[0].lines[0]
    expect(l.kind).toBe('lyric')
    if (l.kind === 'lyric') {
      expect(l.chords.map((c) => c.chord)).toEqual(['G', 'D', 'Em'])
      expect(l.chords[1].col).toBe(10)
      expect(l.text).toBe('Here comes the sun, doo-doo')
    }
    const ch = s.sections[1].lines
    expect(ch[0].kind === 'lyric' && ch[0].chords.length).toBe(4)
    expect(ch[0].kind === 'lyric' && ch[0].text).toBe('Break my heart again')
  })

  it('chordpro', () => {
    const s = parseSheet(`{title: Test Song}
{artist: Someone}
{capo: 2}
{soc}
[G]Swing low, [C]sweet chari[G]ot
{eoc}`)
    expect(s.format).toBe('chordpro')
    expect(s.meta).toMatchObject({ title: 'Test Song', artist: 'Someone', capo: 2 })
    const l = s.sections.find((x) => x.name === 'Chorus')!.lines[0]
    expect(l.kind === 'lyric' && l.text).toBe('Swing low, sweet chariot')
    expect(l.kind === 'lyric' && l.chords.map((c) => [c.chord, c.col])).toEqual([['G', 0], ['C', 11], ['G', 22]])
  })

  it('keeps tab blocks', () => {
    const s = parseSheet(`[Riff]
e|-----0---|
B|---1-----|
G|-2-------|
D|---------|
A|---------|
E|---------|`)
    const t = s.sections[0].lines[0]
    expect(t.kind).toBe('tab')
    expect(t.kind === 'tab' && t.text.split('\n').length).toBe(6)
  })

  it('reads a real UG page', () => {
    const html = readFileSync(new URL('./fixtures/ug-tab.html', import.meta.url), 'utf8')
    const tab = parseTab(extractStore(html), 'x')
    expect(tab.title).toBe('Wonderwall')
    expect(tab.capo).toBe(2)
    expect(tab.strums.length).toBeGreaterThan(0)
    expect(tab.strums[0].strokes.length % 16).toBe(0)
    expect(tab.strums[0].strokes.slice(0, 4)).toEqual(["D", "-", "D", "-"])
    expect(tab.shapes.Em7.frets).toEqual([0, 2, 0, 0, 0, 0])
    const s = parseSheet(tab.content)
    expect(s.format).toBe('ug')
    expect(Object.keys(s.shapes)).toContain('Cadd9')
    expect(s.shapes.Em7.frets).toEqual([0, 2, 2, 0, 3, 3])
    const names = s.sections.map((x) => x.name)
    expect(names).toContain('Intro')
    expect(names).toContain('Verse 1')
    const v = s.sections.find((x) => x.name === 'Verse 1')!.lines[0]
    expect(v.kind === 'lyric' && v.text).toBe('Today is gonna be the day')
    expect(v.kind === 'lyric' && v.chords.map((c) => c.chord)).toEqual(['Em7', 'G'])
  })

  it('detects barres in written shapes', () => {
    const s = parseSheet('B   x24442\nEm7  022033\nF  133211\n\n[Verse]\nB  Em7\nla la')
    expect(s.shapes.B.barres).toEqual([2])
    expect(s.shapes.Em7.barres).toEqual([])
    expect(s.shapes.F.barres).toEqual([1])
  })

  it('reads UG search results', () => {
    const html = readFileSync(new URL('./fixtures/ug-search.html', import.meta.url), 'utf8')
    const r = parseSearch(extractStore(html))
    expect(r.length).toBeGreaterThan(5)
    expect(r[0].votes).toBeGreaterThan(1000)
    expect(r.every((x) => x.url.includes('/tab/'))).toBe(true)
  })
})

describe('easier chords', () => {
  it('finds capo for barre-heavy songs', async () => {
    await loadChordDb()
    // F, Bb, C, Dm with no capo -> capo 3 or 5 gives open shapes (D, G, A, Bm / C, F...)
    const opts = capoOptions(['F', 'Bb', 'C', 'Dm'])
    expect(opts[0].capo).not.toBe(0)
    expect(opts[0].shapes.join(' ')).toMatch(/^(D G A Bm|C F G Am|E A B C#m)$/)
  })
  it('suggests substitutes', () => {
    expect(substitutes('F').map((s) => s.name)).toContain('Fmaj7')
    expect(substitutes('G/B').map((s) => s.name)).toContain('G')
    expect(substitutes('Bm7').map((s) => s.name)).toContain('Bm')
  })
  it('maps qualities to db suffixes and finds shapes', async () => {
    await loadChordDb()
    expect(qualityToSuffix('m')).toBe('minor')
    expect(shapesFor('G')[0].frets).toEqual([3, 2, 0, 0, 0, 3])
    expect(shapesFor('Am')[0].frets).toEqual([-1, 0, 2, 2, 1, 0])
    expect(shapesFor('D/F#').length).toBeGreaterThan(0)
    expect(shapesFor('Cadd9').length).toBeGreaterThan(0)
  })
})
