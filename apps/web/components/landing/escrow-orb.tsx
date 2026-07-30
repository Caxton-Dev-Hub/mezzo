'use client';

import { useEffect, useState } from 'react';
import { Wallet, Package, Camera, Timer, CheckCheck, Scale } from 'lucide-react';

type Placement = 'top' | 'right' | 'bottom' | 'left';

type OrbNode = {
  id: string;
  label: string;
  caption: string;
  angle: number;
  placement: Placement;
  color: string;
  icon: typeof Wallet;
  chip: string;
  holding: string;
  branch?: boolean;
};

const RING = 37;
const SPOKE_INNER = 18;
const SPOKE_OUTER = 29.6;
const STEP_MS = 2400;

const NODES: OrbNode[] = [
  {
    id: 'buyer',
    label: 'Buyer',
    caption: 'pays in',
    angle: -90,
    placement: 'top',
    color: 'var(--color-buyer)',
    icon: Wallet,
    chip: 'FUNDED',
    holding: 'held in escrow',
  },
  {
    id: 'seller',
    label: 'Seller',
    caption: 'ships out',
    angle: -30,
    placement: 'right',
    color: 'var(--color-seller)',
    icon: Package,
    chip: 'SHIPPED',
    holding: 'held in escrow',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    caption: 'photos + hash',
    angle: 30,
    placement: 'right',
    color: 'var(--color-vellum)',
    icon: Camera,
    chip: 'DELIVERED',
    holding: 'held in escrow',
  },
  {
    id: 'inspection',
    label: 'Inspection',
    caption: '72-hour window',
    angle: 90,
    placement: 'bottom',
    color: 'var(--color-mint)',
    icon: Timer,
    chip: '71:58:04',
    holding: 'held in escrow',
  },
  {
    id: 'release',
    label: 'Release',
    caption: 'double-entry',
    angle: 150,
    placement: 'left',
    color: 'var(--color-mint)',
    icon: CheckCheck,
    chip: 'RELEASED',
    holding: 'paid to seller',
  },
  {
    id: 'arbiter',
    label: 'Arbiter',
    caption: 'only if contested',
    angle: 210,
    placement: 'left',
    color: 'var(--color-danger)',
    icon: Scale,
    chip: 'DISPUTED',
    holding: 'held pending review',
    branch: true,
  },
];

const LABEL_POSITION: Record<Placement, string> = {
  top: 'bottom-[calc(100%+1.4cqw)] left-1/2 -translate-x-1/2 text-center',
  right: 'left-[calc(100%+1.6cqw)] top-1/2 -translate-y-1/2 text-left',
  bottom: 'top-[calc(100%+1.4cqw)] left-1/2 -translate-x-1/2 text-center',
  left: 'right-[calc(100%+1.6cqw)] top-1/2 -translate-y-1/2 text-right',
};

function polar(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: 50 + radius * Math.cos(rad), y: 50 + radius * Math.sin(rad) };
}

export function EscrowOrb() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % NODES.length);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  const current = NODES[active]!;

  return (
    <div
      role="img"
      aria-label="A Mezzo escrow holding 450,000 naira at the centre, with the buyer, seller, evidence, inspection window, release and arbiter each connected to it."
      className="@container relative mx-auto aspect-square w-full max-w-[540px]"
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="orb-core">
            <stop offset="0%" stopColor="#1b2a3f" />
            <stop offset="62%" stopColor="#121a25" />
            <stop offset="100%" stopColor="#0d131b" />
          </radialGradient>
          <radialGradient id="orb-halo">
            <stop offset="0%" stopColor="rgba(127,232,176,0.20)" />
            <stop offset="52%" stopColor="rgba(91,141,239,0.26)" />
            <stop offset="74%" stopColor="rgba(91,141,239,0.10)" />
            <stop offset="100%" stopColor="rgba(91,141,239,0)" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="50" r="34" fill="url(#orb-halo)" className="orb-breathe" />
        <circle cx="50" cy="50" r={RING} fill="none" stroke="var(--color-line)" strokeWidth="0.18" />
        <circle
          cx="50"
          cy="50"
          r={RING - 6}
          fill="none"
          stroke="var(--color-line-soft)"
          strokeWidth="0.14"
          strokeDasharray="0.6 1.6"
        />

        {NODES.map((node, index) => {
          const from = polar(node.angle, SPOKE_INNER);
          const to = polar(node.angle, SPOKE_OUTER);
          const isActive = index === active;
          return (
            <g key={node.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isActive ? node.color : 'var(--color-mute)'}
                strokeWidth={isActive ? 0.3 : 0.2}
                strokeDasharray={node.branch ? '0.8 0.8' : undefined}
                opacity={isActive ? 0.9 : 0.42}
                className="transition-all duration-500"
              />
              {isActive ? (
                <line
                  x1={to.x}
                  y1={to.y}
                  x2={from.x}
                  y2={from.y}
                  stroke={node.color}
                  strokeWidth="0.7"
                  strokeLinecap="round"
                  strokeDasharray="3 60"
                  className="orb-travel"
                />
              ) : null}
            </g>
          );
        })}

        <circle cx="50" cy="50" r="17" fill="url(#orb-core)" />
        <circle
          cx="50"
          cy="50"
          r="17"
          fill="none"
          stroke={current.color}
          strokeWidth="0.22"
          opacity="0.45"
          className="transition-all duration-700"
        />
      </svg>

      <div className="absolute left-1/2 top-1/2 flex w-[30cqw] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[1cqw]">
        <span className="font-mono text-[clamp(7px,1.5cqw,11px)] uppercase tracking-[0.22em] text-mute">
          {current.holding}
        </span>
        <span className="tabular font-mono text-[clamp(17px,4.4cqw,29px)] leading-none text-vellum">
          ₦450,000
        </span>
        <span
          className="tabular mt-[0.6cqw] rounded-full border px-[2cqw] py-[0.7cqw] font-mono text-[clamp(7px,1.55cqw,11px)] tracking-[0.12em] transition-colors duration-500"
          style={{
            color: current.color,
            borderColor: `color-mix(in oklab, ${current.color} 38%, transparent)`,
            backgroundColor: `color-mix(in oklab, ${current.color} 9%, transparent)`,
          }}
        >
          {current.chip}
        </span>
      </div>

      {NODES.map((node, index) => {
        const point = polar(node.angle, RING);
        const isActive = index === active;
        const Icon = node.icon;
        return (
          <div
            key={node.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          >
            <div
              className="flex h-[13cqw] w-[13cqw] items-center justify-center rounded-full border bg-ink-2 transition-all duration-500"
              style={{
                borderColor: isActive
                  ? `color-mix(in oklab, ${node.color} 60%, transparent)`
                  : 'var(--color-line)',
                boxShadow: isActive
                  ? `0 0 0 0.35cqw color-mix(in oklab, ${node.color} 12%, transparent)`
                  : 'none',
              }}
            >
              <Icon
                className="h-[5.4cqw] w-[5.4cqw] transition-colors duration-500"
                style={{ color: isActive ? node.color : 'var(--color-mute)' }}
                strokeWidth={1.5}
              />
            </div>
            <div className={`absolute whitespace-nowrap ${LABEL_POSITION[node.placement]}`}>
              <div
                className="text-[clamp(10px,2.1cqw,15px)] leading-tight transition-colors duration-500"
                style={{ color: isActive ? 'var(--color-vellum)' : 'var(--color-fog)' }}
              >
                {node.label}
              </div>
              <div className="font-mono text-[clamp(7px,1.4cqw,10px)] leading-tight text-mute">
                {node.caption}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
