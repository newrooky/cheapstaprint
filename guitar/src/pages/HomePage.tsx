import { useEffect, useState } from 'react'
import { classify, fetchTab, searchTabs, songFromText, songFromUg } from '../lib/importer'
import { saveSong, streak, today, useSettings, useSongs } from '../lib/store'
import { navigate } from '../lib/router'
import { chordsInOrder, type Song } from '../model/song'
import { chordDifficulty, difficultyLabel, loadChordDb } from '../theory/shapes'
import { bestCapo } from '../theory/easykey'
import type { UgSearchResult } from '../../functions/_lib/ug'
import { DEMO_SONG } from '../data/demo'

function songDifficulty(s: Song) {
  const ch = chordsInOrder(s)
  if (!ch.length) return null
  const opt = bestCapo(ch, s.capo)
  const shapes = [...new Set(opt.shapes)]
  return { label: difficultyLabel(shapes.reduce((a, c) => a + chordDifficulty(c), 0) / shapes.length), count: shapes.length }
}

export function HomePage() {
  const songs = useSongs()
  const settings = useSettings()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<UgSearchResult[] | null>(null)
  const [, setDb] = useState(false)
  useEffect(() => void loadChordDb().then(() => setDb(true)), [])

  const kind = classify(input)
  const go = async () => {
    setErr(null)
    setResults(null)
    const t = input.trim()
    if (!t) return
    setBusy(true)
    try {
      if (kind === 'text') {
        const s = songFromText(t)
        await saveSong(s)
        navigate('/song/' + s.id)
      } else if (kind === 'url') {
        if (!/ultimate-guitar\.com\/tab\//.test(t)) throw new Error('Only Ultimate Guitar links can be fetched. For other sites, copy the tab text and paste it here.')
        const s = songFromUg(await fetchTab(t))
        await saveSong(s)
        navigate('/song/' + s.id)
      } else {
        setResults(await searchTabs(t))
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const open = async (r: UgSearchResult) => {
    setBusy(true)
    setErr(null)
    try {
      const s = songFromUg(await fetchTab(r.url))
      await saveSong(s)
      navigate('/song/' + s.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const days = streak(settings.practice)
  const mins = Math.round((settings.practice[today()] ?? 0) / 60)

  return (
    <div className="min-h-screen pb-24">
      <header className="pt-[calc(env(safe-area-inset-top)+1.25rem)] max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Fretboard</h1>
          <div className="text-right text-sm">
            <div className="font-semibold">{days > 0 ? `${days}-day streak` : 'No streak yet'}</div>
            <div className="text-[var(--muted)]">{mins} min today</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4">
        <form className="mt-5" onSubmit={(e) => (e.preventDefault(), go())}>
          <label htmlFor="add" className="text-sm font-medium">Add a song</label>
          <textarea
            id="add"
            className="input mt-1.5 resize-none font-[inherit]"
            rows={input.includes('\n') ? 8 : 1}
            placeholder="Song name, an Ultimate Guitar link, or paste a whole tab"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && classify(input) !== 'text') {
                e.preventDefault()
                go()
              }
            }}
          />
          <div className="flex items-center gap-2 mt-2">
            <button className="btn-primary" disabled={busy || !input.trim()}>
              {busy ? 'Working…' : kind === 'text' ? 'Use this tab' : kind === 'url' ? 'Get tab' : 'Find tabs'}
            </button>
            {input && <button type="button" className="btn-ghost text-sm" onClick={() => (setInput(''), setResults(null), setErr(null))}>Clear</button>}
          </div>
          {err && <p className="text-sm text-[var(--warn)] mt-2">{err}</p>}
        </form>

        {results && (
          <section className="mt-5">
            <h2 className="text-sm font-semibold text-[var(--muted)] mb-2">Best rated first</h2>
            {results.length === 0 && <p className="text-[var(--muted)]">No tabs found. Try the artist name too.</p>}
            <ul className="space-y-1.5">
              {results.map((r) => (
                <li key={r.url}>
                  <button className="card w-full text-left p-3 flex items-center gap-3 hover:border-[var(--accent)]" onClick={() => open(r)} disabled={busy}>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{r.title} <span className="text-[var(--muted)] font-normal">· {r.artist}</span></div>
                      <div className="text-xs text-[var(--muted)]">{r.type} · version {r.version}</div>
                    </div>
                    <div className="text-right text-sm shrink-0">
                      <div>★ {r.rating.toFixed(1)}</div>
                      <div className="text-xs text-[var(--muted)]">{r.votes.toLocaleString()} votes</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="grid grid-cols-3 gap-2 mt-6">
          <button className="card p-3 text-left" onClick={() => navigate('/chords')}>
            <div className="text-xl">🎸</div>
            <div className="font-semibold text-sm mt-1">My chords</div>
            <div className="text-xs text-[var(--muted)]">{settings.known.length} learned</div>
          </button>
          <button className="card p-3 text-left" onClick={() => navigate('/tuner')}>
            <div className="text-xl">🎯</div>
            <div className="font-semibold text-sm mt-1">Tuner</div>
            <div className="text-xs text-[var(--muted)]">Uses the mic</div>
          </button>
          <button className="card p-3 text-left" onClick={() => navigate('/settings')}>
            <div className="text-xl">⚙️</div>
            <div className="font-semibold text-sm mt-1">Settings</div>
            <div className="text-xs text-[var(--muted)]">{settings.spotifyClientId ? 'Spotify set up' : 'Set up Spotify'}</div>
          </button>
        </nav>

        <section className="mt-8">
          <h2 className="font-semibold mb-2">My songs</h2>
          {songs && songs.length === 0 && (
            <div className="card p-4">
              <p className="text-[var(--muted)]">No songs yet. Search for one above, or try the practice song.</p>
              <button
                className="btn mt-3"
                onClick={async () => {
                  const s = { ...DEMO_SONG, id: 'demo', createdAt: Date.now() }
                  await saveSong(s)
                  navigate('/song/demo')
                }}
              >
                Open the practice song
              </button>
            </div>
          )}
          <ul className="space-y-1.5">
            {songs?.map((s) => {
              const d = songDifficulty(s)
              return (
                <li key={s.id}>
                  <button className="card w-full text-left p-3 flex items-center gap-3" onClick={() => navigate('/song/' + s.id)}>
                    {s.spotify?.image ? <img src={s.spotify.image} alt="" className="size-11 rounded-lg" /> : <div className="size-11 rounded-lg bg-[var(--soft)] grid place-items-center text-lg">♪</div>}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{s.title}</div>
                      <div className="text-sm text-[var(--muted)] truncate">{s.artist || 'Unknown artist'}</div>
                    </div>
                    {d && <span className="chip shrink-0">{d.label} · {d.count} chords</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </main>
    </div>
  )
}
