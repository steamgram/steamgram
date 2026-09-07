import { useCallback } from 'react'
import { track } from '../analytics'
import type { TagFilter } from '../types'
import { createLocalStore } from './localStore'

const EMPTY: TagFilter = { include: [], exclude: [] }

// Before exclusions existed the store held a plain list of the included tags.
const store = createLocalStore<TagFilter>('steamgram:tags', EMPTY, (stored) => {
  if (Array.isArray(stored)) return { include: stored.filter((t): t is string => typeof t === 'string'), exclude: [] }
  const f = stored as Partial<TagFilter> | null
  return { include: f?.include ?? [], exclude: f?.exclude ?? [] }
})

export type TagState = 'off' | 'include' | 'exclude'

export function tagState(filter: TagFilter, tag: string): TagState {
  return filter.include.includes(tag) ? 'include' : filter.exclude.includes(tag) ? 'exclude' : 'off'
}

/** "tagged Casual or Puzzle, without Horror", for messages about the filter. */
export function describeFilter(filter: TagFilter): string {
  const parts: string[] = []
  if (filter.include.length) parts.push(`tagged ${filter.include.join(' or ')}`)
  if (filter.exclude.length) parts.push(`without ${filter.exclude.join(' or ')}`)
  return parts.join(', ')
}

export function useTagFilter() {
  const filter = store.use()
  // Each tap moves a tag one step along off -> included -> excluded -> off.
  const toggle = useCallback((tag: string) => {
    const f = store.read()
    const include = f.include.filter((t) => t !== tag)
    const exclude = f.exclude.filter((t) => t !== tag)
    const was = tagState(f, tag)
    const next: TagFilter =
      was === 'off' ? { include: [...include, tag], exclude } : was === 'include' ? { include, exclude: [...exclude, tag] } : { include, exclude }
    store.write(next)
    track('filter_change', {
      tags: [...next.include, ...next.exclude.map((t) => `-${t}`)].join(',') || '(none)',
      count: next.include.length + next.exclude.length,
    })
  }, [])
  const clear = useCallback(() => {
    store.write(EMPTY)
    track('filter_change', { tags: '(none)', count: 0 })
  }, [])
  return { filter, toggle, clear }
}
