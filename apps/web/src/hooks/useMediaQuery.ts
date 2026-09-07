import { useCallback, useMemo, useSyncExternalStore } from 'react'

/** Whether a CSS media query matches right now; re-renders when that changes (rotation, resize). */
export function useMediaQuery(query: string) {
  const mql = useMemo(() => window.matchMedia(query), [query])
  const subscribe = useCallback(
    (onChange: () => void) => {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [mql],
  )
  return useSyncExternalStore(subscribe, () => mql.matches)
}
