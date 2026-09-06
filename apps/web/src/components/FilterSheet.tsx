import { useQuery } from '@tanstack/react-query'
import { fetchTags } from '../api'
import { Sheet } from './Sheet'

type Props = { selected: string[]; matching: number | null; onToggle: (tag: string) => void; onClear: () => void; onClose: () => void }

export function FilterSheet({ selected, matching, onToggle, onClear, onClose }: Props) {
  const { data: tags, isPending } = useQuery({ queryKey: ['tags'], queryFn: fetchTags, staleTime: 10 * 60_000 })

  return (
    <Sheet label="Filter by tags" onClose={onClose}>
      <h2 className="text-xl font-black tracking-tight text-white">Filter</h2>
      <p className="mt-1 text-sm text-zinc-400">
        {selected.length === 0
          ? 'Pick the kinds of games you want to see. Any match counts.'
          : `${selected.length} tag${selected.length === 1 ? '' : 's'} selected${matching !== null ? ` · ${matching.toLocaleString()} games match` : ''}.`}
      </p>

      {selected.length > 0 && (
        <button type="button" onClick={onClear} className="mt-3 text-sm font-medium text-steam hover:underline">
          Clear all
        </button>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isPending && <span className="text-sm text-zinc-500">Loading tags…</span>}
        {(tags ?? []).map(({ tag, n }) => {
          const on = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(tag)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                on ? 'bg-steam font-semibold text-black' : 'bg-white/10 text-zinc-200 hover:bg-white/20'
              }`}
            >
              {tag} <span className={`text-xs ${on ? 'text-black/60' : 'text-zinc-500'}`}>{n}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
