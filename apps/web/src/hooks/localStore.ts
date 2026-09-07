import { useSyncExternalStore } from 'react'

/** A JSON value in localStorage that React components can subscribe to. `migrate` reshapes values saved by older versions. */
export function createLocalStore<T>(key: string, fallback: T, migrate: (stored: unknown) => T = (v) => v as T) {
  const listeners = new Set<() => void>()
  let cache: T | undefined

  const read = (): T => {
    if (cache !== undefined) return cache
    try {
      const raw = localStorage.getItem(key)
      cache = raw ? migrate(JSON.parse(raw)) : fallback
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
