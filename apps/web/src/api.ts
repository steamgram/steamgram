import type { FeedPage, Game, TagCount, TagFilter } from './types'

export async function fetchFeed(exclude: number[], filter: TagFilter, limit = 8): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (exclude.length) params.set('exclude', exclude.slice(-400).join(','))
  if (filter.include.length) params.set('tags', filter.include.join(','))
  if (filter.exclude.length) params.set('without', filter.exclude.join(','))
  const res = await fetch(`/api/feed?${params}`)
  if (!res.ok) throw new Error(`feed ${res.status}`)
  return res.json()
}

export async function fetchGame(appid: number): Promise<Game | null> {
  const res = await fetch(`/api/games/${appid}`)
  return res.ok ? res.json() : null
}

export async function fetchGames(ids: number[]): Promise<Game[]> {
  if (ids.length === 0) return []
  const res = await fetch(`/api/games?ids=${ids.join(',')}`)
  if (!res.ok) throw new Error(`games ${res.status}`)
  return (await res.json()).games
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch('/api/tags')
  if (!res.ok) throw new Error(`tags ${res.status}`)
  return (await res.json()).tags
}
