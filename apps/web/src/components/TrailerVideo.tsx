import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import type { Game } from '../types'

type Props = {
  game: Game
  active: boolean
  nearby: boolean // within one card of the active one: keep the element mounted / preloaded
  muted: boolean
}

/**
 * Plays Steam's legacy progressive MP4 when available and falls back to the
 * HLS manifest via hls.js if the MP4 404s. Only the active card plays.
 */
export function TrailerVideo({ game, active, nearby, muted }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const [useHls, setUseHls] = useState(!game.trailer_mp4)
  const [failed, setFailed] = useState(false)

  // Attach source. hls.js path only when needed.
  useEffect(() => {
    const el = ref.current
    if (!el || !nearby || failed) return
    if (!useHls) {
      el.src = game.trailer_mp4!
      return
    }
    if (!game.trailer_hls) {
      setFailed(true)
      return
    }
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = game.trailer_hls
      return
    }
    if (!Hls.isSupported()) {
      setFailed(true)
      return
    }
    const hls = new Hls({ maxBufferLength: 10, startLevel: 1 })
    hls.loadSource(game.trailer_hls)
    hls.attachMedia(el)
    return () => hls.destroy()
  }, [game, nearby, useHls, failed])

  // Play / pause based on visibility.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (active) {
      el.play().catch(() => {/* autoplay blocked until user gesture */})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [active, useHls])

  if (failed || !nearby) return <ScreenshotFallback game={game} active={active} />

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      poster={game.trailer_thumb ?? game.header_image}
      muted={muted}
      loop
      playsInline
      preload={active ? 'auto' : 'metadata'}
      onError={() => {
        if (!useHls && game.trailer_hls) setUseHls(true)
        else setFailed(true)
      }}
    />
  )
}

export function ScreenshotFallback({ game, active }: { game: Game; active: boolean }) {
  const [i, setI] = useState(0)
  const shots = game.screenshots.length ? game.screenshots : [game.header_image]
  useEffect(() => {
    if (!active || shots.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % shots.length), 4000)
    return () => clearInterval(t)
  }, [active, shots.length])
  return (
    <img
      key={shots[i]}
      src={shots[i]}
      alt=""
      className={`absolute inset-0 h-full w-full object-cover ${active ? 'kenburns' : ''}`}
    />
  )
}
