import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { track } from '../analytics'
import { hasTrailer, type Game } from '../types'
import { TrailerVideo } from './TrailerVideo'

type Item = { kind: 'video' } | { kind: 'image'; src: string }

/** What the feed gets through `ref`: move the strip by a number of slides. */
export type MediaHandle = { step: (delta: number) => void }

type Props = {
  game: Game
  active: boolean // card is the one on screen
  nearby: boolean // card is within one of the active card
  muted: boolean
  onSlideChange?: (index: number) => void // 0 is the trailer when the game has one
  ref?: Ref<MediaHandle>
}

/**
 * Horizontal, snap-scrolling media strip inside a card: trailer first, then
 * screenshots. Swipe / trackpad move it; the feed steps it from the keyboard
 * (A / D) through `ref`.
 */
export function MediaCarousel({ game, active, nearby, muted, onSlideChange, ref: handle }: Props) {
  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    if (hasTrailer(game)) list.push({ kind: 'video' })
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
    onSlideChange?.(next)
  }, [game.appid, onSlideChange])

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
      onSlideChange?.(0)
    }
  }, [active, index, onSlideChange])

  useImperativeHandle(handle, () => ({ step: (delta) => go(index + delta) }), [go, index])

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

      {/* story-style progress segments */}
      {items.length > 1 && (
        <div className="safe-seg pointer-events-none absolute inset-x-3 z-10 flex gap-1">
          {items.map((_, i) => (
            <span
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
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
