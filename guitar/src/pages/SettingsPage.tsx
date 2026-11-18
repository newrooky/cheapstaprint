import { useEffect, useState } from 'react'
import { TopBar } from '../App'
import { getSettings, listSongs, saveSong, updateSettings, useSettings } from '../lib/store'
import { isLoggedIn, login, logout, redirectUri } from '../spotify/auth'
import type { Song } from '../model/song'

export function SettingsPage() {
  const settings = useSettings()
  const [id, setId] = useState(settings.spotifyClientId)
  const [logged, setLogged] = useState(isLoggedIn())
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const f = () => setLogged(isLoggedIn())
    addEventListener('spotify-auth', f)
    return () => removeEventListener('spotify-auth', f)
  }, [])

  const backup = async () => {
    const data = { settings: getSettings(), songs: await listSongs() }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    a.download = `fretboard-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const restore = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as { settings?: object; songs?: Song[] }
      if (data.settings) updateSettings(data.settings)
      for (const s of data.songs ?? []) await saveSong(s)
      setMsg(`Restored ${data.songs?.length ?? 0} songs.`)
    } catch {
      setMsg('That file is not a Fretboard backup.')
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <TopBar title="Settings" />
      <main className="max-w-2xl mx-auto px-4 space-y-6 mt-5">
        <section className="card p-4">
          <h2 className="font-semibold">Spotify</h2>
          {logged ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-green-600">● Connected</span>
              <button className="btn" onClick={logout}>Log out</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)] mt-1">Playback needs Spotify Premium and a free developer app of your own. One-time setup:</p>
              <ol className="list-decimal pl-5 text-sm space-y-1.5 mt-3">
                <li>Open <a className="underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> and log in.</li>
                <li>Click <b>Create app</b>. Any name works, e.g. "Fretboard".</li>
                <li>In <b>Redirect URIs</b>, paste this exact address:
                  <div className="flex gap-2 mt-1">
                    <code className="input !py-1.5 text-xs break-all">{redirectUri()}</code>
                    <button className="btn shrink-0" onClick={() => navigator.clipboard.writeText(redirectUri()).then(() => setMsg('Copied'))}>Copy</button>
                  </div>
                </li>
                <li>Tick <b>Web API</b> and <b>Web Playback SDK</b>, accept the terms, and save.</li>
                <li>Open the app's <b>Settings</b>, copy the <b>Client ID</b>, and paste it below.</li>
              </ol>
              <div className="flex gap-2 mt-3">
                <input className="input" placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value.trim())} aria-label="Spotify client ID" />
                <button className="btn-primary shrink-0" disabled={!id} onClick={() => { updateSettings({ spotifyClientId: id }); login('#/settings').catch((e) => setMsg(e.message)) }}>
                  Save and log in
                </button>
              </div>
            </>
          )}
        </section>

        <section className="card p-4 space-y-4">
          <h2 className="font-semibold">Display</h2>
          <div className="flex items-center justify-between">
            <span>Theme</span>
            <div className="flex gap-1">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} className={settings.theme === t ? 'btn-primary' : 'btn'} onClick={() => updateSettings({ theme: t })}>{t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span>Left-handed chord diagrams</span>
            <input type="checkbox" className="size-5" checked={settings.leftHanded} onChange={(e) => updateSettings({ leftHanded: e.target.checked })} />
          </label>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">Backup</h2>
          <p className="text-sm text-[var(--muted)] mt-1">Songs live on this device only. Save a backup file to move them to another phone or laptop.</p>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={backup}>Save backup</button>
            <label className="btn cursor-pointer">
              Restore
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </label>
          </div>
        </section>
        {msg && <p className="text-sm">{msg}</p>}
        <p className="text-xs text-[var(--muted)]">Tabs fetched from Ultimate Guitar are for your personal practice. Fetching can stop working if their site changes; pasting a tab always works.</p>
      </main>
    </div>
  )
}
