import { useSyncExternalStore } from 'react'

const sub = (l: () => void) => (window.addEventListener('hashchange', l), () => window.removeEventListener('hashchange', l))
export function useRoute(): string {
  return useSyncExternalStore(sub, () => location.hash.replace(/^#/, '') || '/')
}
export function navigate(path: string) {
  location.hash = path
  window.scrollTo(0, 0)
}
