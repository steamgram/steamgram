import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchFeed, fetchGame } from '../api'
import { track } from '../analytics'
import type { Game } from '../types'
import { GameCard } from './GameCard'
import type { MediaHandle } from './MediaCarousel'
import { Logo } from './Logo'
import { About } from './About'
import { SavedSheet } from './SavedSheet'
import { FilterSheet } from './FilterSheet'
import { useSaved } from '../hooks/useSaved'
import { describeFilter, useTagFilter } from '../hooks/useTagFilter'

export function Feed() {
  // A shared link (?game=APPID) opens the feed on that game.
  const [linkedAppid] = useState(() => {
    const id = Number(new URLSearchParams(window.location.search).get('game'))
    return Number.isInteger(id) && id > 0 ? id : null
  })

  const { filter, toggle: toggleTag, clear: clearTags } = useTagFilter()
  const chosen = filter.include.length + filter.exclude.length
  const { saved, toggle: toggleSave, remove: removeSaved, isSaved } = useSaved()

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, error } = useInfiniteQuery({
    queryKey: ['feed', linkedAppid, filter],
    initialPageParam: [] as number[],
    queryFn: async ({ pageParam }) => {
      if (pageParam.length === 0 && linkedAppid) {
        const [linked, page] = await Promise.all([fetchGame(linkedAppid), fetchFeed([linkedAppid], filter)])
        return linked ? { ...page, games: [linked, ...page.games] } : page
      }
      return fetchFeed(pageParam, filter)
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
  const media = useRef<MediaHandle>(null) // media strip of the card on screen

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
  }, [filter])

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

  // Keyboard, WASD like the logo: W / S move the feed, A / D the media strip, M toggles sound.
  // Held ← / → rewind and fast-forward the trailer, like a finger held on it.
  // Physical key codes, so the cluster stays in place on non-Latin keyboard layouts.
  useEffect(() => {
    const isSeekKey = (e: KeyboardEvent) => e.code === 'ArrowLeft' || e.code === 'ArrowRight'
    const onKey = (e: KeyboardEvent) => {
      if (sheet || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return
      if (e.code === 'KeyW') scrollTo(Math.max(active - 1, 0))
      else if (e.code === 'KeyS') scrollTo(Math.min(active + 1, games.length - 1))
      else if (e.code === 'KeyA') media.current?.step(-1)
      else if (e.code === 'KeyD') media.current?.step(1)
      else if (e.code === 'KeyM') setMuted((m) => !m)
      else if (isSeekKey(e)) {
        e.preventDefault() // the strip would scroll sideways otherwise
        if (!e.repeat) media.current?.hold(e.code === 'ArrowLeft' ? 'back' : 'forward')
      }
    }
    // Key up, or the window losing focus mid-hold, lets go.
    const release = (e: Event) => {
      if (!(e instanceof KeyboardEvent) || isSeekKey(e)) media.current?.release()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', release)
    }
  }, [active, games.length, scrollTo, sheet])

  if (isPending) return <Splash text="Warming up the trailer reel…" />
  if (error) return <Splash text={`Could not reach the server :(.`} />
  if (games.length === 0) return <Splash text="The pool is empty. Let the crawler run for a minute and refresh." />

  return (
    <div className="relative h-dvh bg-black">
      {/* With the info hidden the header folds down to the mark and the two actions: less noise over the trailer. */}
      <header className="safe-top pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pb-3 text-white sm:px-6">
        <button
          type="button"
          aria-label="About SteamGram"
          onClick={() => {
            track('open_about')
            setSheet('about')
          }}
          className="pointer-events-auto flex items-center rounded-full bg-black/45 px-2 py-1 ring-1 ring-white/15 backdrop-blur-sm transition hover:bg-black/60"
        >
          <Logo className="h-6 w-auto" />
          <Collapse open={showInfo} side="left">
            <span className="pl-2 pr-1 text-lg font-black tracking-tight">
              Steam<span className="text-steam">Gram</span>
            </span>
          </Collapse>
        </button>
        <div className="pointer-events-auto flex items-center">
          <div className="flex items-center gap-1.5">
            <HeaderButton
              label="Filter by tags"
              active={chosen > 0}
              badge={chosen || undefined}
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
          </div>
          <Collapse open={showInfo} side="right">
            <span className="ml-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-white/15 backdrop-blur-sm">
              {(matching ?? pool).toLocaleString()} games
            </span>
          </Collapse>
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
              mediaRef={i === active ? media : undefined}
            />
          </div>
        ))}
        {isFetchingNextPage && <div className="flex h-24 items-center justify-center text-sm text-zinc-500">Loading more…</div>}
        {!hasNextPage && games.length > 0 && (
          <div className="flex h-dvh snap-start flex-col items-center justify-center gap-4 bg-[#0b0f17] p-8 text-center text-zinc-300">
            <Logo className="h-16 w-auto" />
            <p className="max-w-xs text-sm">
              {chosen ? `That is every game ${describeFilter(filter)}. Loosen the filter for more.` : 'You reached the end of the reel. Come back later, the crawler never sleeps.'}
            </p>
            {chosen > 0 && (
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
        <FilterSheet filter={filter} matching={matching} onToggle={toggleTag} onClear={clearTags} onClose={() => setSheet(null)} />
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
      className={`relative flex h-8 w-8 items-center justify-center rounded-full ring-1 backdrop-blur-sm transition ${
        active ? 'bg-steam text-black ring-white/30' : 'bg-black/45 text-white ring-white/15 hover:bg-black/60'
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

/**
 * Header chrome that folds away sideways: its grid column closes to nothing while
 * the content slides under its neighbour and fades, so nothing pops in or out.
 */
function Collapse({ open, side, children }: { open: boolean; side: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <span className={`grid transition-[grid-template-columns] duration-300 ease-out ${open ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'}`}>
      {/* a pixel of padding, taken back by the margin, keeps rings out of the clip */}
      <span className="-m-px min-w-0 overflow-hidden p-px">
        <span
          className={`flex w-max items-center whitespace-nowrap transition-[opacity,transform] duration-300 ease-out ${
            open ? 'translate-x-0 opacity-100' : `opacity-0 ${side === 'left' ? '-translate-x-2' : 'translate-x-2'}`
          }`}
        >
          {children}
        </span>
      </span>
    </span>
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
