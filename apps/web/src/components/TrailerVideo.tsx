import Hls from "hls.js";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Game } from "../types";

export type SeekDir = "back" | "forward";
/** What the strip gets through `ref`: the same hold-to-seek a finger does on the video. */
export type TrailerHandle = { hold: (dir: SeekDir) => void; release: () => void };

type Props = {
  game: Game;
  active: boolean;
  nearby: boolean; // within one card of the active one: keep the element mounted / preloaded
  muted: boolean;
  onProgress?: (played: number) => void; // fraction of the trailer played, 0 to 1
  ref?: Ref<TrailerHandle>;
};

const HOLD_MS = 250; // a press shorter than this is a tap (pause); longer is a hold (seek)
const SPEED = 3; // forward plays this fast; back scrubs at about the same pace

/**
 * Plays Steam's legacy progressive MP4 when available and falls back to the
 * HLS manifest via hls.js if the MP4 404s. Only the active card plays.
 */
export function TrailerVideo({ game, active, nearby, muted, onProgress, ref: handle }: Props) {
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

  // Progress for the strip's trailer segment: `timeupdate` ticks a few times a
  // second while playing, and `loadstart` puts a fresh source back to zero.
  const reportProgress = () => {
    const el = ref.current;
    if (!el || !onProgress) return;
    const d = el.duration;
    onProgress(Number.isFinite(d) && d > 0 ? el.currentTime / d : 0);
  };

  // Hold to seek: a finger (or arrow key) held on the right plays at SPEED, on
  // the left scrubs backwards; letting go restores what was there before. The
  // gesture lives in refs so its timers never re-render the card.
  const [badge, setBadge] = useState<{ dir: SeekDir; leaving: boolean } | null>(null);
  const press = useRef(0); // timer running from finger down until it counts as a hold
  const hold = useRef<{ ticker: number; wasPaused: boolean } | null>(null);
  const badgeTimer = useRef(0);

  const startHold = useCallback(
    (dir: SeekDir) => {
      const el = ref.current;
      if (!el || hold.current) return;
      window.clearTimeout(badgeTimer.current);
      setBadge({ dir, leaving: false });
      if (dir === "forward") {
        el.playbackRate = SPEED;
        el.play().catch(() => {});
      } else {
        el.pause(); // scrub on a paused element, so playback does not fight the steps
      }
      const ticker = window.setInterval(() => {
        const v = ref.current;
        if (!v) return;
        if (dir === "back") {
          // A seek still in flight is simply retargeted, so the position (and the
          // bar) keep pace even when frames lag behind on a slow connection.
          v.currentTime = Math.max(0, v.currentTime - SPEED / 10);
        } else if (Number.isFinite(v.duration) && v.currentTime >= v.duration - 0.4) {
          v.pause(); // stop short of the end so the loop does not wrap under the finger
        }
      }, 100);
      hold.current = { ticker, wasPaused: userPaused };
    },
    [userPaused],
  );

  const endHold = useCallback(() => {
    const h = hold.current;
    if (!h) return;
    hold.current = null;
    window.clearInterval(h.ticker);
    const el = ref.current;
    if (el) {
      el.playbackRate = 1;
      if (h.wasPaused || !active) el.pause();
      else el.play().catch(() => {});
    }
    setBadge((b) => (b ? { ...b, leaving: true } : b));
    badgeTimer.current = window.setTimeout(() => setBadge(null), 220);
  }, [active]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || press.current || hold.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir: SeekDir = e.clientX - rect.left < rect.width / 2 ? "back" : "forward";
    press.current = window.setTimeout(() => {
      press.current = 0;
      startHold(dir);
    }, HOLD_MS);
  };
  // Up before the threshold is a tap: toggle pause. Anything later ends the hold.
  const onPointerUp = () => {
    if (press.current) {
      window.clearTimeout(press.current);
      press.current = 0;
      setUserPaused((p) => !p);
      return;
    }
    endHold();
  };
  // The browser took the gesture (a swipe) or the pointer left: never a tap.
  const onPointerCancel = () => {
    window.clearTimeout(press.current);
    press.current = 0;
    endHold();
  };

  useImperativeHandle(handle, () => ({ hold: startHold, release: endHold }), [startHold, endHold]);

  // Scrolling away ends a hold; unmounting drops its timers.
  useEffect(() => {
    if (!active) endHold();
  }, [active, endHold]);
  useEffect(
    () => () => {
      window.clearTimeout(press.current);
      window.clearTimeout(badgeTimer.current);
      if (hold.current) window.clearInterval(hold.current.ticker);
    },
    [],
  );

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
    <div
      className="absolute inset-0 select-none"
      style={{ WebkitTouchCallout: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {badge && (
        <div
          className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur ${
            badge.dir === "back" ? "left-6" : "right-16 sm:right-20"
          } ${badge.leaving ? "anim-fade-out" : "anim-pop-in"}`}
        >
          {badge.dir === "back" && <DoubleArrow dir="back" />}
          {SPEED}×
          {badge.dir === "forward" && <DoubleArrow dir="forward" />}
        </div>
      )}
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
      {/* Blurred poster behind the video: only visible when the video is letterboxed (wide viewports). */}
      <img
        src={game.trailer_thumb ?? game.header_image}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-50"
      />
      <video
        ref={ref}
        className="trailer absolute inset-0 h-full w-full object-cover"
        poster={game.trailer_thumb ?? game.header_image}
        muted={muted}
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        onTimeUpdate={reportProgress}
        onSeeked={reportProgress}
        onLoadStart={reportProgress}
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

function DoubleArrow({ dir }: { dir: SeekDir }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      {dir === "forward" ? <path d="M3 5v14l9-7zM13 5v14l9-7z" /> : <path d="M21 5v14l-9-7zM11 5v14l-9-7z" />}
    </svg>
  );
}
