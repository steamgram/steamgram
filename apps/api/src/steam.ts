/**
 * Thin client for Steam's (unofficial) store endpoints.
 * All calls go through a single rate limiter, because Steam returns 429 quickly.
 */

const UA = 'SteamGram/0.1 (+hobby project; contact via github)'
const MIN_GAP_MS = 1500 // ~40 req/min, comfortably under Steam's ~200 per 5 min

let lastCall = 0
let backoffUntil = 0

// Single global request slot with priorities: interactive refreshes (feed
// pages) go before the background crawler. Reservation is synchronous, so
// concurrent callers cannot all fire at once.
type Waiter = { prio: number; resolve: () => void }
const waiters: Waiter[] = []
let timer: NodeJS.Timeout | null = null

function pump() {
  if (timer || waiters.length === 0) return
  const now = Date.now()
  const delay = Math.max(lastCall + MIN_GAP_MS - now, backoffUntil - now, 0)
  timer = setTimeout(() => {
    timer = null
    waiters.sort((a, b) => b.prio - a.prio)
    const w = waiters.shift()!
    lastCall = Date.now()
    w.resolve()
    pump()
  }, delay)
}

function acquireSlot(prio: number): Promise<void> {
  return new Promise((resolve) => {
    waiters.push({ prio, resolve })
    pump()
  })
}

/** How many requests are waiting for a slot; lets callers shed optional work under load. */
export function pendingRequests(): number {
  return waiters.length
}

export const PRIO_BACKGROUND = 0
export const PRIO_INTERACTIVE = 10

async function throttledFetch(url: string, prio = PRIO_BACKGROUND): Promise<Response> {
  await acquireSlot(prio)
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

export function decodeEntities(s: string): string {
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
  required_age?: number | string
  content_descriptors?: { ids: number[]; notes: string | null }
}

// Steam content descriptor ids: 1 some nudity/sexual content, 2 frequent violence/gore,
// 3 adult-only sexual content, 4 frequent nudity/sexual content, 5 general mature content.
const ADULT_DESCRIPTORS = new Set([1, 3, 4])

/** True when Steam marks the game as sexual/adult content, or its tags do. */
export function isAdult(d: AppDetails, tags: string[], adultTags: string[]): boolean {
  if (d.content_descriptors?.ids.some((id) => ADULT_DESCRIPTORS.has(id))) return true
  return tags.some((t) => adultTags.includes(t))
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

// ---------- lightweight refresh endpoints ----------

export type PriceInfo = { is_free: boolean; final: number | null; initial: number | null; discount: number; formatted: string | null }

/** One request refreshes prices for many apps (Steam allows multi-id only with the price filter). */
export async function fetchPrices(appids: number[]): Promise<Map<number, PriceInfo>> {
  const out = new Map<number, PriceInfo>()
  if (appids.length === 0) return out
  const url = `https://store.steampowered.com/api/appdetails?appids=${appids.join(',')}&filters=price_overview&cc=us`
  const res = await throttledFetch(url, PRIO_INTERACTIVE)
  if (!res.ok) throw new Error(`prices ${res.status}`)
  const json = (await res.json()) as Record<string, { success: boolean; data?: { price_overview?: AppDetails['price_overview'] } | [] }>
  for (const id of appids) {
    const entry = json[String(id)]
    if (!entry?.success) continue
    const po = Array.isArray(entry.data) ? undefined : entry.data?.price_overview
    out.set(id, po
      ? { is_free: false, final: po.final, initial: po.initial, discount: po.discount_percent, formatted: po.final_formatted }
      : { is_free: true, final: 0, initial: 0, discount: 0, formatted: 'Free' })
  }
  return out
}

export type ReviewInfo = { summary: string | null; percent: number | null; count: number | null }

export async function fetchReviewSummary(appid: number): Promise<ReviewInfo> {
  const url = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`
  const res = await throttledFetch(url, PRIO_INTERACTIVE)
  if (!res.ok) throw new Error(`reviews ${res.status}`)
  const json = (await res.json()) as { success: number; query_summary?: { review_score_desc: string; total_positive: number; total_reviews: number } }
  const q = json.query_summary
  if (!q || q.total_reviews === 0) return { summary: null, percent: null, count: 0 }
  return { summary: q.review_score_desc, percent: Math.round((q.total_positive / q.total_reviews) * 100), count: q.total_reviews }
}
