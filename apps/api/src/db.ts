import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(here, '..', 'data')
mkdirSync(dataDir, { recursive: true })

/** Steam tags that mark a game as adult content. Matched against the stored tag list. */
export const ADULT_TAGS = ['Sexual Content', 'Hentai', 'NSFW', 'Nudity']

export const db = new DatabaseSync(path.join(dataDir, 'steamgram.sqlite'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA busy_timeout = 5000') // wait instead of throwing SQLITE_BUSY when a writer overlaps
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    appid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    short_description TEXT NOT NULL,
    header_image TEXT NOT NULL,
    background TEXT,
    trailer_mp4 TEXT,
    trailer_hls TEXT,
    trailer_thumb TEXT,
    screenshots TEXT NOT NULL,   -- JSON string[]
    genres TEXT NOT NULL,        -- JSON string[]
    tags TEXT NOT NULL,          -- JSON string[]
    developers TEXT NOT NULL,    -- JSON string[]
    platforms TEXT NOT NULL,     -- JSON string[]
    is_free INTEGER NOT NULL,
    price_final INTEGER,         -- cents
    price_initial INTEGER,
    discount_percent INTEGER,
    price_formatted TEXT,
    release_date TEXT,
    review_summary TEXT,
    review_percent INTEGER,
    review_count INTEGER,
    metacritic INTEGER,
    fetched_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS visited (
    appid INTEGER PRIMARY KEY,
    status TEXT NOT NULL,        -- ok | rejected | error
    visited_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// Additive migrations for existing databases.
const cols = new Set((db.prepare('PRAGMA table_info(games)').all() as { name: string }[]).map((c) => c.name))
if (!cols.has('price_refreshed_at')) db.exec('ALTER TABLE games ADD COLUMN price_refreshed_at INTEGER')
if (!cols.has('reviews_refreshed_at')) db.exec('ALTER TABLE games ADD COLUMN reviews_refreshed_at INTEGER')
if (!cols.has('adult')) {
  // NULL = not yet checked against Steam's content descriptors; the crawler fills these in.
  db.exec('ALTER TABLE games ADD COLUMN adult INTEGER')
  db.prepare(
    `UPDATE games SET adult = 1 WHERE ${ADULT_TAGS.map(() => 'tags LIKE ?').join(' OR ')}`,
  ).run(...ADULT_TAGS.map((t) => `%"${t}"%`))
}

export type GameRow = {
  appid: number
  name: string
  short_description: string
  header_image: string
  background: string | null
  trailer_mp4: string | null
  trailer_hls: string | null
  trailer_thumb: string | null
  screenshots: string
  genres: string
  tags: string
  developers: string
  platforms: string
  is_free: number
  price_final: number | null
  price_initial: number | null
  discount_percent: number | null
  price_formatted: string | null
  release_date: string | null
  review_summary: string | null
  review_percent: number | null
  review_count: number | null
  metacritic: number | null
  fetched_at: number
  price_refreshed_at: number | null
  reviews_refreshed_at: number | null
  adult: number | null
}

export type Game = Omit<GameRow, 'screenshots' | 'genres' | 'tags' | 'developers' | 'platforms' | 'is_free'> & {
  screenshots: string[]
  genres: string[]
  tags: string[]
  developers: string[]
  platforms: string[]
  is_free: boolean
}

export function rowToGame(r: GameRow): Game {
  return {
    ...r,
    screenshots: JSON.parse(r.screenshots),
    genres: JSON.parse(r.genres),
    tags: JSON.parse(r.tags),
    developers: JSON.parse(r.developers),
    platforms: JSON.parse(r.platforms),
    is_free: r.is_free === 1,
  }
}

const insertGame = db.prepare(`
  INSERT OR REPLACE INTO games (
    appid, name, short_description, header_image, background,
    trailer_mp4, trailer_hls, trailer_thumb, screenshots, genres, tags, developers, platforms,
    is_free, price_final, price_initial, discount_percent, price_formatted, release_date,
    review_summary, review_percent, review_count, metacritic, fetched_at,
    price_refreshed_at, reviews_refreshed_at, adult
  ) VALUES (
    @appid, @name, @short_description, @header_image, @background,
    @trailer_mp4, @trailer_hls, @trailer_thumb, @screenshots, @genres, @tags, @developers, @platforms,
    @is_free, @price_final, @price_initial, @discount_percent, @price_formatted, @release_date,
    @review_summary, @review_percent, @review_count, @metacritic, @fetched_at,
    @price_refreshed_at, @reviews_refreshed_at, @adult
  )
`)

export function saveGame(g: Game) {
  insertGame.run({
    ...g,
    screenshots: JSON.stringify(g.screenshots),
    genres: JSON.stringify(g.genres),
    tags: JSON.stringify(g.tags),
    developers: JSON.stringify(g.developers),
    platforms: JSON.stringify(g.platforms),
    is_free: g.is_free ? 1 : 0,
  })
}

const updatePriceStmt = db.prepare(`
  UPDATE games SET is_free = ?, price_final = ?, price_initial = ?, discount_percent = ?, price_formatted = ?, price_refreshed_at = ?
  WHERE appid = ?
`)
export function updatePrice(appid: number, p: { is_free: boolean; final: number | null; initial: number | null; discount: number; formatted: string | null }) {
  updatePriceStmt.run(p.is_free ? 1 : 0, p.final, p.initial, p.discount, p.formatted, Date.now(), appid)
}

const updateReviewsStmt = db.prepare(`
  UPDATE games SET review_summary = ?, review_percent = ?, review_count = ?, reviews_refreshed_at = ? WHERE appid = ?
`)
export function updateReviews(appid: number, r: { summary: string | null; percent: number | null; count: number | null }) {
  updateReviewsStmt.run(r.summary, r.percent, r.count, Date.now(), appid)
}

export function getGames(appids: number[]): Game[] {
  if (appids.length === 0) return []
  const rows = db
    .prepare(`SELECT * FROM games WHERE appid IN (${appids.map(() => '?').join(',')})`)
    .all(...appids) as GameRow[]
  const byId = new Map(rows.map((r) => [r.appid, rowToGame(r)]))
  return appids.map((id) => byId.get(id)).filter((g): g is Game => !!g)
}

const markVisitedStmt = db.prepare(
  'INSERT OR REPLACE INTO visited (appid, status, visited_at) VALUES (?, ?, ?)',
)
export function markVisited(appid: number, status: VisitStatus) {
  markVisitedStmt.run(appid, status, Date.now())
}

export type VisitStatus = 'ok' | 'rejected' | 'few_reviews' | 'error'

const getVisitedStmt = db.prepare('SELECT status, visited_at FROM visited WHERE appid = ?')
export function getVisited(appid: number): { status: VisitStatus; visited_at: number } | undefined {
  return getVisitedStmt.get(appid) as { status: VisitStatus; visited_at: number } | undefined
}

/** SQL fragment + params matching games that carry at least one of `tags` and none of `without`. */
function tagClause(tags: string[], without: string[] = []): { sql: string; params: string[] } {
  const anyOf = (list: string[]) => `SELECT 1 FROM json_each(games.tags) WHERE value IN (${list.map(() => '?').join(',')})`
  let sql = ''
  if (tags.length) sql += ` AND EXISTS (${anyOf(tags)})`
  if (without.length) sql += ` AND NOT EXISTS (${anyOf(without)})`
  return { sql, params: [...tags, ...without] }
}

export function countGames(tags: string[] = [], without: string[] = []): number {
  const t = tagClause(tags, without)
  const r = db.prepare(`SELECT COUNT(*) AS n FROM games WHERE adult IS NOT 1${t.sql}`).get(...t.params) as { n: number }
  return r.n
}

/** Most common tags across the served pool, for the filter UI. */
export function tagCounts(limit = 80): { tag: string; n: number }[] {
  return db
    .prepare(
      `SELECT value AS tag, COUNT(*) AS n FROM games, json_each(games.tags)
       WHERE adult IS NOT 1 GROUP BY value ORDER BY n DESC LIMIT ?`,
    )
    .all(limit) as { tag: string; n: number }[]
}

export function setAdult(appid: number, adult: boolean) {
  db.prepare('UPDATE games SET adult = ? WHERE appid = ?').run(adult ? 1 : 0, appid)
}

/** Games not yet checked against Steam's content descriptors, oldest first. */
export function uncheckedGames(limit: number): number[] {
  return (db.prepare('SELECT appid FROM games WHERE adult IS NULL ORDER BY RANDOM() LIMIT ?').all(limit) as { appid: number }[]).map((r) => r.appid)
}

export function countUnchecked(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM games WHERE adult IS NULL').get() as { n: number }).n
}

export function randomGames(limit: number, exclude: number[], tags: string[] = [], without: string[] = []): Game[] {
  const placeholders = exclude.map(() => '?').join(',')
  const t = tagClause(tags, without)
  const where = `WHERE adult IS NOT 1${exclude.length ? ` AND appid NOT IN (${placeholders})` : ''}${t.sql}`
  const rows = db
    .prepare(`SELECT * FROM games ${where} ORDER BY RANDOM() LIMIT ?`)
    .all(...exclude, ...t.params, limit) as GameRow[]
  return rows.map(rowToGame)
}

export function getGame(appid: number): Game | null {
  const r = db.prepare('SELECT * FROM games WHERE appid = ? AND adult IS NOT 1').get(appid) as GameRow | undefined
  return r ? rowToGame(r) : null
}

export function kvGet(key: string): string | null {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
  return r?.value ?? null
}
export function kvSet(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value)
}
