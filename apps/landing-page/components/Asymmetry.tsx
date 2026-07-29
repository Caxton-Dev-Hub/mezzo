import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

export function Asymmetry() {
  return (
    <section className="relative border-t border-line-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <Eyebrow>The problem</Eyebrow>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mt-5 max-w-2xl text-balance font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] text-vellum">
            Distance turns a fair trade into a standoff.
          </h2>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
          <Reveal>
            <div className="h-full rounded-2xl border border-line-soft bg-surface/40 p-7">
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-buyer">
                The buyer&apos;s risk
              </div>
              <p className="mt-4 text-lg leading-relaxed text-fog">
                Pay first and you might receive the wrong item, a damaged one, or
                nothing at all — with no record of what you were promised.
              </p>
            </div>
          </Reveal>

          <div className="flex items-center justify-center py-2 md:py-0">
            <div className="flex flex-col items-center gap-2">
              <div className="hidden h-full w-px bg-gradient-to-b from-buyer/40 via-mint/60 to-seller/40 md:block md:h-24" />
              <span className="rounded-full border border-mint/30 bg-mint/10 px-3 py-1 font-mono text-xs text-mint">
                Mezzo
              </span>
              <div className="hidden h-full w-px bg-gradient-to-b from-seller/40 via-mint/60 to-buyer/40 md:block md:h-24" />
            </div>
          </div>

          <Reveal delay={0.1}>
            <div className="h-full rounded-2xl border border-line-soft bg-surface/40 p-7">
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-seller">
                The seller&apos;s risk
              </div>
              <p className="mt-4 text-lg leading-relaxed text-fog">
                Ship first and you might never be paid — or be accused of
                sending something you didn&apos;t, with no way to prove otherwise.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <p className="mx-auto mt-14 max-w-2xl text-balance text-center text-lg leading-relaxed text-vellum/90">
            Mezzo stands in the middle as the one party both sides can rely on:
            it holds the funds until the item is confirmed, and it keeps a
            tamper-proof record of everything that was agreed and shown.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
