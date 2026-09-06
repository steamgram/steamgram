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
    review_summary, review_percent, review_count, metacritic, fetched_at
  ) VALUES (
    @appid, @name, @short_description, @header_image, @background,
    @trailer_mp4, @trailer_hls, @trailer_thumb, @screenshots, @genres, @tags, @developers, @platforms,
    @is_free, @price_final, @price_initial, @discount_percent, @price_formatted, @release_date,
    @review_summary, @review_percent, @review_count, @metacritic, @fetched_at
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
