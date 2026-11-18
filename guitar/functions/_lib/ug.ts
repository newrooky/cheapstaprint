// Ultimate Guitar page reader. UG has no public API; its pages embed the
// page data as JSON in <div class="js-store" data-content="...">.
// This is for personal use only and will break if UG changes its markup.

import type { Shape, StrumPattern, Stroke } from '../../src/model/song'

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", '#039': "'", '#39': "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractStore(html: string): any {
  const m = /class="js-store"\s+data-content="([^"]*)"/.exec(html)
  if (!m) throw new Error('Could not find tab data on the page (UG may have changed its layout).')
  return JSON.parse(decodeEntities(m[1]))
}

export interface UgSearchResult {
  url: string
  title: string
  artist: string
  type: string
  rating: number
  votes: number
  version: number
  /** rating weighted by vote count; used for "best version" ordering */
  score: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSearch(store: any): UgSearchResult[] {
  const results = store?.store?.page?.data?.results ?? []
  const out: UgSearchResult[] = []
  for (const r of results) {
    if (!r?.tab_url || !r.type || r.marketing_type) continue // skip paid "Pro"/"official" entries
    if (!['Chords', 'Tab', 'Ukulele Chords'].includes(r.type)) continue
    const rating = Number(r.rating) || 0
    const votes = Number(r.votes) || 0
    // Bayesian-ish: pull low-vote ratings towards 4.0
    const score = (rating * votes + 4.0 * 20) / (votes + 20)
    out.push({ url: r.tab_url, title: r.song_name, artist: r.artist_name, type: r.type, rating, votes, version: r.version ?? 1, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

const STROKES: Record<number, Stroke> = { 1: 'D', 101: 'U', 2: 'D>', 102: 'U>', 3: 'xD', 103: 'xU', 202: '-', 201: '-', 0: '-' }

export interface UgTab {
  title: string
  artist: string
  type: string
  rating: number
  votes: number
  capo: number
  key?: string
  tuning?: string
  content: string
  strums: StrumPattern[]
  bpm?: number
  shapes: Record<string, Shape>
  difficulty?: string
  url: string
}

/** UG lists frets high e first; we use low E first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ugShape(a: any): Shape | null {
  if (!Array.isArray(a?.frets) || a.frets.length !== 6) return null
  const frets = [...a.frets].reverse().map((f: number) => (f < 0 ? -1 : f))
  const fingers = Array.isArray(a.fingers) ? [...a.fingers].reverse() : undefined
  const base = Number(a.fret) || 0
  const rel = base > 1 ? frets.map((f: number) => (f > 0 ? f - base + 1 : f)) : frets
  // UG leaves the finger blank on barred strings; mark them as a first-finger barre
  const barred = fingers ? rel.filter((f: number, i: number) => f > 0 && !fingers[i]) : []
  const barres: number[] = []
  if (fingers && barred.length >= 2) {
    const bf = Math.min(...barred)
    rel.forEach((f: number, i: number) => f === bf && !fingers[i] && (fingers[i] = 1))
    barres.push(bf)
  }
  return { frets: rel, fingers, baseFret: base > 1 ? base : 1, barres }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTab(store: any, url: string): UgTab {
  const data = store?.store?.page?.data
  const tab = data?.tab
  const view = data?.tab_view
  const content: string | undefined = view?.wiki_tab?.content
  if (!tab || !content) throw new Error('This page has no readable tab (it may be a Pro/official tab).')
  const meta = view.meta ?? {}

  const strums: StrumPattern[] = []
  for (const s of view.strummings ?? []) {
    const denom = Number(s.denuminator) || 8
    const perBeat = s.is_triplet ? 3 : Math.max(1, denom / 4)
    const strokes = (s.measures ?? []).map((m: { measure: number }) => STROKES[m.measure] ?? '-')
    if (!strokes.length) continue
    // UG stores whole parts; show one bar at a time when the bar repeats
    const bar = perBeat * 4
    const first = strokes.slice(0, bar)
    const repeats = strokes.length % bar === 0 && strokes.every((x: Stroke, i: number) => x === first[i % bar])
    strums.push({ name: s.part || 'Strum', part: s.part, perBeat, beats: repeats ? 4 : Math.ceil(strokes.length / perBeat), strokes: repeats ? first : strokes, bpm: Number(s.bpm) || undefined })
  }

  const shapes: Record<string, Shape> = {}
  for (const [name, list] of Object.entries(view.applicature ?? {})) {
    const sh = Array.isArray(list) && list.length ? ugShape(list[0]) : null
    if (sh) shapes[name] = sh
  }

  return {
    title: tab.song_name,
    artist: tab.artist_name,
    type: tab.type,
    rating: Number(tab.rating) || 0,
    votes: Number(tab.votes) || 0,
    capo: Number(meta.capo) || 0,
    key: meta.tonality || tab.tonality_name || undefined,
    tuning: meta.tuning?.value,
    content,
    strums,
    bpm: strums.find((s) => s.bpm)?.bpm,
    shapes,
    difficulty: view.ug_difficulty || undefined,
    url,
  }
}

export function isUgUrl(u: string): boolean {
  try {
    const url = new URL(u)
    return /(^|\.)ultimate-guitar\.com$/.test(url.hostname) && url.pathname.startsWith('/tab/')
  } catch {
    return false
  }
}

export async function fetchUg(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } })
  if (!res.ok) throw new Error(`Ultimate Guitar answered ${res.status}`)
  return res.text()
}
