import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type Props = { text: string; className?: string; onExpand?: () => void }

const CLAMP = ['line-clamp-2', 'sm:line-clamp-4']

/**
 * Clamped text that grows and shrinks smoothly on tap. The clamp classes hide
 * the overflow; the wrapper's max-height is animated between measured sizes.
 * Heights are measured synchronously so the animation never depends on timing.
 */
export function ExpandableText({ text, className = '', onExpand }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(true)
  const wrap = useRef<HTMLDivElement>(null)
  const para = useRef<HTMLParagraphElement>(null)

  const toggle = () => {
    const w = wrap.current
    const p = para.current
    if (!w || !p) return
    const from = w.getBoundingClientRect().height
    w.style.maxHeight = `${from}px`

    if (!expanded) {
      onExpand?.()
      flushSync(() => {
        setExpanded(true)
        setClamped(false)
      })
      void w.offsetHeight // commit the start value before changing the target
      w.style.maxHeight = `${w.scrollHeight}px`
    } else {
      // measure the clamped height without flashing it
      p.classList.add(...CLAMP)
      const to = w.scrollHeight
      p.classList.remove(...CLAMP)
      setExpanded(false)
      void w.offsetHeight
      w.style.maxHeight = `${to}px`
    }
  }

  const onTransitionEnd = () => {
    const w = wrap.current
    if (!w) return
    // re-apply the clamp before releasing max-height so the full text never flashes
    if (!expanded) flushSync(() => setClamped(true))
    w.style.maxHeight = ''
  }

  return (
    <div
      ref={wrap}
      onClick={toggle}
      onTransitionEnd={onTransitionEnd}
      className="cursor-pointer overflow-hidden transition-[max-height] duration-300 ease-out"
    >
      <p ref={para} className={`${className} ${clamped ? CLAMP.join(' ') : ''}`}>
        {text}
      </p>
    </div>
  )
}
