"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const GLYPHS = "0123456789abcdef";

type ScrambleTextProps = {
  value: string;
  className?: string;
  durationMs?: number;
};

export function ScrambleText({ value, className, durationMs = 900 }: ScrambleTextProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }

    const node = ref.current;
    if (!node) return;

    let raf = 0;
    let start = 0;

    const run = (now: number) => {
      if (!start) start = now;
      const progress = Math.min(1, (now - start) / durationMs);
      const revealed = Math.floor(progress * value.length);
      let next = "";
      for (let i = 0; i < value.length; i += 1) {
        if (value[i] === " " || value[i] === "·") {
          next += value[i];
        } else if (i < revealed) {
          next += value[i];
        } else {
          next += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
      }
      setDisplay(next);
      if (progress < 1) {
        raf = requestAnimationFrame(run);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          raf = requestAnimationFrame(run);
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs, reduce]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
