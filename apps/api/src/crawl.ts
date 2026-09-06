import { appDetails, decodeEntities, legacyMp4, loadTagMap, searchPage, type SearchHit } from './steam.js'
import { countGames, isVisited, markVisited, saveGame, type Game } from './db.js'

const MIN_REVIEWS = 10 // below this the data is noise
const MAX_TAGS = 6

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
    tags: hit.tagids.map((id) => tagMap.get(id)).filter((t): t is string => !!t).slice(0, MAX_TAGS),
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
  }
  saveGame(game)
  markVisited(hit.appid, 'ok')
  return true
}

/** One crawl step: grab a random search page and ingest every new game on it. */
export async function crawlOnce(): Promise<number> {
  const tagMap = await loadTagMap()
  // ~70k games sorted by reviews. Bias toward the deep end so the feed is mostly unknowns.
  const total = 60_000
  const start = Math.floor(Math.random() ** 0.6 * total)
  const { hits } = await searchPage(start)
  log(`search offset ${start}: ${hits.length} hits`)
  let added = 0
  for (const hit of hits) {
    if (isVisited(hit.appid)) continue
    if (hit.reviewCount !== null && hit.reviewCount < MIN_REVIEWS) {
      markVisited(hit.appid, 'rejected')
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

export async function crawlForever(opts: { target?: number } = {}) {
  const target = opts.target ?? Infinity
  while (countGames() < target) {
    try {
      await crawlOnce()
      log(`pool size: ${countGames()}`)
    } catch (err) {
      log(`crawl step failed: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 30_000))
    }
  }
}

// Run standalone: `pnpm crawl [targetCount]`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const target = Number(process.argv[2]) || Infinity
  crawlForever({ target }).then(() => {
    log(`done, pool size ${countGames()}`)
    process.exit(0)
  })
}
