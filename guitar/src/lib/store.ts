import { get, set, del, keys, getMany } from 'idb-keyval'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Song } from '../model/song'

// ---------- songs ----------
const songKey = (id: string) => 'song:' + id

export async function saveSong(s: Song) {
  await set(songKey(s.id), s)
  emit()
}
export async function loadSong(id: string): Promise<Song | undefined> {
  return get(songKey(id))
}
export async function deleteSong(id: string) {
  await del(songKey(id))
  emit()
}
export async function listSongs(): Promise<Song[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith('song:'))
  const songs = (await getMany(ks)) as Song[]
  return songs.filter(Boolean).sort((a, b) => (b.lastOpened ?? b.createdAt) - (a.lastOpened ?? a.createdAt))
}

let version = 0
const listeners = new Set<() => void>()
function emit() {
  version++
  listeners.forEach((l) => l())
}
export function useSongs(): Song[] | null {
  const v = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
  )
  const [songs, setSongs] = useState<Song[] | null>(null)
  useEffect(() => {
    listSongs().then(setSongs)
  }, [v])
  return songs
}

// ---------- settings (small, sync, localStorage) ----------
export interface Settings {
  known: string[] // chords the user can play
  learning: string[]
  leftHanded: boolean
  fontSize: number
  spotifyClientId: string
  showSubs: boolean
  theme: 'system' | 'light' | 'dark'
  trainerBest: Record<string, number> // "C|G" -> changes per minute
  practice: Record<string, number> // "2026-11-18" -> seconds
}

const DEFAULTS: Settings = {
  known: [],
  learning: [],
  leftHanded: false,
  fontSize: 17,
  spotifyClientId: '',
  showSubs: false,
  theme: 'system',
  trainerBest: {},
  practice: {},
}

function readSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('settings') || '{}') }
  } catch {
    return DEFAULTS
  }
}
let settings = readSettings()
const settingListeners = new Set<() => void>()

export function getSettings(): Settings {
  return settings
}
export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const p = typeof patch === 'function' ? patch(settings) : patch
  settings = { ...settings, ...p }
  try {
    localStorage.setItem('settings', JSON.stringify(settings))
  } catch {
    /* private mode: keep in memory */
  }
  settingListeners.forEach((l) => l())
}
export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (settingListeners.add(l), () => settingListeners.delete(l)),
    () => settings,
  )
}

export function today(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}
export function logPractice(seconds: number) {
  updateSettings((s) => ({ practice: { ...s.practice, [today()]: (s.practice[today()] ?? 0) + seconds } }))
}
export function streak(practice: Record<string, number>): number {
  let n = 0
  const d = new Date()
  if (!practice[today(d)]) d.setDate(d.getDate() - 1) // today not done yet doesn't break it
  while ((practice[today(d)] ?? 0) >= 60) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
