import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Overview',
  description: 'Engineering documentation for the Mezzo escrow platform.',
};

const ENTRY_POINTS = [
  {
    href: '/docs/architecture',
    label: 'Architecture',
    body: 'How the client, API, ledger, and AI arbitration layer fit together, and the invariants that hold across all of them.',
  },
  {
    href: '/docs/modules',
    label: 'Modules',
    body: 'What each backend module owns, and where its own README goes deeper than this site does.',
  },
  {
    href: '/docs/standards',
    label: 'Standards',
    body: 'Money, testing, and error-handling rules every change is expected to follow before it merges.',
  },
];

export default function DocsIndexPage() {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.28em] text-mute">MEZZO / ENGINEERING</p>
      <h1 className="mt-3 font-display text-4xl text-vellum">Documentation</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fog">
        This is the standing reference for how Mezzo is built, not a tour of what it does. If
        you&apos;re looking for the product pitch, that&apos;s the{' '}
        <Link href="/" className="text-mint underline underline-offset-2 hover:text-mint-deep">
          public site
        </Link>
        . If you&apos;re about to touch code,{' '}
        <Link
          href="/docs/standards"
          className="text-mint underline underline-offset-2 hover:text-mint-deep"
        >
          Standards
        </Link>{' '}
        and the module&apos;s own README (linked from{' '}
        <Link
          href="/docs/modules"
          className="text-mint underline underline-offset-2 hover:text-mint-deep"
        >
          Modules
        </Link>
        ) are the two documents that actually gate a merge — this site is oriented reading, not
        the source of truth for either.
      </p>

      <div className="mt-10 space-y-4">
        {ENTRY_POINTS.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="block rounded-xl border border-line bg-surface p-5 shadow-hairline transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
          >
            <h2 className="text-[15px] font-medium text-vellum">{entry.label}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fog">{entry.body}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-line-soft bg-ink-2/60 p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
          Source of truth
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-fog">
          <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-vellum">
            CLAUDE.md
          </code>{' '}
          at the repo root is the canonical, exhaustive statement of project conventions. Pages
          here summarize and explain the reasoning behind those conventions for people, not
          agents — where the two disagree, <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-vellum">CLAUDE.md</code> wins, and this site is out of
          date.
        </p>
      </div>
    </div>
  );
}
