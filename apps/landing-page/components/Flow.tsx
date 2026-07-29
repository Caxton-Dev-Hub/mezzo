"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    state: "DRAFT",
    title: "Create the terms",
    body: "The initiator sets the item, price, delivery method and inspection window. Either side can be buyer or seller.",
  },
  {
    state: "AGREED",
    title: "Both sides accept",
    body: "The counterparty joins through a single-use link and accepts. From this moment the terms are frozen and can't be changed.",
  },
  {
    state: "FUNDED",
    title: "Buyer funds into escrow",
    body: "After reviewing the seller's condition evidence, the buyer pays. Mezzo holds the money — the seller can see it's secured, but can't touch it.",
  },
  {
    state: "SHIPPED",
    title: "Seller sends the item",
    body: "The seller dispatches and records shipment. Every update is timestamped to the shared record.",
  },
  {
    state: "DELIVERED",
    title: "Buyer inspects on arrival",
    body: "Receipt opens a countdown. The buyer can capture their own evidence of the item as it actually arrived.",
  },
  {
    state: "RELEASED",
    title: "Money moves on proof",
    body: "The buyer releases the funds — or they release automatically when the inspection window closes unchallenged.",
  },
];

export function Flow() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 65%", "end 60%"],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const height = useTransform(fill, [0, 1], ["0%", "100%"]);

  return (
    <section id="flow" className="relative border-t border-line-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 md:items-end">
          <Reveal>
            <div>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-5 max-w-md text-balance font-display text-[clamp(2rem,4.5vw,3.4rem)] leading-[1.02] text-vellum">
                One path, from listing to payout.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-md text-fog md:pb-2">
              An escrow only ever moves forward through defined states. Nothing
              skips a step, and once money is released the deal can&apos;t be
              quietly reopened.
            </p>
          </Reveal>
        </div>

        <div ref={ref} className="relative mt-16 pl-2">
          <div className="absolute left-[10px] top-2 h-[calc(100%-1rem)] w-px bg-line-soft sm:left-[14px]" />
          <motion.div
            style={{ height }}
            className="absolute left-[10px] top-2 w-px bg-gradient-to-b from-buyer via-mint to-seller sm:left-[14px]"
          />

          <ol className="space-y-10">
            {STEPS.map((step, i) => (
              <li key={step.state} className="relative pl-10 sm:pl-14">
                <Reveal delay={0.02 * i}>
                  <div className="absolute left-0 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line bg-ink sm:h-[30px] sm:w-[30px]">
                    <span className="h-2 w-2 rounded-full bg-mint sm:h-2.5 sm:w-2.5" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xs text-mute">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-mint">
                      {step.state}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-2xl text-vellum sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-xl leading-relaxed text-fog">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>

        <Reveal>
          <div className="mt-12 flex flex-col gap-4 rounded-2xl border border-line-soft bg-surface/40 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-seller">
                DISPUTED
              </span>
              <span className="h-px w-8 bg-line" />
              <span className="font-mono text-xs text-mute">the other branch</span>
            </div>
            <p className="max-w-lg text-sm leading-relaxed text-fog">
              If the item doesn&apos;t match what was shown, the buyer raises a
              dispute instead of releasing. Both sides submit evidence, and
              resolution ends in either a release to the seller or a refund to
              the buyer — never a silent stalemate.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
