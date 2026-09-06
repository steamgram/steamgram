import type { FeedPage, Game } from './types'

export async function fetchFeed(exclude: number[], limit = 8): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (exclude.length) params.set('exclude', exclude.slice(-400).join(','))
  const res = await fetch(`/api/feed?${params}`)
  if (!res.ok) throw new Error(`feed ${res.status}`)
  return res.json()
}

export async function fetchGame(appid: number): Promise<Game | null> {
  const res = await fetch(`/api/games/${appid}`)
  return res.ok ? res.json() : null
}
