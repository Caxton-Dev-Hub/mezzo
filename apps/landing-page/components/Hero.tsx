"use client";

import { motion, useReducedMotion } from "motion/react";
import { HoldCanvas } from "./HoldCanvas";
import { HeroTag } from "./HeroTag";
import { appUrl } from "../lib/app-url";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const reduce = useReducedMotion();

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease },
        };

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grain opacity-60" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line to-transparent" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[85%] w-full max-w-4xl opacity-90">
          <HoldCanvas />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,var(--color-ink)_78%)]" />

      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-5 pb-20 pt-28 sm:px-8">
        <div className="hidden justify-between text-xs uppercase tracking-[0.2em] text-mute md:flex">
          <motion.span {...rise(0.1)} className="font-mono text-buyer">
            ← buyer funds
          </motion.span>
          <motion.span {...rise(0.1)} className="font-mono text-seller">
            releases to seller →
          </motion.span>
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <motion.div {...rise(0.05)} className="flex justify-center">
            <HeroTag />
          </motion.div>

          <h1 className="text-balance font-display text-[clamp(2.9rem,8vw,6rem)] leading-[0.95] text-vellum">
            <motion.span {...rise(0.12)} className="block">
              Trade with strangers.
            </motion.span>
            <motion.span {...rise(0.22)} className="block italic text-fog">
              Trust the middle.
            </motion.span>
          </h1>

          <motion.p
            {...rise(0.34)}
            className="mx-auto mt-7 max-w-xl text-balance text-lg leading-relaxed text-fog"
          >
            Mezzo holds the money and the record between two people who have no
            reason to trust each other. Sellers document an item&apos;s condition
            before it&apos;s funded — so money releases on proof, not on promises.
          </motion.p>

          <motion.div
            {...rise(0.46)}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <a
              href={appUrl("/register")}
              className="w-full rounded-full bg-mint px-6 py-3 text-center text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Start an escrow
            </a>
            <a
              href="#flow"
              className="w-full rounded-full border border-line px-6 py-3 text-center text-sm font-medium text-vellum transition-colors hover:border-fog sm:w-auto"
            >
              See how it works
            </a>
          </motion.div>
        </div>

        <motion.div
          {...rise(0.6)}
          className="mx-auto mt-16 grid w-full max-w-2xl grid-cols-3 divide-x divide-line-soft rounded-2xl border border-line-soft bg-surface/50 backdrop-blur"
        >
          {[
            { k: "Held in escrow now", v: "₦1.24b", note: "across live trades" },
            { k: "Released on proof", v: "98.2%", note: "no dispute raised" },
            { k: "Median resolution", v: "31 hrs", note: "when disputed" },
          ].map((stat) => (
            <div key={stat.k} className="px-4 py-5 text-center">
              <div className="tabular font-mono text-2xl text-vellum">{stat.v}</div>
              <div className="mt-1 text-xs font-medium text-vellum/80">{stat.k}</div>
              <div className="text-[11px] text-mute">{stat.note}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
