import Hls from "hls.js";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Game } from "../types";

export type SeekDir = "back" | "forward";
/** What the strip gets through `ref`: a key pressed and released, treated like a finger on the video. */
export type TrailerHandle = { press: (dir: SeekDir) => void; release: () => void };

type Props = {
  game: Game;
  active: boolean;
  nearby: boolean; // within one card of the active one: keep the element mounted / preloaded
  muted: boolean;
  onProgress?: (played: number) => void; // fraction of the trailer played, 0 to 1
  ref?: Ref<TrailerHandle>;
};

const HOLD_MS = 250; // a press shorter than this is a tap; longer is a hold (seek)
const SPEED = 3; // forward plays this fast; back scrubs at about the same pace
const SKIP_S = 10; // seconds per double-tap (and per extra quick tap)
const DOUBLE_TAP_MS = 300; // a lone tap waits this long for a second one before it pauses
const SKIP_WINDOW_MS = 600; // further taps within this keep adding to the skip

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

  // Seeking by finger or key. A press shorter than HOLD_MS is a tap; longer is a
  // hold that plays at SPEED (right) or scrubs backwards (left) until let go.
  // Two quick taps skip SKIP_S seconds towards the tapped side, and each further
  // quick tap adds another SKIP_S. A lone tap toggles pause once it is clear no
  // second tap follows. It all lives in refs so timers never re-render the card.
  const [badge, setBadge] = useState<{ dir: SeekDir; label: string; leaving: boolean } | null>(null);
  const press = useRef<{ timer: number; onTap: () => void } | null>(null); // down, not yet a hold
  const hold = useRef<{ ticker: number; wasPaused: boolean } | null>(null);
  const tapTimer = useRef(0); // a lone tap waits for a possible second one before it pauses
  const skip = useRef<{ dir: SeekDir; total: number; timer: number } | null>(null); // taps still adding up
  const badgeTimer = useRef(0);

  const showBadge = useCallback((dir: SeekDir, label: string) => {
    window.clearTimeout(badgeTimer.current);
    setBadge({ dir, label, leaving: false });
  }, []);
  const hideBadge = useCallback(() => {
    setBadge((b) => (b ? { ...b, leaving: true } : b));
    badgeTimer.current = window.setTimeout(() => setBadge(null), 220);
  }, []);

  const startHold = useCallback(
    (dir: SeekDir) => {
      const el = ref.current;
      if (!el || hold.current) return;
      showBadge(dir, `${SPEED}×`);
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
    [userPaused, showBadge],
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
    hideBadge();
  }, [active, hideBadge]);

  // Jump SKIP_S towards `dir`; quick repeats add up on the badge ("+20s", "+30s").
  const doSkip = useCallback(
    (dir: SeekDir) => {
      const el = ref.current;
      if (!el) return;
      const prev = skip.current;
      if (prev) window.clearTimeout(prev.timer);
      const run = prev && prev.dir === dir ? prev : { dir, total: 0, timer: 0 };
      run.total += SKIP_S;
      const end = Number.isFinite(el.duration) ? el.duration - 0.4 : Infinity;
      el.currentTime = dir === "forward" ? Math.min(end, el.currentTime + SKIP_S) : Math.max(0, el.currentTime - SKIP_S);
      showBadge(dir, `${dir === "forward" ? "+" : "−"}${run.total}s`);
      run.timer = window.setTimeout(() => {
        skip.current = null;
        hideBadge();
      }, SKIP_WINDOW_MS);
      skip.current = run;
    },
    [showBadge, hideBadge],
  );

  // A finger tap: the second of two quick taps skips, as does any tap while a skip
  // is still adding up; a lone tap pauses once the window for a second one passes.
  const onTap = useCallback(
    (dir: SeekDir, second: boolean) => {
      if (second || skip.current) {
        doSkip(dir);
      } else {
        tapTimer.current = window.setTimeout(() => {
          tapTimer.current = 0;
          setUserPaused((p) => !p);
        }, DOUBLE_TAP_MS);
      }
    },
    [doSkip],
  );

  // Finger or key down: after HOLD_MS it is a hold; let go earlier, it is a tap.
  // A press that starts while a tap is still waiting takes that tap's pause away:
  // it is either the second tap of a double-tap or a hold, and neither pauses.
  const beginPress = useCallback(
    (dir: SeekDir, tap: (second: boolean) => void) => {
      if (press.current || hold.current) return;
      const second = tapTimer.current !== 0;
      window.clearTimeout(tapTimer.current);
      tapTimer.current = 0;
      const timer = window.setTimeout(() => {
        press.current = null;
        startHold(dir);
      }, HOLD_MS);
      press.current = { timer, onTap: () => tap(second) };
    },
    [startHold],
  );
  const endPress = useCallback(() => {
    const p = press.current;
    if (p) {
      press.current = null;
      window.clearTimeout(p.timer);
      p.onTap();
      return;
    }
    endHold();
  }, [endHold]);
  // The browser took the gesture (a swipe): never a tap, and a pause still pending
  // from a tap just before is dropped too, so nothing pauses under the swipe.
  const cancelPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    window.clearTimeout(tapTimer.current);
    tapTimer.current = 0;
    endHold();
  }, [endHold]);
  // The pointer left mid-press (a mouse dragged out): drop the press but keep a
  // pending tap, since touch fires pointerleave right after every pointerup.
  const leavePress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    endHold();
  }, [endHold]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir: SeekDir = e.clientX - rect.left < rect.width / 2 ? "back" : "forward";
    beginPress(dir, (second) => onTap(dir, second));
  };

  // Keys: a short press skips, a held one is a hold, the same as a finger.
  useImperativeHandle(
    handle,
    () => ({ press: (dir: SeekDir) => beginPress(dir, () => doSkip(dir)), release: endPress }),
    [beginPress, doSkip, endPress],
  );

  // Scrolling away ends a hold; unmounting drops every timer.
  useEffect(() => {
    if (!active) endHold();
  }, [active, endHold]);
  useEffect(
    () => () => {
      if (press.current) window.clearTimeout(press.current.timer);
      if (hold.current) window.clearInterval(hold.current.ticker);
      if (skip.current) window.clearTimeout(skip.current.timer);
      window.clearTimeout(tapTimer.current);
      window.clearTimeout(badgeTimer.current);
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
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
      onPointerLeave={leavePress}
      onContextMenu={(e) => e.preventDefault()}
    >
      {badge && (
        <div
          className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur ${
            badge.dir === "back" ? "left-6" : "right-16 sm:right-20"
          } ${badge.leaving ? "anim-fade-out" : "anim-pop-in"}`}
        >
          {badge.dir === "back" && <DoubleArrow dir="back" />}
          {badge.label}
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
