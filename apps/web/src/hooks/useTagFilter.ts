import { useCallback } from 'react'
import { track } from '../analytics'
import { createLocalStore } from './localStore'

const store = createLocalStore<string[]>('steamgram:tags', [])

export function useTagFilter() {
  const tags = store.use()
  const toggle = useCallback((tag: string) => {
    const list = store.read()
    const next = list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]
    store.write(next)
    track('filter_change', { tags: next.join(',') || '(none)', count: next.length })
  }, [])
  const clear = useCallback(() => {
    store.write([])
    track('filter_change', { tags: '(none)', count: 0 })
  }, [])
  return { tags, toggle, clear }
}
