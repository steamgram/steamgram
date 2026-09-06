import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFeed } from '../api'
import { useLikes } from '../hooks/useLikes'
import type { Game } from '../types'
import { GameCard } from './GameCard'

export function Feed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, error } = useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: [] as number[],
    queryFn: ({ pageParam }) => fetchFeed(pageParam),
    getNextPageParam: (last, pages) => (last.games.length === 0 ? undefined : pages.flatMap((p) => p.games.map((g) => g.appid))),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const games: Game[] = useMemo(() => {
    const seen = new Set<number>()
    return (data?.pages ?? []).flatMap((p) => p.games).filter((g) => (seen.has(g.appid) ? false : (seen.add(g.appid), true)))
  }, [data])
  const pool = data?.pages[0]?.pool ?? 0

  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)
  const { likes, toggle } = useLikes()
  const containerRef = useRef<HTMLDivElement>(null)

  // Track which card is on screen.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            setActive(Number((e.target as HTMLElement).dataset.index))
          }
        }
      },
      { root, threshold: [0.6] },
    )
    root.querySelectorAll<HTMLElement>('[data-index]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [games.length])

  // Prefetch when we are close to the end.
  useEffect(() => {
    if (games.length - active <= 3 && hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [active, games.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const scrollTo = useCallback((i: number) => {
    const root = containerRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>(`[data-index="${i}"]`)
    target?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Keyboard: j/k, arrows, space; m to mute; l to like.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (['ArrowDown', 'j', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); scrollTo(Math.min(active + 1, games.length - 1)) }
      else if (['ArrowUp', 'k', 'PageUp'].includes(e.key)) { e.preventDefault(); scrollTo(Math.max(active - 1, 0)) }
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 'l' && games[active]) toggle(games[active].appid)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, games, scrollTo, toggle])

  if (isPending) return <Splash text="Warming up the trailer reel…" />
  if (error) return <Splash text={`Could not reach the API: ${(error as Error).message}. Is \`pnpm dev:api\` running?`} />
  if (games.length === 0) return <Splash text="The pool is empty. Let the crawler run for a minute and refresh." />

  return (
    <div className="relative h-dvh bg-black">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <div className="flex items-baseline gap-2 rounded-full bg-black/35 px-3 py-1 backdrop-blur-sm">
          <span className="text-lg font-black tracking-tight">Steam<span className="text-steam">Gram</span></span>
          <span className="text-xs text-zinc-300">{pool.toLocaleString()} games</span>
        </div>
        <span className="rounded-full bg-black/35 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
          {active + 1}/{games.length} · {likes.size} liked
        </span>
      </header>

      <div ref={containerRef} className="feed h-dvh snap-y snap-mandatory overflow-y-scroll">
        {games.map((g, i) => (
          <div key={g.appid} data-index={i}>
            <GameCard
              game={g}
              active={i === active}
              nearby={Math.abs(i - active) <= 1}
              muted={muted}
              liked={likes.has(g.appid)}
              onToggleMute={() => setMuted((m) => !m)}
              onToggleLike={() => toggle(g.appid)}
            />
          </div>
        ))}
        {isFetchingNextPage && <div className="flex h-24 items-center justify-center text-sm text-zinc-500">Loading more…</div>}
      </div>
    </div>
  )
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0b0f17] p-8 text-center text-zinc-300">
      <span className="text-3xl font-black tracking-tight text-white">Steam<span className="text-steam">Gram</span></span>
      <p className="max-w-md text-sm">{text}</p>
    </div>
  )
}
