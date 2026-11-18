import type { Song } from '../model/song'
import { parseSheet } from '../parse/chordsheet'
import { newId } from './store'
import type { UgSearchResult, UgTab } from '../../functions/_lib/ug'

export type InputKind = 'url' | 'text' | 'search'

export function classify(input: string): InputKind {
  const t = input.trim()
  if (/^https?:\/\/\S+$/.test(t)) return 'url'
  if (t.split('\n').length >= 3) return 'text'
  return 'search'
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('No connection. Paste the tab text instead, or try again when online.')
  }
  const j = await res.json().catch(() => ({ error: 'Tab service is unavailable right now.' }))
  if (!res.ok) throw new Error(j.error || 'Something went wrong')
  return j as T
}

export async function searchTabs(q: string): Promise<UgSearchResult[]> {
  return (await getJson<{ results: UgSearchResult[] }>('/api/search?q=' + encodeURIComponent(q))).results
}

export async function fetchTab(url: string): Promise<UgTab> {
  return getJson<UgTab>('/api/tab?url=' + encodeURIComponent(url))
}

export function songFromUg(t: UgTab): Song {
  const p = parseSheet(t.content)
  return {
    id: newId(),
    title: t.title,
    artist: t.artist,
    source: 'ug',
    sourceUrl: t.url,
    rating: t.rating,
    votes: t.votes,
    key: t.key,
    capo: t.capo,
    tuning: t.tuning,
    sections: p.sections,
    // shapes written in the tab text win over UG's generated ones
    shapes: { ...t.shapes, ...p.shapes },
    strums: t.strums,
    bpm: t.bpm,
    transpose: 0,
    marks: {},
    createdAt: Date.now(),
  }
}

export function songFromText(text: string, title?: string, artist?: string): Song {
  const p = parseSheet(text)
  // first non-empty lines often hold "Title - Artist" in pasted sheets
  let guessTitle = p.meta.title
  let guessArtist = p.meta.artist
  if (!guessTitle) {
    const first = p.sections[0]?.lines.find((l) => l.kind === 'text')
    if (first && first.kind === 'text' && first.text.length < 80) {
      const m = /^(.+?)\s+(?:-|–|by)\s+(.+)$/i.exec(first.text.trim())
      if (m) [guessTitle, guessArtist] = [m[1], m[2]]
      else guessTitle = first.text.trim()
    }
  }
  return {
    id: newId(),
    title: title || guessTitle || 'Untitled song',
    artist: artist || guessArtist || '',
    source: p.format === 'chordpro' ? 'chordpro' : 'paste',
    key: p.meta.key,
    capo: p.meta.capo ?? 0,
    sections: p.sections,
    shapes: p.shapes,
    strums: [],
    transpose: 0,
    marks: {},
    createdAt: Date.now(),
  }
}
