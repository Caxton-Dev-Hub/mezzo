import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Modules',
  description: 'What each Mezzo backend module owns.',
};

type ModuleEntry = {
  name: string;
  summary: string;
  hasReadme: boolean;
};

const CORE: ModuleEntry[] = [
  {
    name: 'escrow',
    summary:
      'The escrow aggregate and its state machine — the spine every other module builds on. The only code path allowed to write escrow.state.',
    hasReadme: true,
  },
  {
    name: 'evidence',
    summary:
      'Captures and integrity-checks the product condition record — hashing, EXIF, tamper detection — that a dispute later gets adjudicated against.',
    hasReadme: true,
  },
  {
    name: 'ledger',
    summary:
      'The immutable double-entry ledger. Every money movement in the platform posts here as one atomic, balanced set of entries. No other module writes a balance.',
    hasReadme: true,
  },
  {
    name: 'payments',
    summary:
      'The funding and payout path. Money only enters the ledger from a cryptographically verified provider webhook, never a client-reported result.',
    hasReadme: true,
  },
];

const IDENTITY: ModuleEntry[] = [
  {
    name: 'auth',
    summary:
      'Registration, login, JWT issuance and refresh rotation, email verification, and Google OAuth.',
    hasReadme: true,
  },
  {
    name: 'users',
    summary: 'User profiles and the self-service vs. admin-facing surfaces over the same entity.',
    hasReadme: true,
  },
  {
    name: 'kyc',
    summary:
      'Verification tiers, provider integration, and the transaction caps that funding and payouts both check against.',
    hasReadme: true,
  },
];

const RESOLUTION: ModuleEntry[] = [
  {
    name: 'disputes',
    summary:
      'The dispute lifecycle on top of the escrow state machine and the ledger — reason codes, evidence windows, and DisputePacket assembly.',
    hasReadme: true,
  },
  {
    name: 'arbitration',
    summary:
      'The AI dispute analyst. Produces a schema-validated recommendation only — it cannot post to the ledger or transition a dispute.',
    hasReadme: true,
  },
  {
    name: 'admin',
    summary:
      "The arbiter console's API surface, plus cross-cutting audit and observability plumbing. Nothing here moves money on its own.",
    hasReadme: true,
  },
];

const COMMS: ModuleEntry[] = [
  {
    name: 'chat',
    summary:
      'The in-escrow negotiation channel. Buyer/seller conversation stays on-platform, preserving an admissible record if a dispute opens.',
    hasReadme: true,
  },
  {
    name: 'notifications',
    summary:
      'Fans a state transition out to every party as a queued, retried, per-channel delivery, without letting a delivery failure touch the transition itself.',
    hasReadme: true,
  },
  {
    name: 'whatsapp',
    summary:
      'A bidirectional bot over the Meta WhatsApp Cloud API, alongside chat and notifications rather than inside either. Owns no escrow state of its own.',
    hasReadme: true,
  },
];

function ModuleGroup({ title, modules }: { title: string; modules: ModuleEntry[] }) {
  return (
    <div>
      <h2 className="text-lg font-medium text-vellum">{title}</h2>
      <div className="mt-4 space-y-3">
        {modules.map((m) => (
          <div
            key={m.name}
            className="rounded-lg border border-line-soft bg-surface-2/50 p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[13px] text-vellum">{m.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
                apps/api/src/{m.name}/README.md
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fog">{m.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModulesPage() {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.28em] text-mute">SYSTEM</p>
      <h1 className="mt-3 font-display text-4xl text-vellum">Modules</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fog">
        One directory per business domain, each owning its own entities, service logic, and test
        suite — CLAUDE.md fixes this list, so a new concern gets folded into an existing module
        before a new one is proposed. The one-line summaries below are an index, not a
        replacement: each module&apos;s own README documents its actual design decisions —
        the races it closes, the invariants it enforces, the alternatives it rejected and why.
        Open the README for the module you&apos;re about to touch before you touch it.
      </p>

      <div className="mt-10 space-y-10">
        <ModuleGroup title="Core" modules={CORE} />
        <ModuleGroup title="Identity" modules={IDENTITY} />
        <ModuleGroup title="Resolution" modules={RESOLUTION} />
        <ModuleGroup title="Communication" modules={COMMS} />
      </div>

      <div className="mt-10 rounded-xl border border-line-soft bg-ink-2/60 p-5">
        <p className="text-[13px] leading-relaxed text-fog">
          <span className="font-mono text-[12px] text-vellum">common/</span> (shared guards,
          filters, decorators, and the Money value object) and{' '}
          <span className="font-mono text-[12px] text-vellum">config/</span> (env schema and
          boot-time validation) aren&apos;t feature modules and don&apos;t carry their own README —
          they&apos;re documented inline in CLAUDE.md instead.
        </p>
      </div>
    </div>
  );
}
