import { useSyncExternalStore } from 'react'

/** A JSON value in localStorage that React components can subscribe to. */
export function createLocalStore<T>(key: string, fallback: T) {
  const listeners = new Set<() => void>()
  let cache: T | undefined

  const read = (): T => {
    if (cache !== undefined) return cache
    try {
      const raw = localStorage.getItem(key)
      cache = raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      cache = fallback
    }
    return cache
  }
  const write = (next: T) => {
    cache = next
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      /* private mode etc. */
    }
    listeners.forEach((l) => l())
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const use = () => useSyncExternalStore(subscribe, read, read)
  return { read, write, use }
}
