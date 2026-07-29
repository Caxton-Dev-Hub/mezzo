import { Reveal } from "./Reveal";
import { appUrl } from "../lib/app-url";

export function CTA() {
  return (
    <section id="start" className="relative border-t border-line-soft py-28 sm:py-36">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--color-mint)_9%,transparent),transparent_60%)]" />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <h2 className="text-balance font-display text-[clamp(2.4rem,6vw,4.5rem)] leading-[0.98] text-vellum">
            Put the middle
            <span className="italic text-fog"> between you.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mx-auto mt-6 max-w-lg text-balance text-lg leading-relaxed text-fog">
            Start an escrow in minutes. Document the item, invite the other
            party, and let proof — not trust — decide where the money goes.
          </p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={appUrl("/register")}
              className="w-full rounded-full bg-mint px-7 py-3.5 text-center text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Start an escrow
            </a>
            <a
              href="#flow"
              className="w-full rounded-full border border-line px-7 py-3.5 text-center text-sm font-medium text-vellum transition-colors hover:border-fog sm:w-auto"
            >
              Talk to us first
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
