import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'steamgram:likes'
const listeners = new Set<() => void>()
let cache: Set<number> | null = null

function read(): Set<number> {
  if (cache) return cache
  try {
    cache = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[])
  } catch {
    cache = new Set()
  }
  return cache
}

function write(next: Set<number>) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    /* private mode etc. */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useLikes() {
  const likes = useSyncExternalStore(subscribe, read, read)
  const toggle = useCallback((appid: number) => {
    const next = new Set(read())
    if (next.has(appid)) next.delete(appid)
    else next.add(appid)
    write(next)
  }, [])
  return { likes, toggle, isLiked: (id: number) => likes.has(id) }
}
