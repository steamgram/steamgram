import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { countMatchingCached, getGame, getGames, poolSize, randomGames, startPoolRefresh, tagCounts } from './db.js'
import { crawlForever } from './crawl.js'
import { ensureFresh } from './refresh.js'

const app = new Hono()
const FRESH_WAIT_MS = Number(process.env.FRESH_WAIT_MS) || 800
app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true, games: poolSize() }))

app.get('/api/feed', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 8, 30)
  const exclude = (c.req.query('exclude') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(-500)
  const tags = parseTags(c.req.query('tags')) // a game needs any of these
  const without = parseTags(c.req.query('without')) // and none of these; this wins over `tags`
  // The client asks for a page a few cards early, so a short wait here is invisible.
  // Kept short: under load every request would otherwise sit out the full timeout.
  const games = await ensureFresh(randomGames(limit, exclude, tags, without), FRESH_WAIT_MS)
  const filtered = tags.length > 0 || without.length > 0
  return c.json({ games, pool: poolSize(), matching: filtered ? countMatchingCached(tags, without) : null })
})

function parseTags(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20)
}

let tagsCache: { at: number; data: { tag: string; n: number }[] } | null = null
app.get('/api/tags', (c) => {
  if (!tagsCache || Date.now() - tagsCache.at > 10 * 60_000) tagsCache = { at: Date.now(), data: tagCounts() }
  return c.json({ tags: tagsCache.data })
})

/** Several games by id, for the saved list; unknown or flagged ids are simply omitted. */
app.get('/api/games', (c) => {
  const ids = (c.req.query('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200)
  return c.json({ games: getGames(ids).filter((g) => g.adult !== 1) })
})

app.get('/api/games/:id', (c) => {
  const g = getGame(Number(c.req.param('id')))
  return g ? c.json(g) : c.json({ error: 'not found' }, 404)
})

// In production the container serves the built web app from ./public (relative to cwd).
const webDir = process.env.WEB_DIR ?? 'public'
if (existsSync(webDir)) {
  app.use('/*', serveStatic({ root: webDir }))
  app.get('*', serveStatic({ path: `${webDir}/index.html` }))
  console.log(`serving web app from ${webDir}`)
}

// The feed serves from an in-memory id pool; build it before the first request.
startPoolRefresh()

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on http://localhost:${port} (pool: ${poolSize()} games)`)
})

// Keep the pool growing in the background unless disabled.
if (process.env.CRAWL !== '0') {
  crawlForever({ target: Number(process.env.CRAWL_TARGET) || Infinity })
}
