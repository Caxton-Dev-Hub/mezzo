import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { ScrambleText } from "./ScrambleText";

const CHECKS = [
  { k: "Content hash", v: "verified on upload" },
  { k: "Captured at", v: "2026-07-21 14:08 WAT" },
  { k: "Device / EXIF", v: "extracted & sealed" },
  { k: "Duplicate check", v: "no prior match" },
];

export function Evidence() {
  return (
    <section id="evidence" className="relative border-t border-line-soft py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow>Evidence-first</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] text-vellum">
              Proof comes before the money, not after the fight.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-fog">
              Most escrow treats photos as something to dig up once a dispute
              starts. Mezzo flips that: the seller documents the item&apos;s
              condition up front, and the buyer reviews it before a single naira
              moves.
            </p>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-4 max-w-lg leading-relaxed text-fog">
              Each photo and video is hashed, timestamped and checked for
              tampering the moment it&apos;s captured. The record is
              append-only — it can be added to, never quietly edited.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="relative rounded-3xl border border-line bg-surface/60 p-2 shadow-panel">
            <div className="rounded-[20px] border border-line-soft bg-ink-2 p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                  Evidence · sealed
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 font-mono text-[11px] text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  verified
                </span>
              </div>

              <div className="mt-5 flex aspect-[4/3] items-center justify-center rounded-xl border border-line-soft bg-gradient-to-br from-surface-2 to-ink">
                <div className="grain h-full w-full rounded-xl opacity-40" />
              </div>

              <div className="mt-5 rounded-lg border border-line-soft bg-surface/60 px-3 py-2.5">
                <div className="font-mono text-[11px] text-mute">sha-256</div>
                <ScrambleText
                  value="9f2c·a71e·04bd·c8f6·33a9·e15b·7d20·6cae"
                  className="tabular block font-mono text-sm text-mint"
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {CHECKS.map((c) => (
                  <div key={c.k}>
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-mute">
                      {c.k}
                    </dt>
                    <dd className="mt-0.5 text-sm text-vellum/90">{c.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
