import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(here, '..', 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(path.join(dataDir, 'steamgram.sqlite'))
db.exec('PRAGMA journal_mode = WAL')
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
    price_refreshed_at, reviews_refreshed_at
  ) VALUES (
    @appid, @name, @short_description, @header_image, @background,
    @trailer_mp4, @trailer_hls, @trailer_thumb, @screenshots, @genres, @tags, @developers, @platforms,
    @is_free, @price_final, @price_initial, @discount_percent, @price_formatted, @release_date,
    @review_summary, @review_percent, @review_count, @metacritic, @fetched_at,
    @price_refreshed_at, @reviews_refreshed_at
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
export function markVisited(appid: number, status: 'ok' | 'rejected' | 'error') {
  markVisitedStmt.run(appid, status, Date.now())
}

const isVisitedStmt = db.prepare('SELECT 1 FROM visited WHERE appid = ?')
export function isVisited(appid: number): boolean {
  return isVisitedStmt.get(appid) !== undefined
}

export function countGames(): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM games').get() as { n: number }
  return r.n
}

export function randomGames(limit: number, exclude: number[]): Game[] {
  const placeholders = exclude.map(() => '?').join(',')
  const where = exclude.length ? `WHERE appid NOT IN (${placeholders})` : ''
  const rows = db
    .prepare(`SELECT * FROM games ${where} ORDER BY RANDOM() LIMIT ?`)
    .all(...exclude, limit) as GameRow[]
  return rows.map(rowToGame)
}

export function getGame(appid: number): Game | null {
  const r = db.prepare('SELECT * FROM games WHERE appid = ?').get(appid) as GameRow | undefined
  return r ? rowToGame(r) : null
}

export function kvGet(key: string): string | null {
  const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
  return r?.value ?? null
}
export function kvSet(key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value)
}
