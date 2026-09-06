import { Sheet } from './Sheet'
import type { SavedGame } from '../hooks/useSaved'

type Props = { saved: SavedGame[]; onRemove: (appid: number) => void; onClose: () => void }

export function SavedSheet({ saved, onRemove, onClose }: Props) {
  return (
    <Sheet label="Saved games" onClose={onClose}>
      <h2 className="text-xl font-black tracking-tight text-white">Saved</h2>
      <p className="mt-1 text-sm text-zinc-400">
        {saved.length === 0 ? 'Nothing yet. Tap the bookmark on a game to keep it here.' : `${saved.length} game${saved.length === 1 ? '' : 's'}, kept on this device.`}
      </p>
      <ul className="mt-4 space-y-2">
        {saved.map((g) => (
          <li key={g.appid} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
            <a href={`/?game=${g.appid}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Open ${g.name} in the feed`}>
              <img src={g.header_image} alt="" className="h-12 w-[102px] shrink-0 rounded-md object-cover" loading="lazy" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{g.name}</div>
                <div className="truncate text-xs text-zinc-400">
                  {g.review_summary ?? 'No reviews'}
                  {g.review_percent !== null && ` · ${g.review_percent}%`}
                  {g.price_formatted && ` · ${g.price_formatted}`}
                </div>
              </div>
            </a>
            <a
              href={`https://store.steampowered.com/app/${g.appid}/`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on Steam"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-9.97 9.2l5.36 2.22a2.83 2.83 0 0 1 1.6-.5h.16l2.38-3.46v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.13a2.83 2.83 0 0 1-5.62.44L2.4 14.6A10 10 0 1 0 12 2zm-3.7 15.2-1.23-.51a2.13 2.13 0 0 0 3.94-.1 2.12 2.12 0 0 0-1.15-2.77l-1.27-.53a1.5 1.5 0 0 1 1.96-.03l1.29.53a2.1 2.1 0 0 1-3.54 3.41zm7.03-6.7a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02zm0-4.4a1.89 1.89 0 1 0 0 3.78 1.89 1.89 0 0 0 0-3.78z" />
              </svg>
            </a>
            <button
              type="button"
              aria-label={`Remove ${g.name}`}
              onClick={() => onRemove(g.appid)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
