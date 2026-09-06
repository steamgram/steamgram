/**
 * Thin client for Steam's (unofficial) store endpoints.
 * All calls go through a single rate limiter, because Steam returns 429 quickly.
 */

const UA = 'SteamGram/0.1 (+hobby project; contact via github)'
const MIN_GAP_MS = 1500 // ~40 req/min, comfortably under Steam's ~200 per 5 min

let lastCall = 0
let backoffUntil = 0

async function throttledFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = Math.max(lastCall + MIN_GAP_MS - now, backoffUntil - now, 0)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } })
  if (res.status === 429 || res.status === 403) {
    backoffUntil = Date.now() + 60_000
    throw new Error(`Steam rate limited (${res.status}) on ${url}`)
  }
  return res
}

// ---------- tag names ----------

let tagMap: Map<number, string> | null = null
export async function loadTagMap(): Promise<Map<number, string>> {
  if (tagMap) return tagMap
  const res = await throttledFetch('https://store.steampowered.com/tagdata/populartags/english')
  const list = (await res.json()) as { tagid: number; name: string }[]
  tagMap = new Map(list.map((t) => [t.tagid, t.name]))
  return tagMap
}

// ---------- search (discovery) ----------

export type SearchHit = {
  appid: number
  name: string
  tagids: number[]
  released: string | null
  reviewSummary: string | null
  reviewPercent: number | null
  reviewCount: number | null
}

const SEARCH_SORTS = ['Reviews_DESC', 'Released_DESC', '_ASC'] as const

/**
 * Pull a page of the Steam store search. `start` is a random offset into
 * ~70k games sorted by review score, so deep offsets give obscure-but-liked games.
 */
export async function searchPage(start: number, count = 50, sort: string = SEARCH_SORTS[0]): Promise<{ hits: SearchHit[]; total: number }> {
  const url = new URL('https://store.steampowered.com/search/results/')
  url.search = new URLSearchParams({
    query: '',
    start: String(start),
    count: String(count),
    infinite: '1',
    json: '1',
    category1: '998', // games only
    sort_by: sort,
    cc: 'us',
    l: 'en',
  }).toString()
  const res = await throttledFetch(url.toString())
  if (!res.ok) throw new Error(`search ${res.status}`)
  const json = (await res.json()) as { total_count: number; results_html: string }
  return { hits: parseSearchHtml(json.results_html), total: json.total_count }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function parseSearchHtml(html: string): SearchHit[] {
  const rows = html.split('<a href=').slice(1)
  const hits: SearchHit[] = []
  for (const row of rows) {
    const appid = row.match(/data-ds-appid="(\d+)"/)?.[1]
    if (!appid) continue // bundles/packages have no single appid
    const name = decodeEntities(row.match(/<span class="title">(.*?)<\/span>/s)?.[1]?.trim() ?? '')
    const tagids = JSON.parse(row.match(/data-ds-tagids="(\[[^"]*\])"/)?.[1] ?? '[]') as number[]
    const released = row.match(/search_released[^>]*>\s*(.*?)\s*<\/div>/s)?.[1]?.trim() || null
    const tooltip = row.match(/search_review_summary[^>]*data-tooltip-html="([^"]*)"/)?.[1]
    let reviewSummary: string | null = null
    let reviewPercent: number | null = null
    let reviewCount: number | null = null
    if (tooltip) {
      const text = decodeEntities(tooltip)
      const m = text.match(/^(.*?)<br>(\d+)% of the ([\d,]+) user reviews/)
      if (m) {
        reviewSummary = m[1]
        reviewPercent = Number(m[2])
        reviewCount = Number(m[3].replace(/,/g, ''))
      } else {
        reviewSummary = text.split('<br>')[0]
      }
    }
    hits.push({ appid: Number(appid), name, tagids, released, reviewSummary, reviewPercent, reviewCount })
  }
  return hits
}

// ---------- app details ----------

export type AppDetails = {
  type: string
  name: string
  steam_appid: number
  is_free: boolean
  short_description: string
  header_image: string
  background_raw?: string
  developers?: string[]
  price_overview?: { currency: string; initial: number; final: number; discount_percent: number; final_formatted: string }
  platforms?: { windows: boolean; mac: boolean; linux: boolean }
  metacritic?: { score: number }
  genres?: { id: string; description: string }[]
  screenshots?: { path_full: string; path_thumbnail: string }[]
  movies?: { id: number; name: string; thumbnail: string; hls_h264?: string; dash_h264?: string; highlight: boolean }[]
  recommendations?: { total: number }
  release_date?: { coming_soon: boolean; date: string }
}

export async function appDetails(appid: number): Promise<AppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`
  const res = await throttledFetch(url)
  if (!res.ok) throw new Error(`appdetails ${res.status}`)
  const json = (await res.json()) as Record<string, { success: boolean; data?: AppDetails }>
  const entry = json[String(appid)]
  if (!entry?.success || !entry.data) return null
  return entry.data
}

/** Steam still serves legacy progressive MP4s next to the HLS manifests. */
export function legacyMp4(movieId: number, quality: '480' | 'max' = '480'): string {
  return `https://video.akamai.steamstatic.com/store_trailers/${movieId}/movie${quality === 'max' ? '_max' : '480'}.mp4`
}
