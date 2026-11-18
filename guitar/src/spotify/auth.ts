// Spotify Authorization Code + PKCE, all in the browser. No client secret needed.
import { getSettings } from '../lib/store'

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ')

interface Tokens {
  access: string
  refresh: string
  expires: number
}

export function redirectUri(): string {
  return location.origin + '/callback'
}

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function readTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem('spotify_tokens') || 'null')
  } catch {
    return null
  }
}
function writeTokens(t: Tokens | null) {
  if (t) localStorage.setItem('spotify_tokens', JSON.stringify(t))
  else localStorage.removeItem('spotify_tokens')
  window.dispatchEvent(new Event('spotify-auth'))
}

export function isLoggedIn(): boolean {
  return readTokens() !== null
}

export async function login(returnTo = location.hash) {
  const clientId = getSettings().spotifyClientId.trim()
  if (!clientId) throw new Error('Add your Spotify client ID in Settings first.')
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)).buffer)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem('spotify_verifier', verifier)
  sessionStorage.setItem('spotify_return', returnTo)
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: redirectUri(),
  })
  location.href = 'https://accounts.spotify.com/authorize?' + q
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getSettings().spotifyClientId.trim(), ...body }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(j.error_description || j.error || 'Spotify login failed')
  const old = readTokens()
  const t = { access: j.access_token, refresh: j.refresh_token ?? old?.refresh, expires: Date.now() + (j.expires_in - 60) * 1000 }
  writeTokens(t)
  return t
}

/** Called on /callback. Returns the hash to go back to. */
export async function finishLogin(): Promise<string> {
  const p = new URLSearchParams(location.search)
  const back = sessionStorage.getItem('spotify_return') || '#/'
  if (p.get('error')) throw new Error('Spotify: ' + p.get('error'))
  const code = p.get('code')
  const verifier = sessionStorage.getItem('spotify_verifier')
  if (!code || !verifier) throw new Error('Spotify login was interrupted. Try again.')
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier })
  sessionStorage.removeItem('spotify_verifier')
  return back
}

let refreshing: Promise<Tokens> | null = null
export async function accessToken(): Promise<string> {
  const t = readTokens()
  if (!t) throw new Error('Not logged in to Spotify')
  if (Date.now() < t.expires) return t.access
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh }).finally(() => (refreshing = null))
  try {
    return (await refreshing).access
  } catch (e) {
    writeTokens(null)
    throw e
  }
}

export function logout() {
  writeTokens(null)
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken()
  const res = await fetch('https://api.spotify.com/v1' + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (res.status === 204 || res.status === 202) return undefined as T
  const text = await res.text()
  const j = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const msg = j?.error?.message || res.statusText
    if (res.status === 404 && /device/i.test(msg)) throw new Error('No active Spotify device. Open the Spotify app on this device and press play once, then try again.')
    if (res.status === 403) throw new Error('Spotify refused: ' + msg + ' (Premium is required for playback control.)')
    throw new Error('Spotify: ' + msg)
  }
  return j as T
}
