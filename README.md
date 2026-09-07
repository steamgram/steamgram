# SteamGram

[Doomscroll Steam](https://steamgram.app/). A full-screen vertical feed of trailers for games you have
probably never heard of, in the style of TikTok / Instagram Reels.

> SteamGram is an independent fan project. It is not affiliated with, endorsed
> by, or sponsored by Valve Corporation. Steam and the Steam logo are trademarks
> of Valve Corporation. All game titles, trailers, screenshots and descriptions
> belong to their respective developers and publishers and are loaded directly
> from Steam's servers.

<img width="1280" height="591" alt="image" src="https://github.com/user-attachments/assets/a84fff6d-bca7-452b-bfc9-1ab36e0111e3" />

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

The API crawls Steam in the background for as long as it runs. Discovery slows
down as the catalogue is exhausted and the newest releases are swept once a day,
so the pool keeps growing on its own. Set `CRAWL=0` to disable the crawler, or
`CRAWL_TARGET=<n>` to stop discovering once the pool holds that many games.

```sh
pnpm crawl        # run the crawler on its own, without the API
```

## What goes in the pool

A game is kept when Steam lists it as a released game with a trailer or
screenshots and at least ten reviews. Games Steam marks as sexual or adult
content, by content descriptor or by tag, are stored but flagged and never
served. Games that were too new to have reviews are retried after two weeks.

## Keys

`w` / `s` previous and next game · `a` / `d` media · `←` / `→` skip 10s, held: rewind and fast-forward · `m` mute · tap the video to pause, double-tap a side to skip 10s, hold a side to rewind or fast-forward

## Notes

- Steam's store endpoints are unofficial and rate limited; the client throttles
  to ~40 requests/minute and backs off for a minute on 429.
- Trailers use Steam's legacy progressive MP4 (`movie480.mp4`) and fall back to
  the HLS manifest through hls.js if that 404s.
- Prices and review scores refresh on view, not on a schedule: when a feed page
  is served, stale entries (prices > 6h, reviews > 7d) are refreshed first, with a
  short cap (`FRESH_WAIT_MS`, default 800) so the client never waits long. Steam
  traffic therefore scales with games actually seen, not with pool size.
  Interactive refreshes take priority over the background crawler in the shared
  rate limiter, and refreshes are skipped entirely while more than 40 Steam
  requests are already queued, so a traffic spike only makes prices stale.
- The unfiltered feed picks games from an in-memory list of servable ids and
  fetches rows by primary key; the list is rebuilt by a timer every five
  minutes, never on a request, and its length is the game count the UI shows.
  Only tag-filtered feeds run `ORDER BY RANDOM()` over the table, and their
  match counts are cached per filter for five minutes.
- `deploy/nginx.steamgram.app.conf` (plus the snippet next to it, for
  `/etc/nginx/snippets/`) caches static assets, gzips responses and rate-limits
  `/api/` per client at 10 req/s with a burst of 20. `sw.js` and the shell are
  never cached. Apply it by hand with `nginx -t && systemctl reload nginx`;
  `deploy/deploy.sh` only syncs the checkout to `origin/main` and rebuilds the
  container. The file header explains the SNI router and certificate setup on
  the production host. `deploy/nginx.ru.steamgram.app.conf` is the same vhost
  for the home mirror at ru.steamgram.app, kept for networks that block the
  production host's cloud provider.
- Share uses the native share sheet where available and copies a `?game=APPID`
  link otherwise; that link opens the feed on that game.
- The web app is an installable PWA with an app-shell service worker; the API
  and Steam media are never cached. Installed on Android it runs fullscreen,
  with the system bars hidden.

## License

[MIT](LICENSE)
