// One player interface over two Spotify paths:
//  - "sdk": the Web Playback SDK makes this browser tab a Spotify speaker (desktop, Android)
//  - "connect": remote-control the Spotify app via the Web API (iPhone/iPad, where the SDK doesn't run)
import { useSyncExternalStore } from 'react'
import { accessToken, api, isLoggedIn } from './auth'

export interface PlayerState {
  mode: 'sdk' | 'connect' | null
  ready: boolean
  playing: boolean
  uri?: string
  durationMs: number
  /** position at `at` (performance.now()) */
  positionMs: number
  at: number
  error?: string
}

let state: PlayerState = { mode: null, ready: false, playing: false, durationMs: 0, positionMs: 0, at: 0 }
const subs = new Set<() => void>()
function setState(p: Partial<PlayerState>) {
  state = { ...state, ...p }
  subs.forEach((s) => s())
}
export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (l) => (subs.add(l), () => subs.delete(l)),
    () => state,
  )
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Current position, extrapolated between Spotify updates. */
export function positionNow(): number {
  if (!state.playing) return state.positionMs
  return Math.min(state.durationMs || Infinity, state.positionMs + (performance.now() - state.at))
}

// ---------------- SDK ----------------
/* eslint-disable @typescript-eslint/no-explicit-any */
let sdkPlayer: any = null
let deviceId: string | null = null
let initPromise: Promise<void> | null = null

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as any
    if (w.Spotify) return resolve()
    w.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.onerror = () => reject(new Error('Could not load the Spotify player'))
    document.head.appendChild(s)
  })
}

async function initSdk(): Promise<void> {
  await loadSdk()
  const w = window as any
  sdkPlayer = new w.Spotify.Player({
    name: 'Fretboard',
    getOAuthToken: (cb: (t: string) => void) => accessToken().then(cb, () => {}),
    volume: 0.8,
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Spotify player did not start. Check Premium and try again.')), 15000)
    sdkPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
      clearTimeout(timer)
      deviceId = device_id
      setState({ mode: 'sdk', ready: true, error: undefined })
      resolve()
    })
    sdkPlayer.addListener('not_ready', () => setState({ ready: false }))
    for (const ev of ['initialization_error', 'authentication_error', 'account_error']) {
      sdkPlayer.addListener(ev, ({ message }: { message: string }) => {
        clearTimeout(timer)
        setState({ error: message })
        reject(new Error(message))
      })
    }
    sdkPlayer.addListener('player_state_changed', (s: any) => {
      if (!s) return
      setState({
        playing: !s.paused,
        positionMs: s.position,
        at: performance.now(),
        durationMs: s.duration,
        uri: s.track_window?.current_track?.uri,
      })
    })
    sdkPlayer.connect()
  })
}

// ---------------- Connect ----------------
let pollTimer: number | undefined
async function pollConnect() {
  try {
    const s = await api<any>('/me/player')
    if (s?.item) {
      setState({ playing: s.is_playing, positionMs: s.progress_ms, at: performance.now(), durationMs: s.item.duration_ms, uri: s.item.uri, ready: true })
    } else setState({ playing: false })
  } catch (e) {
    setState({ error: (e as Error).message })
  }
}
function startPolling() {
  clearInterval(pollTimer)
  pollTimer = window.setInterval(pollConnect, 1000)
  pollConnect()
}

// ---------------- public ----------------
export function initPlayer(): Promise<void> {
  if (!isLoggedIn()) return Promise.reject(new Error('Log in to Spotify first'))
  initPromise ??= (async () => {
    if (isIOS()) {
      setState({ mode: 'connect', ready: true })
      startPolling()
      return
    }
    try {
      await initSdk()
    } catch (e) {
      // fall back to controlling another device
      setState({ mode: 'connect', ready: true, error: (e as Error).message })
      startPolling()
    }
  })().catch((e) => {
    initPromise = null
    throw e
  })
  return initPromise
}

export async function play(uri: string, positionMs = 0) {
  await initPlayer()
  if (state.mode === 'sdk') {
    sdkPlayer?.activateElement?.() // needed on mobile browsers, must run in a tap handler
    await api(`/me/player/play?device_id=${deviceId}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.round(positionMs) }) })
  } else {
    await api('/me/player/play', { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.round(positionMs) }) })
    setState({ playing: true, uri, positionMs, at: performance.now() })
  }
}

export async function toggle(uri: string) {
  if (state.uri !== uri) return play(uri, 0)
  if (state.playing) return pause()
  return resume()
}

export async function pause() {
  setState({ playing: false, positionMs: positionNow(), at: performance.now() })
  if (state.mode === 'sdk') await sdkPlayer.pause()
  else await api('/me/player/pause', { method: 'PUT' })
}

export async function resume() {
  if (state.mode === 'sdk') {
    sdkPlayer?.activateElement?.()
    await sdkPlayer.resume()
  } else {
    await api('/me/player/play', { method: 'PUT' })
    setState({ playing: true, at: performance.now() })
  }
}

export async function seek(ms: number) {
  const p = Math.max(0, Math.round(ms))
  setState({ positionMs: p, at: performance.now() })
  if (state.mode === 'sdk') await sdkPlayer.seek(p)
  else await api(`/me/player/seek?position_ms=${p}`, { method: 'PUT' })
}

export interface Track {
  id: string
  uri: string
  name: string
  artists: string
  durationMs: number
  image?: string
}

export async function searchTracks(q: string): Promise<Track[]> {
  const j = await api<any>(`/search?type=track&limit=8&q=${encodeURIComponent(q)}`)
  return (j?.tracks?.items ?? []).map((t: any) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a: any) => a.name).join(', '),
    durationMs: t.duration_ms,
    image: t.album?.images?.at(-1)?.url,
  }))
}
