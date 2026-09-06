import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { countGames, getGame, randomGames } from './db.js'
import { crawlForever } from './crawl.js'
import { ensureFresh } from './refresh.js'

const app = new Hono()
app.use('/api/*', cors())

app.get('/api/health', (c) => c.json({ ok: true, games: countGames() }))

app.get('/api/feed', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 8, 30)
  const exclude = (c.req.query('exclude') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(-500)
  // The client asks for a page a few cards early, so a short wait here is invisible.
  const games = await ensureFresh(randomGames(limit, exclude), 2500)
  return c.json({ games, pool: countGames() })
})

app.get('/api/games/:id', (c) => {
  const g = getGame(Number(c.req.param('id')))
  return g ? c.json(g) : c.json({ error: 'not found' }, 404)
})

const port = Number(process.env.PORT) || 3001
serve({ fetch: app.fetch, port }, () => {
  console.log(`api listening on http://localhost:${port} (pool: ${countGames()} games)`)
})

// Keep the pool growing in the background unless disabled.
if (process.env.CRAWL !== '0') {
  crawlForever({ target: Number(process.env.CRAWL_TARGET) || 3000 })
}
