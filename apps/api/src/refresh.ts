import { getGames, updatePrice, updateReviews, type Game } from './db.js'
import { fetchPrices, fetchReviewSummary, pendingRequests } from './steam.js'

const PRICE_TTL = 6 * 60 * 60 * 1000 // Steam sales flip at fixed times; 6h keeps prices honest
const REVIEWS_TTL = 7 * 24 * 60 * 60 * 1000 // scores drift slowly
const MAX_QUEUE = 40 // beyond this many waiting Steam requests, skip optional refreshes entirely

// Dedupe concurrent refreshes of the same app across requests.
const inFlight = new Map<string, Promise<void>>()

function once(key: string, work: () => Promise<void>): Promise<void> {
  let p = inFlight.get(key)
  if (!p) {
    p = work().finally(() => inFlight.delete(key))
    inFlight.set(key, p)
  }
  return p
}

function log(msg: string) {
  console.log(`[refresh ${new Date().toISOString().slice(11, 19)}] ${msg}`)
}

/** Kick off refreshes for whatever is stale in `games`. Resolves when all of them are done. */
export function refreshStale(games: Game[]): Promise<void> {
  const now = Date.now()
  // The Steam limiter allows one request per 1.5 s. Under a traffic spike nearly every feed
  // page would queue a refresh, the queue would grow without bound, and every viewer would
  // wait the full timeout for data the feed serves fine stale. So shed everything once the
  // queue is deep; the next quiet moment catches up.
  if (pendingRequests() > MAX_QUEUE) return Promise.resolve()
  const stalePrices = games.filter((g) => (g.price_refreshed_at ?? 0) < now - PRICE_TTL).map((g) => g.appid)
  const staleReviews = games.filter((g) => (g.reviews_refreshed_at ?? 0) < now - REVIEWS_TTL).map((g) => g.appid)
  const jobs: Promise<void>[] = []

  if (stalePrices.length) {
    jobs.push(
      once(`prices:${stalePrices.join(',')}`, async () => {
        const prices = await fetchPrices(stalePrices)
        for (const [id, p] of prices) updatePrice(id, p)
        log(`prices refreshed for ${prices.size}/${stalePrices.length} games`)
      }).catch((e) => log(`price refresh failed: ${(e as Error).message}`)),
    )
  }
  for (const id of staleReviews) {
    jobs.push(
      once(`reviews:${id}`, async () => {
        updateReviews(id, await fetchReviewSummary(id))
      }).catch((e) => log(`review refresh failed for ${id}: ${(e as Error).message}`)),
    )
  }
  if (jobs.length) log(`queued ${stalePrices.length} price + ${staleReviews.length} review refreshes`)
  return Promise.all(jobs).then(() => undefined)
}

/**
 * Refresh stale data for a feed page, but never make the client wait longer
 * than `timeoutMs`. Whatever finished in time is returned fresh; the rest keeps
 * refreshing in the background and is fresh for the next viewer.
 */
export async function ensureFresh(games: Game[], timeoutMs: number): Promise<Game[]> {
  const done = refreshStale(games)
  await Promise.race([done, new Promise((r) => setTimeout(r, timeoutMs))])
  return getGames(games.map((g) => g.appid))
}
