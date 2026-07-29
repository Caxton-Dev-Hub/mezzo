"use client";

import { motion, useReducedMotion } from "motion/react";

const SEGMENTS = [
  { label: "fund", color: "var(--color-buyer)" },
  { label: "hold", color: "var(--color-mint)" },
  { label: "release", color: "var(--color-seller)" },
];

export function HeroTag() {
  const reduce = useReducedMotion();

  return (
    <div className="mb-7 inline-flex items-center gap-3 text-fog">
      <span className="flex items-end gap-[3px]" aria-hidden>
        {SEGMENTS.map((seg, i) => (
          <motion.span
            key={seg.label}
            className="block h-3 w-[3px] origin-bottom rounded-full"
            style={{ backgroundColor: seg.color }}
            initial={{ opacity: 0.28, scaleY: 0.55 }}
            animate={
              reduce
                ? { opacity: 0.7, scaleY: 1 }
                : { opacity: [0.28, 1, 0.28], scaleY: [0.55, 1, 0.55] }
            }
            transition={
              reduce
                ? undefined
                : {
                    duration: 2.1,
                    times: [0, 0.5, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.5,
                  }
            }
          />
        ))}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.24em]">
        <span className="text-vellum/90">Evidence-first escrow</span>
        <span className="mx-2 text-line">/</span>
        <span className="text-mute">proof, not promises</span>
      </span>
    </div>
  );
}
