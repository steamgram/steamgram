import { useState } from 'react'
import { track } from '../analytics'
import type { Game } from '../types'
import { MediaCarousel } from './MediaCarousel'

type Props = {
  game: Game
  active: boolean
  nearby: boolean
  muted: boolean
  onToggleMute: () => void
  onShare: () => void
}

function reviewColor(pct: number | null) {
  if (pct === null) return 'text-zinc-400'
  if (pct >= 80) return 'text-sky-300'
  if (pct >= 60) return 'text-amber-300'
  return 'text-rose-400'
}

function year(date: string | null) {
  const m = date?.match(/\d{4}/)
  return m ? m[0] : null
}

export function GameCard({ game, active, nearby, muted, onToggleMute, onShare }: Props) {
  const storeUrl = `https://store.steampowered.com/app/${game.appid}/`
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      <MediaCarousel game={game} active={active} nearby={nearby} muted={muted} />

      {/* thin strip so the header never sits on pure white */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />

      {/* right action rail */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-3 sm:right-5">
        <RailButton label="Share" onClick={onShare}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </RailButton>
        <RailButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          {muted ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
            </svg>
          )}
        </RailButton>
        <a
          href={storeUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on Steam"
          onClick={() => track('open_steam', { appid: game.appid, game: game.name })}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-steam/80"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-9.97 9.2l5.36 2.22a2.83 2.83 0 0 1 1.6-.5h.16l2.38-3.46v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.13a2.83 2.83 0 0 1-5.62.44L2.4 14.6A10 10 0 1 0 12 2zm-3.7 15.2-1.23-.51a2.13 2.13 0 0 0 3.94-.1 2.12 2.12 0 0 0-1.15-2.77l-1.27-.53a1.5 1.5 0 0 1 1.96-.03l1.29.53a2.1 2.1 0 0 1-3.54 3.41zm7.03-6.7a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02zm0-4.4a1.89 1.89 0 1 0 0 3.78 1.89 1.89 0 0 0 0-3.78z" />
          </svg>
        </a>
      </div>

      {/* bottom info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-6 pt-20 sm:px-8 sm:pb-8 sm:pt-24">
        <div className="max-w-2xl">
          <div className="text-shadow mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-300">
            {game.review_summary && (
              <span className={reviewColor(game.review_percent)}>
                {game.review_summary}
                {game.review_percent !== null && <span className="text-zinc-400"> · {game.review_percent}%</span>}
                {game.review_count !== null && <span className="text-zinc-500"> · {game.review_count.toLocaleString()} reviews</span>}
              </span>
            )}
            {year(game.release_date) && <span className="text-zinc-500">· {year(game.release_date)}</span>}
            {game.price_formatted && (
              <span className="text-zinc-500">
                · {game.is_free ? 'Free' : game.price_formatted}
                {game.discount_percent ? <span className="text-emerald-300"> (−{game.discount_percent}%)</span> : null}
              </span>
            )}
            {game.metacritic ? <span className="text-zinc-500">· Metacritic {game.metacritic}</span> : null}
          </div>

          <h2 className="text-shadow text-2xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{game.name}</h2>
          {game.developers.length > 0 && (
            <p className="text-shadow mt-1 text-sm text-zinc-400">by {game.developers.slice(0, 2).join(', ')}</p>
          )}

          <p
            onClick={() => {
              if (!expanded) track('expand_description', { appid: game.appid })
              setExpanded((v) => !v)
            }}
            className={`text-shadow mt-2 cursor-pointer text-sm leading-relaxed text-zinc-200 sm:text-base ${
              expanded ? '' : 'line-clamp-2 sm:line-clamp-4'
            }`}
          >
            {game.short_description}
          </p>

          <div className="feed -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
            {(game.tags.length ? game.tags : game.genres).slice(0, 6).map((t) => (
              <span key={t} className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-zinc-200 backdrop-blur">
                {t}
              </span>
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}

function RailButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
    >
      {children}
    </button>
  )
}
