import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { Game } from "../types";

type Props = {
  game: Game;
  active: boolean;
  nearby: boolean; // within one card of the active one: keep the element mounted / preloaded
  muted: boolean;
};

/**
 * Plays Steam's legacy progressive MP4 when available and falls back to the
 * HLS manifest via hls.js if the MP4 404s. Only the active card plays.
 */
export function TrailerVideo({ game, active, nearby, muted }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [useHls, setUseHls] = useState(!game.trailer_mp4);
  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  // Attach source. hls.js path only when needed.
  useEffect(() => {
    const el = ref.current;
    if (!el || !nearby || failed) return;
    if (!useHls) {
      el.src = game.trailer_mp4!;
      return;
    }
    if (!game.trailer_hls) {
      setFailed(true);
      return;
    }
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = game.trailer_hls;
      return;
    }
    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }
    const hls = new Hls({ maxBufferLength: 10, startLevel: 1 });
    hls.loadSource(game.trailer_hls);
    hls.attachMedia(el);
    return () => hls.destroy();
  }, [game, nearby, useHls, failed]);

  // React does not reliably update the `muted` property after mount, so set it by hand.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted, useHls, failed, nearby]);

  // Play / pause based on visibility (and the user's own tap).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
    if (active && !userPaused) {
      el.play().catch(() => {
        /* autoplay blocked until user gesture */
      });
    } else {
      el.pause();
    }
  }, [active, useHls, muted, userPaused]);

  // A card that scrolls away forgets its manual pause.
  useEffect(() => {
    if (!active) setUserPaused(false);
  }, [active]);

  if (failed) return <ScreenshotFallback game={game} active={active} />;
  if (!nearby) {
    return (
      <img
        src={game.trailer_thumb ?? game.header_image}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <div className="absolute inset-0" onClick={() => setUserPaused((p) => !p)}>
      {userPaused && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="anim-pop-in flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
            <svg
              viewBox="0 0 24 24"
              className="ml-1 h-8 w-8"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
      <video
        ref={ref}
        className="absolute inset-0 h-full w-full object-cover"
        poster={game.trailer_thumb ?? game.header_image}
        muted={muted}
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        onError={() => {
          if (!useHls && game.trailer_hls) setUseHls(true);
          else setFailed(true);
        }}
      />
    </div>
  );
}

export function ScreenshotFallback({
  game,
  active,
}: {
  game: Game;
  active: boolean;
}) {
  const [i, setI] = useState(0);
  const shots = game.screenshots.length
    ? game.screenshots
    : [game.header_image];
  useEffect(() => {
    if (!active || shots.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % shots.length), 4000);
    return () => clearInterval(t);
  }, [active, shots.length]);
  return (
    <img
      key={shots[i]}
      src={shots[i]}
      alt=""
      className={`absolute inset-0 h-full w-full object-cover ${active ? "kenburns" : ""}`}
    />
  );
}
