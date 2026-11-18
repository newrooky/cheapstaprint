import { useEffect, useState } from 'react'
import { useRoute, navigate } from './lib/router'
import { HomePage } from './pages/HomePage'
import { SongPage } from './pages/SongPage'
import { ChordsPage } from './pages/ChordsPage'
import { TunerPage } from './pages/TunerPage'
import { SettingsPage } from './pages/SettingsPage'
import { finishLogin } from './spotify/auth'
import { useSettings } from './lib/store'

function useTheme() {
  const { theme } = useSettings()
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export function App() {
  useTheme()
  const route = useRoute()
  const [authMsg, setAuthMsg] = useState<string | null>(location.pathname === '/callback' ? 'Connecting to Spotify…' : null)

  useEffect(() => {
    if (location.pathname !== '/callback') return
    finishLogin()
      .then((back) => {
        history.replaceState(null, '', '/' + back)
        setAuthMsg(null)
        dispatchEvent(new HashChangeEvent('hashchange'))
      })
      .catch((e) => setAuthMsg(e.message))
  }, [])

  if (authMsg)
    return (
      <div className="p-6">
        <p>{authMsg}</p>
        <button className="btn mt-4" onClick={() => (history.replaceState(null, '', '/'), setAuthMsg(null), navigate('/'))}>Back</button>
      </div>
    )

  const song = /^\/song\/(.+)$/.exec(route)
  if (song) return <SongPage id={song[1]} />
  if (route === '/chords') return <ChordsPage />
  if (route === '/tuner') return <TunerPage />
  if (route === '/settings') return <SettingsPage />
  return <HomePage />
}

export function TopBar({ title, back = true }: { title: string; back?: boolean }) {
  return (
    <header className="sticky top-0 z-30 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--line)]/60 pt-[env(safe-area-inset-top)]">
      <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2 min-h-14">
        {back && <button className="btn-ghost" onClick={() => navigate('/')} aria-label="Back">←</button>}
        <h1 className="font-semibold text-lg">{title}</h1>
      </div>
    </header>
  )
}
