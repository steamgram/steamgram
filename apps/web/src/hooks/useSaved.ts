import { useCallback } from 'react'
import { track } from '../analytics'
import type { Game } from '../types'
import { createLocalStore } from './localStore'

export type SavedGame = {
  appid: number
  name: string
  header_image: string
  review_summary: string | null
  review_percent: number | null
  price_formatted: string | null
  savedAt: number
}

const store = createLocalStore<SavedGame[]>('steamgram:saved', [])

export function useSaved() {
  const saved = store.use()
  const toggle = useCallback((g: Game) => {
    const list = store.read()
    if (list.some((s) => s.appid === g.appid)) {
      store.write(list.filter((s) => s.appid !== g.appid))
      track('unsave', { appid: g.appid, game: g.name })
    } else {
      store.write([
        {
          appid: g.appid,
          name: g.name,
          header_image: g.header_image,
          review_summary: g.review_summary,
          review_percent: g.review_percent,
          price_formatted: g.price_formatted,
          savedAt: Date.now(),
        },
        ...list,
      ])
      track('save', { appid: g.appid, game: g.name })
    }
  }, [])
  const remove = useCallback((appid: number) => {
    store.write(store.read().filter((s) => s.appid !== appid))
  }, [])
  return { saved, toggle, remove, isSaved: (appid: number) => saved.some((s) => s.appid === appid) }
}
