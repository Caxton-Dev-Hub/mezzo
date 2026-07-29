"use client";

import { useEffect, useRef } from "react";

type Particle = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  phase: "in" | "held" | "out";
  t: number;
  hold: number;
  orbit: number;
  drift: number;
};

const BUYER = { r: 91, g: 141, b: 239 };
const SELLER = { r: 232, g: 147, b: 92 };
const MINT = { r: 127, g: 232, b: 176 };

function mix(a: typeof BUYER, b: typeof BUYER, t: number) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function spawn(): Particle {
  return {
    angle: Math.PI * (0.75 + Math.random() * 0.5),
    radius: 1,
    speed: 0.004 + Math.random() * 0.004,
    size: 1.1 + Math.random() * 1.6,
    phase: "in",
    t: 0,
    hold: 0,
    orbit: Math.random() * Math.PI * 2,
    drift: 0.2 + Math.random() * 0.8,
  };
}

export function HoldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const particles: Particle[] = Array.from({ length: 46 }, spawn);
    let seal = 0;
    let raf = 0;
    let last = performance.now();

    const cx = () => width * 0.5;
    const cy = () => height * 0.52;
    const coreR = () => Math.min(width, height) * 0.16;

    const draw = (delta: number) => {
      const centerX = cx();
      const centerY = cy();
      const R = coreR();
      const maxR = Math.min(width, height) * 0.62;

      ctx.clearRect(0, 0, width, height);

      // held-value ring
      const ringPulse = 0.5 + Math.sin(last * 0.0012) * 0.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(127, 232, 176, ${0.18 + ringPulse * 0.12})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, R * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(35, 44, 57, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // seal flash
      if (seal > 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, R + (1 - seal) * R * 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(127, 232, 176, ${seal * 0.5})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        seal = Math.max(0, seal - delta * 0.0016);
      }

      // core glow
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, R);
      glow.addColorStop(0, `rgba(127, 232, 176, ${0.16 + seal * 0.25})`);
      glow.addColorStop(1, "rgba(127, 232, 176, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, R, 0, Math.PI * 2);
      ctx.fill();

      let held = 0;

      for (const p of particles) {
        if (p.phase === "in") {
          p.radius += p.speed * delta * 0.06 * p.drift * (p.radius * 0.02 + 0.6);
          const rr = 1 - Math.min(1, p.radius);
          const dist = R + rr * (maxR - R);
          const x = centerX + Math.cos(p.angle) * dist;
          const y = centerY + Math.sin(p.angle) * dist * 0.7;
          const c = BUYER;
          const alpha = 0.25 + (1 - rr) * 0.55;

          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            centerX + Math.cos(p.angle) * (dist + 14),
            centerY + Math.sin(p.angle) * (dist + 14) * 0.7,
          );
          ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
          ctx.fill();

          if (p.radius >= 1) {
            p.phase = "held";
            p.hold = 0;
          }
        } else if (p.phase === "held") {
          held += 1;
          p.orbit += 0.0009 * delta * (0.6 + p.drift);
          p.hold += delta;
          const wobble = R * (0.72 + Math.sin(p.orbit * 3) * 0.06);
          const x = centerX + Math.cos(p.orbit) * wobble;
          const y = centerY + Math.sin(p.orbit) * wobble * 0.85;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${MINT.r}, ${MINT.g}, ${MINT.b}, 0.85)`;
          ctx.fill();

          if (p.hold > 2600 + Math.random() * 1400) {
            p.phase = "out";
            p.t = 0;
            p.angle = Math.PI * (Math.random() * 0.5 - 0.25);
            seal = 1;
          }
        } else {
          p.t += p.speed * delta * 0.05 * (0.8 + p.drift);
          const tt = Math.min(1, p.t);
          const dist = R + tt * (maxR - R);
          const x = centerX + Math.cos(p.angle) * dist;
          const y = centerY + Math.sin(p.angle) * dist * 0.7;
          const c = mix(MINT, SELLER, tt);
          const alpha = 0.7 * (1 - tt) + 0.1;

          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            centerX + Math.cos(p.angle) * (dist - 14),
            centerY + Math.sin(p.angle) * (dist - 14) * 0.7,
          );
          ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * 0.5})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
          ctx.fill();

          if (p.t >= 1) Object.assign(p, spawn());
        }
      }

      // held count node
      const label = held / particles.length;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 2.5 + label * 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(237, 231, 219, 0.9)";
      ctx.fill();
    };

    const loop = (now: number) => {
      const delta = Math.min(48, now - last);
      last = now;
      draw(delta);
      raf = requestAnimationFrame(loop);
    };

    if (reduce) {
      for (const p of particles) {
        p.phase = "held";
        p.orbit = Math.random() * Math.PI * 2;
      }
      draw(16);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="h-full w-full"
    />
  );
}
