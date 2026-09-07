import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchTags } from '../api'
import type { TagFilter } from '../types'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { tagState, type TagState } from '../hooks/useTagFilter'
import { Sheet } from './Sheet'

type Props = { filter: TagFilter; matching: number | null; onToggle: (tag: string) => void; onClear: () => void; onClose: () => void }

export function FilterSheet({ filter, matching, onToggle, onClear, onClose }: Props) {
  const { data: tags, isPending } = useQuery({ queryKey: ['tags'], queryFn: fetchTags, staleTime: 10 * 60_000 })
  const [query, setQuery] = useState('')
  // A keyboard that opens by itself is handy at a desk and in the way on a phone.
  const desktop = useMediaQuery('(hover: hover) and (pointer: fine)')

  const q = query.trim().toLowerCase()
  const counts = new Map((tags ?? []).map((t) => [t.tag, t.n]))
  // Chosen tags get a row of their own; the rest keep their popularity order.
  const chosen = [...filter.include, ...filter.exclude]
  const rest = (tags ?? []).filter((t) => tagState(filter, t.tag) === 'off' && (!q || t.tag.toLowerCase().includes(q)))

  const summary = [
    filter.include.length ? `${filter.include.length} included` : null,
    filter.exclude.length ? `${filter.exclude.length} excluded` : null,
    matching !== null ? `${matching.toLocaleString()} games match` : null,
  ].filter(Boolean)

  return (
    <Sheet label="Filter by tags" onClose={onClose}>
      <h2 className="text-xl font-black tracking-tight text-white">Filter</h2>
      <p className="mt-1 text-sm text-zinc-400">{chosen.length === 0 ? 'Pick the kinds of games you want to see.' : `${summary.join(' · ')}.`}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        Tap a tag to include it, again to exclude it, once more to clear. One included tag is enough; an excluded one always wins.
      </p>

      {/* stays put while the list scrolls under it */}
      <div className="sticky top-0 z-10 -mx-6 bg-[#111823] px-6 py-3">
        <input
          type="text"
          inputMode="search"
          enterKeyHint="done"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags"
          aria-label="Search tags"
          autoFocus={desktop}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full rounded-full bg-white/10 px-4 py-2 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-zinc-500 focus:ring-steam/60"
        />
      </div>

      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
          {chosen.map((tag) => (
            <TagPill key={tag} tag={tag} n={counts.get(tag)} state={tagState(filter, tag)} onClick={() => onToggle(tag)} />
          ))}
          <button type="button" onClick={onClear} className="ml-auto px-1 text-sm font-medium text-steam hover:underline">
            Clear all
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isPending && <span className="text-sm text-zinc-500">Loading tags…</span>}
        {!isPending && q && rest.length === 0 && <span className="text-sm text-zinc-500">No tags match “{query.trim()}”.</span>}
        {rest.map((t) => (
          <TagPill key={t.tag} tag={t.tag} n={t.n} state="off" onClick={() => onToggle(t.tag)} />
        ))}
      </div>
    </Sheet>
  )
}

const LOOK: Record<TagState, { pill: string; count: string; label: string }> = {
  off: { pill: 'bg-white/10 text-zinc-200 hover:bg-white/20', count: 'text-zinc-500', label: 'not selected' },
  include: { pill: 'bg-steam font-semibold text-black', count: 'text-black/60', label: 'included' },
  exclude: { pill: 'bg-rose-500/90 font-semibold text-white hover:bg-rose-500', count: 'text-white/60', label: 'excluded' },
}

function TagPill({ tag, n, state, onClick }: { tag: string; n?: number; state: TagState; onClick: () => void }) {
  const look = LOOK[state]
  return (
    <button
      type="button"
      aria-pressed={state !== 'off'}
      aria-label={`${tag}, ${look.label}`}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition ${look.pill}`}
    >
      {state === 'exclude' && '− '}
      {tag}
      {n !== undefined && <span className={`text-xs ${look.count}`}> {n}</span>}
    </button>
  )
}
