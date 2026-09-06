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

`j` / `↓` / space next · `k` / `↑` previous · `←` `→` media · `m` mute · `s` share · `b` save · `i` hide info · tap the video to pause

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
- Share uses the native share sheet where available and copies a `?game=APPID`
  link otherwise; that link opens the feed on that game.
- The web app is an installable PWA with an app-shell service worker; the API
  and Steam media are never cached. Google Analytics loads only in production
  builds, from `VITE_GA_ID` in `apps/web/.env.production`.

## Deploy

Production runs as a single Docker container (API + static web bundle) behind
nginx. See [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml)
and [`deploy/`](deploy/).

```sh
docker compose up -d --build     # listens on 127.0.0.1:20090
sudo cp deploy/nginx.steamgram.app.conf /etc/nginx/sites-available/steamgram.app
sudo ln -s /etc/nginx/sites-available/steamgram.app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d steamgram.app -d www.steamgram.app
```

To ship a new version: push to `main`, then run `deploy/deploy.sh` on the server.
The SQLite pool lives in the `steamgram-data` volume and survives rebuilds.

## License

[MIT](LICENSE)
