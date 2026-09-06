import type { Game } from '../types'
import { MediaCarousel } from './MediaCarousel'

type Props = {
  game: Game
  active: boolean
  nearby: boolean
  muted: boolean
  liked: boolean
  onToggleMute: () => void
  onToggleLike: () => void
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

export function GameCard({ game, active, nearby, muted, liked, onToggleMute, onToggleLike }: Props) {
  const storeUrl = `https://store.steampowered.com/app/${game.appid}/`

  return (
    <section className="relative h-dvh w-full snap-start snap-always overflow-hidden bg-black">
      <MediaCarousel game={game} active={active} nearby={nearby} muted={muted} />

      {/* gradients for legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* right action rail */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 sm:right-5">
        <RailButton label={liked ? 'Unlike' : 'Like'} onClick={onToggleLike} active={liked}>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </RailButton>
        <RailButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
          {muted ? (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
            </svg>
          )}
        </RailButton>
        <a
          href={storeUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on Steam"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-steam/80"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-9.97 9.2l5.36 2.22a2.83 2.83 0 0 1 1.6-.5h.16l2.38-3.46v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.13a2.83 2.83 0 0 1-5.62.44L2.4 14.6A10 10 0 1 0 12 2zm-3.7 15.2-1.23-.51a2.13 2.13 0 0 0 3.94-.1 2.12 2.12 0 0 0-1.15-2.77l-1.27-.53a1.5 1.5 0 0 1 1.96-.03l1.29.53a2.1 2.1 0 0 1-3.54 3.41zm7.03-6.7a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02zm0-4.4a1.89 1.89 0 1 0 0 3.78 1.89 1.89 0 0 0 0-3.78z" />
          </svg>
        </a>
      </div>

      {/* bottom info */}
      <div className="absolute inset-x-0 bottom-0 p-4 pb-8 pr-20 sm:p-8 sm:pr-28">
        <div className="max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-300">
            {game.review_summary && (
              <span className={reviewColor(game.review_percent)}>
                {game.review_summary}
                {game.review_percent !== null && <span className="text-zinc-400"> · {game.review_percent}%</span>}
                {game.review_count !== null && <span className="text-zinc-500"> · {game.review_count.toLocaleString()} reviews</span>}
              </span>
            )}
            {year(game.release_date) && <span className="text-zinc-500">· {year(game.release_date)}</span>}
          </div>

          <h2 className="text-2xl font-bold leading-tight tracking-tight text-white drop-shadow sm:text-4xl">{game.name}</h2>
          {game.developers.length > 0 && (
            <p className="mt-1 text-sm text-zinc-400">by {game.developers.slice(0, 2).join(', ')}</p>
          )}

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-200 sm:line-clamp-3 sm:text-base">
            {game.short_description}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(game.tags.length ? game.tags : game.genres).slice(0, 6).map((t) => (
              <span key={t} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-zinc-200 backdrop-blur">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-steam px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              {game.is_free ? 'Play for free' : game.price_formatted ? `Get it · ${game.price_formatted}` : 'View on Steam'}
            </a>
            {game.discount_percent ? (
              <span className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-300">−{game.discount_percent}%</span>
            ) : null}
            {game.metacritic ? <span className="text-xs text-zinc-400">Metacritic {game.metacritic}</span> : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function RailButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition ${
        active ? 'bg-rose-500/80 text-white' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  )
}
