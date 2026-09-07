import { appDetails, decodeEntities, isAdult, legacyMp4, loadTagMap, searchPage, type SearchHit } from './steam.js'
import { ADULT_TAGS, countGames, countUnchecked, getVisited, kvGet, kvSet, markVisited, saveGame, setAdult, uncheckedGames, type Game } from './db.js'

const MIN_REVIEWS = 10 // below this the data is noise
const MAX_TAGS = 6

const DAY = 24 * 60 * 60 * 1000
// How long before a previously skipped game is worth another look.
const RETRY_AFTER: Partial<Record<string, number>> = {
  few_reviews: 14 * DAY, // new releases collect reviews over time
  error: 1 * DAY,
}

/** True when this app was already handled and should not be fetched again yet. */
function alreadyHandled(appid: number): boolean {
  const v = getVisited(appid)
  if (!v) return false
  const retry = RETRY_AFTER[v.status]
  return retry === undefined || v.visited_at > Date.now() - retry
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function log(...args: unknown[]) {
  console.log(`[crawl ${new Date().toISOString().slice(11, 19)}]`, ...args)
}

async function ingest(hit: SearchHit, tagMap: Map<number, string>): Promise<boolean> {
  const d = await appDetails(hit.appid)
  if (!d || d.type !== 'game' || d.release_date?.coming_soon) {
    markVisited(hit.appid, 'rejected')
    return false
  }
  const movie = d.movies?.find((m) => m.highlight) ?? d.movies?.[0]
  const screenshots = (d.screenshots ?? []).map((s) => s.path_full).slice(0, 8)
  if (!movie && screenshots.length === 0) {
    markVisited(hit.appid, 'rejected')
    return false
  }
  const platforms = Object.entries(d.platforms ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)

  const tags = hit.tagids.map((id) => tagMap.get(id)).filter((t): t is string => !!t).slice(0, MAX_TAGS)
  const game: Game = {
    appid: d.steam_appid,
    name: decodeEntities(d.name),
    short_description: decodeEntities(d.short_description.replace(/<[^>]+>/g, "")),
    header_image: d.header_image,
    background: d.background_raw ?? null,
    trailer_mp4: movie ? legacyMp4(movie.id) : null,
    trailer_hls: movie?.hls_h264 ?? null,
    trailer_thumb: movie?.thumbnail ?? null,
    screenshots,
    genres: (d.genres ?? []).map((g) => g.description),
    tags,
    developers: d.developers ?? [],
    platforms,
    is_free: d.is_free,
    price_final: d.price_overview?.final ?? (d.is_free ? 0 : null),
    price_initial: d.price_overview?.initial ?? (d.is_free ? 0 : null),
    discount_percent: d.price_overview?.discount_percent ?? 0,
    price_formatted: d.price_overview?.final_formatted ?? (d.is_free ? 'Free' : null),
    release_date: d.release_date?.date ?? hit.released,
    review_summary: hit.reviewSummary,
    review_percent: hit.reviewPercent,
    review_count: hit.reviewCount ?? d.recommendations?.total ?? null,
    metacritic: d.metacritic?.score ?? null,
    fetched_at: Date.now(),
    price_refreshed_at: Date.now(),
    reviews_refreshed_at: hit.reviewSummary ? Date.now() : null,
    adult: isAdult(d, tags, ADULT_TAGS) ? 1 : 0,
  }
  saveGame(game)
  markVisited(hit.appid, 'ok')
  return true
}

/** Ingest every new, sufficiently reviewed game on a page of search hits. Returns how many were added. */
async function ingestHits(hits: SearchHit[], tagMap: Map<number, string>): Promise<number> {
  let added = 0
  for (const hit of hits) {
    if (alreadyHandled(hit.appid)) continue
    // No review tooltip means no reviews at all; the release sweep hits many of those.
    if ((hit.reviewCount ?? 0) < MIN_REVIEWS) {
      markVisited(hit.appid, 'few_reviews')
      continue
    }
    try {
      if (await ingest(hit, tagMap)) {
        added++
        log(`+ ${hit.name} (${hit.appid}) — ${hit.reviewSummary ?? 'no reviews'}`)
      }
    } catch (err) {
      log(`! ${hit.appid}: ${(err as Error).message}`)
      markVisited(hit.appid, 'error')
    }
  }
  return added
}

/** Discovery step: a random page from the review-sorted catalogue. Returns how many games were added. */
export async function crawlOnce(): Promise<number> {
  const tagMap = await loadTagMap()
  // ~70k games sorted by reviews. Bias toward the deep end so the feed is mostly unknowns.
  const total = 60_000
  const start = Math.floor(Math.random() ** 0.6 * total)
  const { hits } = await searchPage(start)
  log(`search offset ${start}: ${hits.length} hits`)
  return ingestHits(hits, tagMap)
}

const SWEEP_PAGES = 20 // newest 1000 releases

/** Daily: walk the newest releases so games published after the initial crawl still get in. */
export async function sweepNewReleases(): Promise<number> {
  const tagMap = await loadTagMap()
  let added = 0
  for (let page = 0; page < SWEEP_PAGES; page++) {
    const { hits } = await searchPage(page * 50, 50, 'Released_DESC')
    if (hits.length === 0) break
    added += await ingestHits(hits, tagMap)
  }
  log(`new-release sweep: +${added}`)
  return added
}

/** Rows crawled before the adult flag existed: check Steam's content descriptors for a few at a time. */
async function recheckAdult(batch: number): Promise<void> {
  const ids = uncheckedGames(batch)
  for (const appid of ids) {
    try {
      const d = await appDetails(appid)
      const g = d ? isAdult(d, [], ADULT_TAGS) : false
      setAdult(appid, g)
      if (g) log(`flagged adult: ${d?.name ?? appid} (${appid})`)
    } catch (err) {
      // Leave it NULL for a later pass; the throttle already backs off on rate limits.
      log(`recheck ${appid} failed: ${(err as Error).message}`)
    }
  }
  if (ids.length) log(`content check: ${countUnchecked()} games left to check`)
}

/**
 * Runs forever. Discovery slows down as the catalogue is exhausted (a page that
 * adds nothing doubles the pause, up to 30 minutes) and speeds back up when new
 * games appear. Once a day the newest releases are swept regardless.
 */
export async function crawlForever(opts: { target?: number } = {}) {
  const target = opts.target ?? Infinity
  let idle = 0
  for (;;) {
    try {
      await recheckAdult(25)

      const lastSweep = Number(kvGet('last_new_release_sweep') ?? 0)
      if (Date.now() - lastSweep > DAY) {
        await sweepNewReleases()
        kvSet('last_new_release_sweep', String(Date.now()))
      }

      // countGames() scans the whole table (~50 ms on the server, on the shared event
      // loop), so only count when there is a target to compare against or new rows to report.
      if (target === Infinity || countGames() < target) {
        const added = await crawlOnce()
        if (added === 0) {
          idle = Math.min(idle ? idle * 2 : 30_000, 30 * 60_000)
          log(`nothing new on that page; next discovery in ${Math.round(idle / 1000)}s`)
        } else {
          idle = 0
          log(`+${added}, pool size: ${countGames()}`)
        }
      } else {
        idle = 60_000
      }
      await sleep(Math.max(idle, 1000))
    } catch (err) {
      log(`crawl step failed: ${(err as Error).message}`)
      await sleep(30_000)
    }
  }
}

// Run standalone: `pnpm crawl [targetCount]`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  crawlForever({ target: Number(process.argv[2]) || Infinity })
}
