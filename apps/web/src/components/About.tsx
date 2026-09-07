import { Logo } from "./Logo";
import { Sheet } from "./Sheet";

type Props = { pool: number; onClose: () => void };

const REPO = "https://github.com/steamgram/steamgram";
const AUTHOR = "https://github.com/DanielLavrushin";

export function About({ pool, onClose }: Props) {
  return (
    <Sheet label="About SteamGram" onClose={onClose}>
      <Logo className="h-14 w-auto" />
      <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
          Steam<span className="text-steam">Gram</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Doomscroll Steam.</p>

        <div className="mt-4 space-y-3 text-sm leading-relaxed">
          <p>
            Steam has close to 140,000 games and adds around 20,000 more every year. You have seen the same fifty on the
            front page for as long as you can remember. SteamGram is for the rest: a bottomless feed of trailers for games you
            have never heard of, most of them made by one or two people who would love for you to notice. There are{" "}
            {pool.toLocaleString()} in the reel right now and the crawler keeps adding more.
          </p>
          <p>
            It is made for that half hour before sleep when you promised yourself
            just one more scroll. Instead of someone else's dinner, you get a
            game you did not know existed. Whether that counts as doomscrolling
            or research is between you and your wishlist.
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs text-zinc-400">
          <dt className="font-medium text-zinc-300">Keys</dt>
          <dd>
            <kbd className="rounded bg-white/10 px-1">W</kbd> /{" "}
            <kbd className="rounded bg-white/10 px-1">S</kbd> previous and next game,{" "}
            <kbd className="rounded bg-white/10 px-1">A</kbd> /{" "}
            <kbd className="rounded bg-white/10 px-1">D</kbd> media,{" "}
            <kbd className="rounded bg-white/10 px-1">M</kbd> mute, hold{" "}
            <kbd className="rounded bg-white/10 px-1">←</kbd> /{" "}
            <kbd className="rounded bg-white/10 px-1">→</kbd> rewind and fast-forward
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
    </Sheet>
  );
}
