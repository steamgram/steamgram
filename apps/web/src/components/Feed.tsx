import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFeed, fetchGame } from '../api'
import { track } from '../analytics'
import type { Game } from '../types'
import { GameCard } from './GameCard'
import { Logo } from './Logo'

export function Feed() {
  // A shared link (?game=APPID) opens the feed on that game.
  const [linkedAppid] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('game'))
    return Number.isInteger(id) && id > 0 ? id : null
  })

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, error } = useInfiniteQuery({
    queryKey: ['feed', linkedAppid],
    initialPageParam: [] as number[],
    queryFn: async ({ pageParam }) => {
      if (pageParam.length === 0 && linkedAppid) {
        const [linked, page] = await Promise.all([fetchGame(linkedAppid), fetchFeed([linkedAppid])])
        return linked ? { ...page, games: [linked, ...page.games] } : page
      }
      return fetchFeed(pageParam)
    },
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
  const [toast, setToast] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const share = useCallback(async (g: Game) => {
    const url = `${window.location.origin}/?game=${g.appid}`
    const payload = { title: g.name, text: `${g.name} on SteamGram`, url }
    track('share', { appid: g.appid, game: g.name, method: 'share' in navigator ? 'native' : 'copy' })
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
        await navigator.share(payload)
        return
      }
      setToast((await copyToClipboard(url)) ? 'Link copied' : 'Could not copy link')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setToast('Could not share')
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1600)
    return () => clearTimeout(t)
  }, [toast])

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

  // Analytics: one event per card that reaches the screen.
  useEffect(() => {
    const g = games[active]
    if (g) track('game_view', { appid: g.appid, game: g.name, position: active + 1 })
  }, [active, games])

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

  // Keyboard: j/k, arrows, space; m to mute; s to share.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (['ArrowDown', 'j', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); scrollTo(Math.min(active + 1, games.length - 1)) }
      else if (['ArrowUp', 'k', 'PageUp'].includes(e.key)) { e.preventDefault(); scrollTo(Math.max(active - 1, 0)) }
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 's' && games[active]) share(games[active])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, games, scrollTo, share])

  if (isPending) return <Splash text="Warming up the trailer reel…" />
  if (error) return <Splash text={`Could not reach the API: ${(error as Error).message}. Is \`pnpm dev:api\` running?`} />
  if (games.length === 0) return <Splash text="The pool is empty. Let the crawler run for a minute and refresh." />

  return (
    <div className="relative h-dvh bg-black">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-3 pt-5 text-white sm:px-6">
        <div className="flex items-center gap-2 rounded-full bg-black/35 py-1 pl-2 pr-3 backdrop-blur-sm">
          <Logo className="h-6 w-auto" />
          <span className="text-lg font-black tracking-tight">Steam<span className="text-steam">Gram</span></span>
        </div>
        <span className="rounded-full bg-black/35 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
          {pool.toLocaleString()} games
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
              onToggleMute={() => {
                if (muted) track('unmute', { appid: g.appid })
                setMuted((m) => !m)
              }}
              onShare={() => share(g)}
            />
          </div>
        ))}
        {isFetchingNextPage && <div className="flex h-24 items-center justify-center text-sm text-zinc-500">Loading more…</div>}
      </div>

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  )
}

/** Async clipboard first; fall back to the legacy copy command for browsers or contexts that refuse it. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}

function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-[#0b0f17] p-8 text-center text-zinc-300">
      <Logo className="h-28 w-auto" pulse />
      <span className="text-3xl font-black tracking-tight text-white">Steam<span className="text-steam">Gram</span></span>
      <p className="max-w-md text-sm">{text}</p>
    </div>
  )
}
