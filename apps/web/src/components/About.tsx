import { useEffect } from "react";
import { Logo } from "./Logo";

type Props = { pool: number; onClose: () => void };

const REPO = "https://github.com/steamgram/steamgram";
const AUTHOR = "https://github.com/DanielLavrushin";

export function About({ pool, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="About SteamGram"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="feed max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#111823] p-6 text-zinc-200 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between">
          <Logo className="h-14 w-auto" />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
          Steam<span className="text-steam">Gram</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Doomscroll Steam.</p>

        <div className="mt-4 space-y-3 text-sm leading-relaxed">
          <p>
            Steam has over a hundred thousand games and you have seen the same
            fifty on the front page for years. SteamGram is the other{" "}
            {pool.toLocaleString()}: a bottomless feed of trailers for games you
            have never heard of, most of them made by one or two people who
            would love for you to notice.
          </p>
          <p>
            Swipe up for the next game, sideways for screenshots, tap the
            speaker for sound. If something looks good, the Steam button takes
            you straight to the store page. Nothing to sign up for, nothing to
            buy here.
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs text-zinc-400">
          <dt className="font-medium text-zinc-300">Keys</dt>
          <dd>
            <kbd className="rounded bg-white/10 px-1">J</kbd> /{" "}
            <kbd className="rounded bg-white/10 px-1">K</kbd> next and previous,{" "}
            <kbd className="rounded bg-white/10 px-1">←</kbd>{" "}
            <kbd className="rounded bg-white/10 px-1">→</kbd> media,{" "}
            <kbd className="rounded bg-white/10 px-1">M</kbd> mute,{" "}
            <kbd className="rounded bg-white/10 px-1">S</kbd> share
          </dd>
          <dt className="font-medium text-zinc-300">Made by</dt>
          <dd>
            <a
              href={AUTHOR}
              target="_blank"
              rel="noreferrer"
              className="text-steam hover:underline"
            >
              Daniel Lavrushin
            </a>
            , as a small fun project
          </dd>
          <dt className="font-medium text-zinc-300">Source</dt>
          <dd>
            <a
              href={REPO}
              target="_blank"
              rel="noreferrer"
              className="text-steam hover:underline"
            >
              github.com/steamgram/steamgram
            </a>{" "}
            (MIT)
          </dd>
        </dl>

        <p className="mt-5 text-[11px] leading-relaxed text-zinc-500">
          SteamGram is an independent fan project, not affiliated with or
          endorsed by Valve Corporation. Steam is a trademark of Valve.
          Trailers, screenshots and descriptions belong to their developers and
          publishers and are loaded directly from Steam.
        </p>
      </div>
    </div>
  );
}
