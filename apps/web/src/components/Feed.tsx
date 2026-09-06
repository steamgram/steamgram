import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFeed, fetchGame } from '../api'
import { track } from '../analytics'
import type { Game } from '../types'
import { GameCard } from './GameCard'
import { Logo } from './Logo'
import { About } from './About'
import { SavedSheet } from './SavedSheet'
import { FilterSheet } from './FilterSheet'
import { useSaved } from '../hooks/useSaved'
import { useTagFilter } from '../hooks/useTagFilter'

export function Feed() {
  // A shared link (?game=APPID) opens the feed on that game.
  const [linkedAppid] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('game'))
    return Number.isInteger(id) && id > 0 ? id : null
  })

  const { tags, toggle: toggleTag, clear: clearTags } = useTagFilter()
  const { saved, toggle: toggleSave, remove: removeSaved, isSaved } = useSaved()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, error } = useInfiniteQuery({
    queryKey: ['feed', linkedAppid, tags],
    initialPageParam: [] as number[],
    queryFn: async ({ pageParam }) => {
      if (pageParam.length === 0 && linkedAppid) {
        const [linked, page] = await Promise.all([fetchGame(linkedAppid), fetchFeed([linkedAppid], tags)])
        return linked ? { ...page, games: [linked, ...page.games] } : page
      }
      return fetchFeed(pageParam, tags)
    },
    getNextPageParam: (last, pages) => (last.games.length < 8 ? undefined : pages.flatMap((p) => p.games.map((g) => g.appid))),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const games: Game[] = useMemo(() => {
    const seen = new Set<number>()
    return (data?.pages ?? []).flatMap((p) => p.games).filter((g) => (seen.has(g.appid) ? false : (seen.add(g.appid), true)))
  }, [data])
  const pool = data?.pages[0]?.pool ?? 0
  const matching = data?.pages[0]?.matching ?? null

  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'about' | 'saved' | 'filter' | null>(null)
  const [showInfo, setShowInfo] = useState(() => {
    try {
      return localStorage.getItem('steamgram:showInfo') !== '0'
    } catch {
      return true
    }
  })
  const toggleInfo = useCallback(() => {
    setShowInfo((v) => {
      try {
        localStorage.setItem('steamgram:showInfo', v ? '0' : '1')
      } catch {
        /* ignore */
      }
      track('toggle_info', { visible: !v })
      return !v
    })
  }, [])
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

  // A new filter means a new feed: back to the top.
  useEffect(() => {
    setActive(0)
    containerRef.current?.scrollTo({ top: 0 })
  }, [tags])

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
      if (e.target instanceof HTMLInputElement || sheet) return
      if (['ArrowDown', 'j', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); scrollTo(Math.min(active + 1, games.length - 1)) }
      else if (['ArrowUp', 'k', 'PageUp'].includes(e.key)) { e.preventDefault(); scrollTo(Math.max(active - 1, 0)) }
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 'i') toggleInfo()
      else if (e.key === 'b' && games[active]) toggleSave(games[active])
      else if (e.key === 's' && games[active]) share(games[active])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, games, scrollTo, share, sheet, toggleInfo, toggleSave])

  if (isPending) return <Splash text="Warming up the trailer reel…" />
  if (error) return <Splash text={`Could not reach the API: ${(error as Error).message}. Is \`pnpm dev:api\` running?`} />
  if (games.length === 0) return <Splash text="The pool is empty. Let the crawler run for a minute and refresh." />

  return (
    <div className="relative h-dvh bg-black">
      <header className="safe-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-3 text-white sm:px-6">
        <button
          type="button"
          aria-label="About SteamGram"
          onClick={() => {
            track('open_about')
            setSheet('about')
          }}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/35 py-1 pl-2 pr-3 backdrop-blur-sm transition hover:bg-black/50"
        >
          <Logo className="h-6 w-auto" />
          <span className="text-lg font-black tracking-tight">Steam<span className="text-steam">Gram</span></span>
        </button>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <HeaderButton
            label="Filter by tags"
            active={tags.length > 0}
            badge={tags.length || undefined}
            onClick={() => {
              track('open_filter')
              setSheet('filter')
            }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18l-7 8v5l-4 2v-7z" />
            </svg>
          </HeaderButton>
          <HeaderButton
            label="Saved games"
            badge={saved.length || undefined}
            onClick={() => {
              track('open_saved', { count: saved.length })
              setSheet('saved')
            }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
            </svg>
          </HeaderButton>
          <span className="rounded-full bg-black/35 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-sm">
            {(matching ?? pool).toLocaleString()} games
          </span>
        </div>
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
              showInfo={showInfo}
              onToggleInfo={toggleInfo}
              saved={isSaved(g.appid)}
              onToggleSave={() => toggleSave(g)}
            />
          </div>
        ))}
        {isFetchingNextPage && <div className="flex h-24 items-center justify-center text-sm text-zinc-500">Loading more…</div>}
        {!hasNextPage && games.length > 0 && (
          <div className="flex h-dvh snap-start flex-col items-center justify-center gap-4 bg-[#0b0f17] p-8 text-center text-zinc-300">
            <Logo className="h-16 w-auto" />
            <p className="max-w-xs text-sm">
              {tags.length ? `That is every game tagged ${tags.join(', ')}. Loosen the filter for more.` : 'You reached the end of the reel. Come back later, the crawler never sleeps.'}
            </p>
            {tags.length > 0 && (
              <button type="button" onClick={clearTags} className="rounded-full bg-steam px-4 py-2 text-sm font-semibold text-black">
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {sheet === 'about' && <About pool={pool} onClose={() => setSheet(null)} />}
      {sheet === 'saved' && <SavedSheet saved={saved} onRemove={removeSaved} onClose={() => setSheet(null)} />}
      {sheet === 'filter' && (
        <FilterSheet selected={tags} matching={matching} onToggle={toggleTag} onClear={clearTags} onClose={() => setSheet(null)} />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  )
}

function HeaderButton({
  children,
  label,
  badge,
  active,
  onClick,
}: {
  children: React.ReactNode
  label: string
  badge?: number
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition ${
        active ? 'bg-steam text-black' : 'bg-black/35 text-white hover:bg-black/50'
      }`}
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black">
          {badge}
        </span>
      ) : null}
    </button>
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
