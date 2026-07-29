import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const ROWS = [
  { ts: "14:08:02", memo: "Buyer funds escrow", debit: "50,000.00", credit: "—" },
  { ts: "14:08:02", memo: "Escrow holding", debit: "—", credit: "50,000.00" },
  { ts: "21:40:11", memo: "Release to seller", debit: "50,000.00", credit: "—" },
  { ts: "21:40:11", memo: "Seller payout", debit: "—", credit: "50,000.00" },
];

export function Ledger() {
  return (
    <section id="ledger" className="relative border-t border-line-soft py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <Reveal>
            <Eyebrow>The ledger</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 text-balance font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] text-vellum">
              Every naira is traceable to the entry that moved it.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-fog">
              Balances aren&apos;t a number someone can edit — they&apos;re
              derived from an append-only journal. Money is tracked in whole
              kobo, never floating-point, and corrections are made by posting a
              reversing entry, not by rewriting history.
            </p>
          </Reveal>
          <Reveal delay={0.14}>
            <dl className="mt-8 space-y-3">
              {[
                ["sum(debits) == sum(credits)", "holds globally, at all times"],
                ["held + released + refunded == captured", "holds per escrow"],
              ].map(([inv, note]) => (
                <div
                  key={inv}
                  className="rounded-xl border border-line-soft bg-surface/40 px-4 py-3"
                >
                  <dt className="font-mono text-sm text-mint">{inv}</dt>
                  <dd className="mt-0.5 text-xs text-mute">{note}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.08}>
          <div className="overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-panel">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                Journal · escrow #4471
              </span>
              <span className="font-mono text-[11px] text-mint">balanced</span>
            </div>

            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-mute">
              <span>time</span>
              <span>entry</span>
              <span className="text-right">debit ₦</span>
              <span className="text-right">credit ₦</span>
            </div>

            <div className="divide-y divide-line-soft">
              {ROWS.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-5 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-mute">{row.ts}</span>
                  <span className="text-vellum/90">{row.memo}</span>
                  <span className="tabular text-right font-mono text-vellum/80">
                    {row.debit}
                  </span>
                  <span className="tabular text-right font-mono text-vellum/80">
                    {row.credit}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 border-t border-line px-5 py-3.5 text-sm">
              <span />
              <span className="font-mono text-xs uppercase tracking-wide text-mute">
                totals
              </span>
              <span className="tabular text-right font-mono text-mint">100,000.00</span>
              <span className="tabular text-right font-mono text-mint">100,000.00</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
