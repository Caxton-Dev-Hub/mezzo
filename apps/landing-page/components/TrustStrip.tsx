import { Reveal } from "./Reveal";

const ITEMS = [
  { k: "Regulated rails", v: "Funding and payouts run on Paystack in naira." },
  { k: "Verified, not reported", v: "Funds recognized only on signed provider webhooks." },
  { k: "KYC-tiered limits", v: "Transaction ceilings scale with identity verification." },
  { k: "On-platform record", v: "All buyer–seller chat stays admissible in a dispute." },
  { k: "Automatic release", v: "Unchallenged inspection windows settle on their own." },
  { k: "Immutable audit", v: "Every state change and privileged action is logged." },
];

export function TrustStrip() {
  return (
    <section className="relative border-t border-line-soft py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <h2 className="max-w-xl text-balance font-display text-[clamp(1.7rem,3.5vw,2.6rem)] leading-[1.05] text-vellum">
            The guarantees underneath the trade.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item, i) => (
            <Reveal key={item.k} delay={0.03 * i}>
              <div className="border-t border-line pt-4">
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-mint">
                  {item.k}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fog">{item.v}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
