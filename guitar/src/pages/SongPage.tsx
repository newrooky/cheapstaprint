import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Line, Song, StrumPattern } from '../model/song'
import { allLines, chordsInOrder } from '../model/song'
import { deleteSong, loadSong, logPractice, saveSong, updateSettings, useSettings } from '../lib/store'
import { chordResolver, type ShownChord } from '../lib/chordview'
import { loadChordDb } from '../theory/shapes'
import { capoOptions } from '../theory/easykey'
import { difficultyLabel, chordDifficulty } from '../theory/shapes'
import { transposeChord } from '../theory/chord'
import { ChordDiagram } from '../ui/ChordDiagram'
import { ChordSheet } from '../ui/ChordSheet'
import { Sheet } from '../ui/Sheet'
import { StrumView } from '../ui/StrumView'
import { STARTER_STRUMS } from '../data/strums'
import { Metronome, makeTapTempo } from '../audio/metronome'
import { isLoggedIn, login } from '../spotify/auth'
import { pause, play, positionNow, searchTracks, seek, toggle, usePlayer, type Track } from '../spotify/player'
import { navigate } from '../lib/router'

const READ_LINE = 0.35 // where the "now" line sits, as a share of screen height

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function SongPage({ id }: { id: string }) {
  const [song, setSong] = useState<Song | null | undefined>(undefined)
  const [dbReady, setDbReady] = useState(false)
  useEffect(() => {
    loadChordDb().then(() => setDbReady(true))
    loadSong(id).then((s) => {
      if (s) {
        s.lastOpened = Date.now()
        saveSong(s)
      }
      setSong(s ?? null)
    })
  }, [id])
  const update = useCallback((patch: Partial<Song>) => {
    setSong((s) => {
      if (!s) return s
      const n = { ...s, ...patch }
      saveSong(n)
      return n
    })
  }, [])
  if (song === undefined) return <p className="p-6 text-[var(--muted)]">Loading…</p>
  if (song === null)
    return (
      <div className="p-6">
        <p>That song isn't saved on this device.</p>
        <button className="btn mt-4" onClick={() => navigate('/')}>Back to my songs</button>
      </div>
    )
  return <SongView key={dbReady ? 'ready' : 'loading'} song={song} update={update} />
}

function SongView({ song, update }: { song: Song; update: (p: Partial<Song>) => void }) {
  const settings = useSettings()
  const player = usePlayer()
  const [chordOpen, setChordOpen] = useState<ShownChord | null>(null)
  const [easierOpen, setEasierOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [strumOpen, setStrumOpen] = useState(true)
  const [autoScroll, setAutoScroll] = useState(false)
  const [markMode, setMarkMode] = useState(false)
  const [loop, setLoop] = useState<{ a: number; b: number } | null>(null)
  const [active, setActive] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const resolve = useMemo(() => chordResolver(song, settings, settings.showSubs), [song, settings])
  const lines = useMemo(() => allLines(song), [song])
  const written = useMemo(() => chordsInOrder(song), [song])
  const shown = useMemo(() => {
    const seen = new Map<string, ShownChord>()
    for (const w of written) {
      const r = resolve(w)
      if (!seen.has(r.name)) seen.set(r.name, r)
    }
    return [...seen.values()]
  }, [written, resolve])
  const avgDifficulty = shown.length ? shown.reduce((s, c) => s + chordDifficulty(c.name, c.shape), 0) / shown.length : 0
  const capo = song.userCapo ?? song.capo
  const anyKnown = settings.known.length > 0
  const linked = !!song.spotify
  const isThisTrack = linked && player.uri === song.spotify!.uri
  const playing = isThisTrack && player.playing
  const durationMs = song.spotify?.durationMs ?? 0

  // ----- line geometry -----
  const lineEls = useRef(new Map<number, HTMLElement>())
  const tops = useRef<number[]>([])
  const measure = useCallback(() => {
    const arr: number[] = []
    lineEls.current.forEach((el, i) => (arr[i] = el.getBoundingClientRect().top + window.scrollY))
    tops.current = arr
  }, [])
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    return () => ro.disconnect()
  }, [measure, settings.fontSize, song])

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight

  // ----- scrolling engine -----
  const state = useRef({ autoScroll, playing, follow: true, holdUntil: 0, pos: 0, loop, speed: 0, marks: song.marks, durationMs })
  state.current.autoScroll = autoScroll
  state.current.playing = playing
  state.current.loop = loop
  state.current.marks = song.marks
  state.current.durationMs = durationMs
  const defaultSpeed = () => (durationMs ? Math.max(8, maxScroll() / (durationMs / 1000)) : 25)
  state.current.speed = song.scrollSpeed ?? 0

  useEffect(() => {
    const hold = () => (state.current.holdUntil = performance.now() + 2500)
    const evs = ['wheel', 'touchmove'] as const
    evs.forEach((e) => window.addEventListener(e, hold, { passive: true }))
    return () => evs.forEach((e) => window.removeEventListener(e, hold))
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastActive = -1
    const vh = () => window.innerHeight
    const targetFor = (ms: number) => {
      const st = state.current
      const max = maxScroll()
      const pts = [{ y: 0, ms: 0 }]
      Object.entries(st.marks)
        .map(([i, t]) => ({ y: (tops.current[Number(i)] ?? 0) - vh() * READ_LINE, ms: t }))
        .sort((a, b) => a.ms - b.ms)
        .forEach((p) => pts.push(p))
      pts.push({ y: max, ms: Math.max(st.durationMs, pts[pts.length - 1].ms + 1) })
      for (let i = 1; i < pts.length; i++) {
        if (ms <= pts[i].ms) {
          const a = pts[i - 1]
          const b = pts[i]
          return a.y + ((b.y - a.y) * (ms - a.ms)) / Math.max(1, b.ms - a.ms)
        }
      }
      return max
    }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const st = state.current
      const held = now < st.holdUntil
      if (held) st.pos = window.scrollY
      if (st.playing) {
        const pos = positionNow()
        if (st.loop && pos >= st.loop.b - 80) seek(st.loop.a)
        if (st.follow && !held && st.durationMs) {
          const target = Math.max(0, targetFor(pos))
          const cur = window.scrollY
          st.pos = cur + (target - cur) * Math.min(1, dt * 3)
          window.scrollTo(0, st.pos)
        }
      } else if (st.autoScroll && !held) {
        st.pos += (st.speed || defaultSpeed()) * dt
        window.scrollTo(0, st.pos)
      }
      // which line is "now"
      const y = window.scrollY + vh() * READ_LINE
      const t = tops.current
      let lo = 0
      for (let i = 0; i < t.length; i++) if (t[i] !== undefined && t[i] <= y) lo = i
      if (lo !== lastActive) {
        lastActive = lo
        setActive(lo)
      }
    }
    state.current.pos = window.scrollY
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep screen awake while practising
  useEffect(() => {
    if (!(autoScroll || playing) || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock.request('screen').then((l) => (lock = l), () => {})
    return () => void lock?.release()
  }, [autoScroll, playing])

  // ----- metronome / strum -----
  const strums: StrumPattern[] = [...song.strums, ...STARTER_STRUMS]
  const strumIdx = Math.min(song.strumIndex ?? 0, strums.length - 1)
  const pattern = strums[strumIdx]
  const [bpm, setBpm] = useState(song.bpm ?? pattern.bpm ?? 80)
  const [slow, setSlow] = useState(1)
  const [metroOn, setMetroOn] = useState(false)
  const [stroke, setStroke] = useState(-1)
  const metro = useRef<Metronome | null>(null)
  const tap = useRef(makeTapTempo())
  useEffect(() => {
    const m = (metro.current ??= new Metronome())
    m.bpm = Math.max(30, bpm * slow)
    m.perBeat = pattern.perBeat
    m.beats = Math.max(1, Math.round(pattern.strokes.length / pattern.perBeat))
    m.onTick = setStroke
  }, [bpm, slow, pattern])
  useEffect(() => () => metro.current?.stop(), [])
  const toggleMetro = () => {
    const m = metro.current!
    if (m.running) {
      m.stop()
      setMetroOn(false)
      setStroke(-1)
    } else {
      m.start()
      setMetroOn(true)
    }
  }

  // ----- practice time -----
  const busy = useRef(false)
  busy.current = autoScroll || playing || metroOn
  useEffect(() => {
    let acc = 0
    const t = setInterval(() => {
      if (busy.current && document.visibilityState === 'visible') acc++
      if (acc >= 15) {
        logPractice(acc)
        acc = 0
      }
    }, 1000)
    return () => {
      clearInterval(t)
      if (acc) logPractice(acc)
    }
  }, [])

  // keyboard: space toggles scroll / playback
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input,textarea,select,button')) return
      e.preventDefault()
      if (linked && isLoggedIn()) toggle(song.spotify!.uri).catch((x) => setErr(x.message))
      else setAutoScroll((a) => !a)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [linked, song.spotify])

  const flash = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 1800)
  }

  const onLineTap = (idx: number) => {
    if (markMode && isThisTrack) {
      const ms = Math.round(positionNow())
      update({ marks: { ...song.marks, [idx]: ms } })
      flash(`Marked at ${fmt(ms)}`)
    }
  }

  const startLoop = () => {
    if (loop) return setLoop(null)
    const p = positionNow()
    const ms = Object.values(song.marks).sort((a, b) => a - b)
    const a = [...ms].reverse().find((m) => m <= p) ?? 0
    const b = ms.find((m) => m > p + 500) ?? durationMs
    setLoop({ a, b })
    flash(`Looping ${fmt(a)} to ${fmt(b)}`)
  }

  const runSpotify = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try {
      if (!isLoggedIn()) return await login()
      await fn()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // "now" and "next" chord for the look-ahead badge
  const lookahead = useMemo(() => {
    let now: string | undefined
    let next: string | undefined
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (l.kind !== 'lyric' || !l.chords.length) continue
      if (i <= active) now = l.chords[l.chords.length - 1].chord
      else if (!next) {
        next = l.chords[0].chord
        break
      }
    }
    const cur = lines[active]
    if (cur?.kind === 'lyric' && cur.chords.length > 1) next = cur.chords[1].chord
    return { now: now && resolve(now).name, next: next && resolve(next).name }
  }, [active, lines, resolve])

  const keyNow = song.key ? transposeChord(song.key, song.transpose + (song.capo - capo)) : undefined
  const progress = isThisTrack ? positionNow() : 0
  const [, force] = useState(0)
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => force((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [playing])

  let lineIdx = -1
  return (
    <div className="min-h-screen pb-44">
      {/* header */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--line)]/60 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
          <button className="btn-ghost" onClick={() => navigate('/')} aria-label="Back">←</button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold truncate">{song.title}</h1>
            <p className="text-xs text-[var(--muted)] truncate">
              {song.artist}
              {capo ? ` · Capo ${capo}` : ''}
              {keyNow ? ` · Key ${keyNow}` : ''}
              {shown.length ? ` · ${difficultyLabel(avgDifficulty)}` : ''}
            </p>
          </div>
          <button className="btn" onClick={() => setEasierOpen(true)}>Easier</button>
          <button className="btn-ghost" onClick={() => setViewOpen(true)} aria-label="View settings">Aa</button>
        </div>
        {/* chord strip */}
        {shown.length > 0 && (
          <div className="max-w-3xl mx-auto px-3 pb-2 flex gap-1 overflow-x-auto">
            {shown.map((c) => (
              <button key={c.name} onClick={() => setChordOpen(c)} className="shrink-0 relative rounded-xl hover:bg-[var(--soft)] px-0.5" aria-label={`Show ${c.name}`}>
                <ChordDiagram shape={c.shape} name={c.name} width={58} leftHanded={settings.leftHanded} showFingers={false} />
                {anyKnown && !c.known && <span className="absolute top-1 right-1 size-2 rounded-full bg-[var(--warn)]" title="Not in your chords yet" />}
                {c.swapped && <span className="absolute top-0.5 left-1 text-[10px] text-[var(--muted)]">≈{c.original}</span>}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4">
        {/* strum card */}
        <section className="card mt-4 p-3">
          <button className="w-full flex items-center justify-between text-left" onClick={() => setStrumOpen(!strumOpen)} aria-expanded={strumOpen}>
            <span className="font-semibold">Strum: {pattern.name}</span>
            <span className="text-[var(--muted)] text-sm">{strumOpen ? 'Hide' : 'Show'}</span>
          </button>
          {strumOpen && (
            <div className="mt-3">
              <StrumView pattern={pattern} active={metroOn ? stroke : -1} />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <select className="input !w-auto !py-1.5 text-sm" value={strumIdx} onChange={(e) => update({ strumIndex: Number(e.target.value) })} aria-label="Strum pattern">
                  {strums.map((s, i) => (
                    <option key={i} value={i}>
                      {i < song.strums.length ? `From tab: ${s.name}` : s.name}
                    </option>
                  ))}
                </select>
                <button className={metroOn ? 'btn-primary' : 'btn'} onClick={toggleMetro}>{metroOn ? '■ Stop' : '▶ Practice'}</button>
                <div className="flex items-center gap-1">
                  <button className="btn-ghost" onClick={() => setBpm((b) => Math.max(40, b - 4))} aria-label="Slower">−</button>
                  <span className="text-sm tabular-nums w-16 text-center">{Math.round(bpm * slow)} bpm</span>
                  <button className="btn-ghost" onClick={() => setBpm((b) => Math.min(220, b + 4))} aria-label="Faster">+</button>
                </div>
                <button
                  className="btn"
                  onClick={() => {
                    const b = tap.current()
                    if (b) (setBpm(b), setSlow(1))
                  }}
                >
                  Tap tempo
                </button>
                <div className="flex gap-1" role="group" aria-label="Practice speed">
                  {[0.5, 0.75, 1].map((s) => (
                    <button key={s} className={slow === s ? 'btn-primary !px-2.5' : 'btn !px-2.5'} onClick={() => setSlow(s)}>
                      {s * 100}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {err && <p className="mt-3 text-sm text-[var(--warn)]">{err}</p>}

        {/* sheet */}
        <article className="mt-6" style={{ fontSize: settings.fontSize }}>
          {song.sections.map((sec, si) => (
            <section key={si} className="mb-6">
              {sec.name && <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-2">{sec.name}</h2>}
              {sec.lines.map((l, li) => {
                lineIdx++
                const idx = lineIdx
                const mark = song.marks[idx]
                return (
                  <div
                    key={li}
                    data-line={idx}
                    ref={(el) => {
                      if (el) lineEls.current.set(idx, el)
                      else lineEls.current.delete(idx)
                    }}
                    onClick={() => onLineTap(idx)}
                    className={`relative rounded-md -mx-2 px-2 transition-colors ${idx === active && (autoScroll || playing) ? 'bg-[var(--hl)]' : ''} ${markMode ? 'cursor-crosshair hover:bg-[var(--soft)]' : ''}`}
                  >
                    {mark !== undefined && (
                      <button
                        className="absolute -left-1 -translate-x-full top-0 text-[10px] text-[var(--muted)] hidden sm:block"
                        onClick={(e) => (e.stopPropagation(), runSpotify(() => (isThisTrack ? seek(mark) : play(song.spotify!.uri, mark))))}
                      >
                        {fmt(mark)}
                      </button>
                    )}
                    <LineView line={l} resolve={resolve} onChord={setChordOpen} />
                  </div>
                )
              })}
            </section>
          ))}
          {song.sourceUrl && (
            <p className="text-xs text-[var(--muted)] mt-10">
              Tab from <a className="underline" href={song.sourceUrl} target="_blank" rel="noreferrer">Ultimate Guitar</a>
              {song.rating ? ` · rated ${song.rating.toFixed(1)} by ${song.votes} people` : ''}
            </p>
          )}
        </article>
      </main>

      {/* look-ahead badge */}
      {(autoScroll || playing) && lookahead.next && (
        <div className="fixed right-3 bottom-40 z-30 card px-3 py-2 shadow-lg text-right pointer-events-none">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Next</div>
          <div className="chord-name text-3xl leading-none">{lookahead.next}</div>
        </div>
      )}
      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-44 z-40 rounded-full bg-[var(--ink)] text-[var(--bg)] px-4 py-2 text-sm shadow-lg">{toast}</div>}

      {/* bottom bar */}
      <footer className="fixed bottom-0 inset-x-0 z-30 bg-[var(--panel)]/95 backdrop-blur border-t border-[var(--line)]/60 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-3xl mx-auto px-4 py-2.5 space-y-2">
          {linked ? (
            <div className="flex items-center gap-3">
              {song.spotify!.image && <img src={song.spotify!.image} alt="" className="size-10 rounded" />}
              <button className="btn-primary !rounded-full size-11 !p-0 text-lg" aria-label={playing ? 'Pause' : 'Play'} onClick={() => runSpotify(() => (playing ? pause() : toggle(song.spotify!.uri)))}>
                {playing ? '❚❚' : '▶'}
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="range"
                  min={0}
                  max={durationMs}
                  value={progress}
                  onChange={(e) => runSpotify(() => seek(Number(e.target.value)))}
                  className="w-full"
                  aria-label="Song position"
                  disabled={!isThisTrack}
                />
                <div className="flex justify-between text-[11px] text-[var(--muted)] tabular-nums">
                  <span>{fmt(progress)}</span>
                  <button className="truncate px-2 underline-offset-2 hover:underline" onClick={() => setLinkOpen(true)}>{song.spotify!.name}</button>
                  <span>{fmt(durationMs)}</span>
                </div>
              </div>
            </div>
          ) : (
            <button className="btn w-full" onClick={() => setLinkOpen(true)}>Play along with Spotify</button>
          )}
          <div className="flex items-center gap-2 overflow-x-auto">
            <button className={autoScroll ? 'btn-primary' : 'btn'} onClick={() => ((state.current.pos = window.scrollY), setAutoScroll(!autoScroll))} disabled={playing}>
              {playing ? 'Following song' : autoScroll ? '■ Scroll' : '▶ Scroll'}
            </button>
            {!playing && (
              <div className="flex items-center">
                <button className="btn-ghost" aria-label="Scroll slower" onClick={() => update({ scrollSpeed: Math.max(4, (song.scrollSpeed || defaultSpeed()) / 1.2) })}>−</button>
                <span className="text-xs text-[var(--muted)] w-12 text-center tabular-nums">{Math.round(song.scrollSpeed || defaultSpeed())} px/s</span>
                <button className="btn-ghost" aria-label="Scroll faster" onClick={() => update({ scrollSpeed: Math.min(300, (song.scrollSpeed || defaultSpeed()) * 1.2) })}>+</button>
              </div>
            )}
            {linked && (
              <>
                <button className={markMode ? 'btn-primary' : 'btn'} onClick={() => (setMarkMode(!markMode), !markMode && flash('Tap a line as the song reaches it'))} disabled={!isThisTrack}>
                  {markMode ? 'Done syncing' : 'Sync'}
                </button>
                <button className={loop ? 'btn-primary' : 'btn'} onClick={startLoop} disabled={!playing && !loop}>
                  {loop ? 'Stop loop' : 'Loop part'}
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      <ChordSheet name={chordOpen?.name ?? null} authorShape={chordOpen && !chordOpen.swapped ? chordOpen.tabShape : undefined} onClose={() => setChordOpen(null)} />

      <Sheet open={easierOpen} onClose={() => setEasierOpen(false)} title="Make it easier">
        <p className="text-sm text-[var(--muted)] mb-3">A capo lets you play easier shapes and still sound like the record, so Spotify play-along still works.</p>
        <div className="space-y-2">
          {capoOptions(written, song.capo)
            .slice(0, 4)
            .map((o) => {
              const unique = [...new Set(o.shapes)]
              const isCur = capo === o.capo && song.transpose === o.shift
              return (
                <button key={o.capo} className={`w-full text-left card p-3 ${isCur ? 'ring-2 ring-[var(--accent)]' : ''}`} onClick={() => (update({ userCapo: o.capo, transpose: o.shift }), setEasierOpen(false))}>
                  <div className="flex justify-between">
                    <span className="font-semibold">{o.capo ? `Capo ${o.capo}` : 'No capo'}{o.capo === song.capo && o.shift === 0 ? ' (as written)' : ''}</span>
                    <span className="chip">{difficultyLabel(o.score)}</span>
                  </div>
                  <div className="text-sm mt-1 chord-name">{unique.join('  ')}</div>
                </button>
              )
            })}
        </div>
        <label className="flex items-center gap-3 mt-5">
          <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={settings.showSubs} onChange={(e) => updateSettings({ showSubs: e.target.checked })} />
          <span>Swap hard chords for easier ones (e.g. F → Fmaj7, Bm → Bm7)</span>
        </label>
        <div className="mt-5">
          <h3 className="font-semibold mb-1">Change key</h3>
          <p className="text-sm text-[var(--muted)] mb-2">Moves every chord up or down. Won't match the recording.</p>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => update({ transpose: song.transpose - 1 })}>−1</button>
            <span className="w-16 text-center tabular-nums">{song.transpose > 0 ? '+' : ''}{song.transpose}</span>
            <button className="btn" onClick={() => update({ transpose: song.transpose + 1 })}>+1</button>
            <button className="btn" onClick={() => update({ transpose: 0, userCapo: undefined })}>Reset</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={viewOpen} onClose={() => setViewOpen(false)} title="View">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Text size</span>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 1) })}>A−</button>
              <span className="w-8 text-center tabular-nums">{settings.fontSize}</span>
              <button className="btn" onClick={() => updateSettings({ fontSize: Math.min(32, settings.fontSize + 1) })}>A+</button>
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span>Left-handed diagrams</span>
            <input type="checkbox" className="size-5" checked={settings.leftHanded} onChange={(e) => updateSettings({ leftHanded: e.target.checked })} />
          </label>
          {Object.keys(song.marks).length > 0 && (
            <button className="btn w-full" onClick={() => update({ marks: {} })}>Clear Spotify sync marks</button>
          )}
          <button
            className="btn w-full !text-[var(--warn)]"
            onClick={async () => {
              if (confirm(`Delete "${song.title}" from this device?`)) {
                await deleteSong(song.id)
                navigate('/')
              }
            }}
          >
            Delete song
          </button>
        </div>
      </Sheet>

      <SpotifyLink open={linkOpen} onClose={() => setLinkOpen(false)} song={song} onPick={(t) => (update({ spotify: t, marks: {} }), setLinkOpen(false))} />
    </div>
  )
}

function LineView({ line, resolve, onChord }: { line: Line; resolve: (c: string) => ShownChord; onChord: (c: ShownChord) => void }) {
  if (line.kind === 'blank') return <div className="h-3" />
  if (line.kind === 'text') return <p className="whitespace-pre-wrap text-[var(--muted)] italic py-0.5">{line.text}</p>
  if (line.kind === 'tab')
    return (
      <pre className="tab-block text-[0.8em] leading-snug overflow-x-auto py-2 my-1 rounded-lg bg-[var(--soft)] px-3">{line.text}</pre>
    )
  const chip = (c: string, key: number) => {
    const r = resolve(c)
    return (
      <button key={key} className="chord-name hover:underline underline-offset-4" onClick={(e) => (e.stopPropagation(), onChord(r))}>
        {r.name}
      </button>
    )
  }
  if (!line.text.trim()) {
    // chords on their own (intros, instrumentals): keep rough spacing
    return (
      <div className="py-1 flex flex-wrap items-baseline">
        {line.chords.map((c, i) => {
          const next = line.chords[i + 1]
          const gap = next ? Math.min(6, Math.max(1, next.col - c.col - c.chord.length)) : 0
          return (
            <span key={i} style={{ marginRight: `${gap * 0.6}em` }}>
              {chip(c.chord, i)}
            </span>
          )
        })}
      </div>
    )
  }
  // chord-over-lyric: split the lyric at each chord column so it can wrap on small screens
  const segs: { chord?: string; text: string }[] = []
  const text = line.text
  const first = line.chords[0]?.col ?? 0
  if (first > 0) segs.push({ text: text.slice(0, first) })
  line.chords.forEach((c, i) => {
    const end = line.chords[i + 1]?.col ?? Math.max(text.length, c.col)
    segs.push({ chord: c.chord, text: text.slice(c.col, end) })
  })
  // Each chord sits on the word it starts on; the rest of the piece is plain
  // text so long lines wrap on phones instead of running off the screen.
  return (
    <div className="pb-1 leading-snug">
      {segs.map((s, i) => {
        if (!s.chord) return <span key={i} className="whitespace-pre-wrap">{s.text}</span>
        const m = /^(\S*\s?)([\s\S]*)$/.exec(s.text)!
        return (
          <span key={i}>
            <span className="inline-flex flex-col align-bottom">
              <span className="whitespace-nowrap pr-[0.35em] text-[0.95em]">{chip(s.chord, i)}</span>
              <span className="whitespace-pre">{m[1] || '\u00a0'}</span>
            </span>
            <span className="whitespace-pre-wrap">{m[2]}</span>
          </span>
        )
      })}
    </div>
  )
}

function SpotifyLink({ open, onClose, song, onPick }: { open: boolean; onClose: () => void; song: Song; onPick: (t: Track) => void }) {
  const settings = useSettings()
  const [q, setQ] = useState(`${song.title} ${song.artist}`.trim())
  const [results, setResults] = useState<Track[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loggedIn = isLoggedIn()
  const run = async () => {
    setErr(null)
    setBusy(true)
    try {
      setResults(await searchTracks(q))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (open && loggedIn && !results) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Play along with Spotify">
      {!settings.spotifyClientId ? (
        <div className="space-y-3">
          <p>Spotify needs a one-time setup (about 3 minutes).</p>
          <button className="btn-primary" onClick={() => navigate('/settings')}>Set up Spotify</button>
        </div>
      ) : !loggedIn ? (
        <div className="space-y-3">
          <p>Log in with your Spotify Premium account to play songs here.</p>
          <button className="btn-primary" onClick={() => login().catch((e) => setErr(e.message))}>Log in to Spotify</button>
          {err && <p className="text-sm text-[var(--warn)]">{err}</p>}
        </div>
      ) : (
        <div>
          <form onSubmit={(e) => (e.preventDefault(), run())} className="flex gap-2">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Spotify" />
            <button className="btn-primary" disabled={busy}>Search</button>
          </form>
          {err && <p className="text-sm text-[var(--warn)] mt-2">{err}</p>}
          <ul className="mt-3 space-y-1">
            {results?.map((t) => (
              <li key={t.id}>
                <button className={`w-full flex items-center gap-3 text-left rounded-xl p-2 hover:bg-[var(--soft)] ${song.spotify?.id === t.id ? 'ring-2 ring-[var(--accent)]' : ''}`} onClick={() => onPick(t)}>
                  {t.image ? <img src={t.image} alt="" className="size-10 rounded" /> : <div className="size-10 rounded bg-[var(--soft)]" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.name}</div>
                    <div className="truncate text-sm text-[var(--muted)]">{t.artists}</div>
                  </div>
                  <span className="text-xs text-[var(--muted)] tabular-nums">{fmt(t.durationMs)}</span>
                </button>
              </li>
            ))}
            {results && !results.length && <li className="text-[var(--muted)]">Nothing found. Try fewer words.</li>}
          </ul>
        </div>
      )}
    </Sheet>
  )
}
