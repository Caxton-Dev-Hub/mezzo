import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

export function Arbitration() {
  return (
    <section id="arbitration" className="relative border-t border-line-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <Reveal>
            <div>
              <Eyebrow>AI arbitration</Eyebrow>
              <h2 className="mt-5 max-w-md text-balance font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] text-vellum">
                It recommends. A person decides.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-md text-fog md:pb-2">
              When a trade is disputed, Mezzo reads the full evidence bundle and
              transaction history and drafts a recommendation — cited to the
              exact photos and moments it relied on. No AI path can move money.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <div className="rounded-2xl border border-line-soft bg-surface/50 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                  Recommendation · draft
                </span>
                <span className="rounded-full border border-line bg-ink px-2.5 py-1 font-mono text-[11px] text-fog">
                  confidence 0.86
                </span>
              </div>

              <p className="mt-5 text-lg leading-relaxed text-vellum">
                &ldquo;Listing evidence shows an unscratched screen. Buyer&apos;s
                arrival photos show a cracked panel matching no earlier frame.
                Recommend&nbsp;
                <span className="text-seller">refund to buyer</span>.&rdquo;
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {["listing · photo 3", "arrival · photo 1", "chat · 14:22", "terms · frozen"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-line-soft bg-ink px-2.5 py-1 font-mono text-[11px] text-fog"
                    >
                      {tag}
                    </span>
                  ),
                )}
              </div>

              <div className="mt-7 flex items-center gap-3 border-t border-line-soft pt-5">
                <span className="h-8 w-8 rounded-full border border-line bg-gradient-to-br from-surface-2 to-ink" />
                <div className="text-sm">
                  <div className="text-vellum">Awaiting arbiter review</div>
                  <div className="font-mono text-[11px] text-mute">
                    no funds move without a human action
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid gap-4">
            {[
              {
                t: "Cited, never vague",
                b: "Every recommendation points to the specific evidence it used, so a human reviewer can check the reasoning in seconds.",
              },
              {
                t: "Confidence, honestly",
                b: "Clear-cut cases surface a high-confidence draft. Contradictory ones are routed straight to manual review instead of a guess.",
              },
              {
                t: "Human-in-the-loop, always",
                b: "The model can suggest release or refund. Only an arbiter can execute it — and every action is written to the audit trail.",
              },
            ].map((card, i) => (
              <Reveal key={card.t} delay={0.05 * i}>
                <div className="rounded-2xl border border-line-soft bg-surface/40 p-6">
                  <h3 className="font-display text-xl text-vellum">{card.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fog">{card.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
