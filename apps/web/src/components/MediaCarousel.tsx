import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../analytics'
import type { Game } from '../types'
import { TrailerVideo } from './TrailerVideo'

type Item = { kind: 'video' } | { kind: 'image'; src: string }

type Props = {
  game: Game
  active: boolean // card is the one on screen
  nearby: boolean // card is within one of the active card
  muted: boolean
}

/**
 * Horizontal, snap-scrolling media strip inside a card: trailer first, then
 * screenshots. Swipe / trackpad / ← → keys / edge arrows all move it.
 */
export function MediaCarousel({ game, active, nearby, muted }: Props) {
  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    if (game.trailer_mp4 || game.trailer_hls) list.push({ kind: 'video' })
    for (const src of game.screenshots) list.push({ kind: 'image', src })
    if (list.length === 0) list.push({ kind: 'image', src: game.header_image })
    return list
  }, [game])

  const ref = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el || el.clientWidth === 0) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    setIndex((prev) => {
      if (next !== prev && next > 0) track('media_swipe', { appid: game.appid, slide: next })
      return next
    })
  }, [game.appid])

  const go = useCallback(
    (i: number) => {
      const el = ref.current
      if (!el) return
      const n = Math.max(0, Math.min(items.length - 1, i))
      el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
    },
    [items.length],
  )

  // Snap back to the trailer when the card scrolls out of view.
  useEffect(() => {
    if (!active && ref.current && index !== 0) {
      ref.current.scrollTo({ left: 0 })
      setIndex(0)
    }
  }, [active, index])

  useEffect(() => {
    if (!active || items.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, index, items.length, go])

  return (
    <>
      <div
        ref={ref}
        onScroll={onScroll}
        className="feed absolute inset-0 flex snap-x snap-mandatory overflow-x-scroll overflow-y-hidden"
        style={{ overscrollBehaviorX: 'contain' }}
      >
        {items.map((it, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden">
            {it.kind === 'video' ? (
              <TrailerVideo game={game} active={active && index === i} nearby={nearby} muted={muted} />
            ) : nearby && Math.abs(i - index) <= 1 ? (
              <Screenshot src={it.src} />
            ) : null}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          {/* story-style progress segments */}
          <div className="pointer-events-none absolute inset-x-4 top-12 z-10 flex gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>

          {/* edge arrows for mouse users */}
          {active && index > 0 && (
            <EdgeArrow side="left" onClick={() => go(index - 1)} />
          )}
          {active && index < items.length - 1 && (
            <EdgeArrow side="right" onClick={() => go(index + 1)} />
          )}
        </>
      )}
    </>
  )
}

/** Whole screenshot visible, with a blurred copy filling the letterbox. */
function Screenshot({ src }: { src: string }) {
  return (
    <>
      <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50" />
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
    </>
  )
}

function EdgeArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous media' : 'Next media'}
      onClick={onClick}
      className={`absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white sm:flex ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
        {side === 'left' ? <path d="m15 5-7 7 7 7" /> : <path d="m9 5 7 7-7 7" />}
      </svg>
    </button>
  )
}
