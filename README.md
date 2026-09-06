# SteamGram

Doomscroll Steam. A full-screen vertical feed of trailers for games you have
probably never heard of, in the style of TikTok / Instagram Reels.

> SteamGram is an independent fan project. It is not affiliated with, endorsed
> by, or sponsored by Valve Corporation. Steam and the Steam logo are trademarks
> of Valve Corporation. All game titles, trailers, screenshots and descriptions
> belong to their respective developers and publishers and are loaded directly
> from Steam's servers.

## Stack

- `apps/web` — Vite + React 19 + TypeScript + Tailwind v4, TanStack Query for the
  infinite feed, hls.js as a fallback player.
- `apps/api` — Hono on Node 22 with the built-in `node:sqlite`. It crawls Steam's
  store search + `appdetails` endpoints, filters to real games with trailers and
  at least a few reviews, and serves random pages from that pool.

## Run

```sh
pnpm install
pnpm dev          # api on :3001 (crawler runs in the background), web on :5173
```

The API keeps crawling until the pool reaches `CRAWL_TARGET` (default 3000).
Set `CRAWL=0` to disable the background crawler, or run it standalone:

```sh
pnpm crawl 500    # crawl until the pool holds 500 games
```

## Keys

`j` / `↓` / space next · `k` / `↑` previous · `m` mute · `l` like

## Notes

- Steam's store endpoints are unofficial and rate limited; the client throttles
  to ~40 requests/minute and backs off for a minute on 429.
- Trailers use Steam's legacy progressive MP4 (`movie480.mp4`) and fall back to
  the HLS manifest through hls.js if that 404s.
- Prices and review scores refresh on view, not on a schedule: when a feed page
  is served, stale entries (prices > 6h, reviews > 7d) are refreshed first, with a
  2.5s cap so the client never waits long. Steam traffic therefore scales with
  games actually seen, not with pool size. Interactive refreshes take priority
  over the background crawler in the shared rate limiter.
- Likes live in `localStorage` for now.

## License

[MIT](LICENSE)
