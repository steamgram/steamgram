import { useCallback, useEffect, useState, type ReactNode } from 'react'

type Props = { label: string; onClose: () => void; children: ReactNode }

/** Bottom sheet on phones, centred card on desktop. Animates in and out; Escape, the X and the backdrop close it. */
export function Sheet({ label, onClose, children }: Props) {
  const [closing, setClosing] = useState(false)
  const close = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 220)
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className={`absolute inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center ${closing ? 'anim-fade-out' : 'anim-fade-in'}`}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`feed safe-bottom relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#111823] p-6 text-zinc-200 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl ${closing ? 'anim-sheet-out' : 'anim-sheet-in'}`}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}
