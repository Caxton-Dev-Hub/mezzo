import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Architecture',
  description: 'How the Mezzo client, API, ledger, and arbitration layer fit together.',
};

const INVARIANTS = [
  {
    title: 'Money moves only through the ledger',
    body: 'Every balance change is a posting inside the same database transaction as the state change it corresponds to, and only ever in response to a cryptographically verified provider webhook — never a client-reported "success."',
  },
  {
    title: 'Escrow state changes only through the state machine',
    body: 'No code path assigns escrow.state directly. Every transition is validated against an explicit table, produces an append-only event, and is optimistic-locked so two concurrent transitions can never both win.',
  },
  {
    title: 'Ledger and audit records are append-only',
    body: 'Corrections are compensating entries, never edits or deletes. A reversed payout is a second posting in the opposite direction, not a mutation of the first.',
  },
  {
    title: 'sum(debits) == sum(credits), globally, always',
    body: 'And per escrow: held + released + refunded == captured. Both are asserted continuously, not just at write time.',
  },
  {
    title: 'The AI arbitration layer recommends; it does not decide',
    body: 'No code path reachable from arbitration can post to the ledger or transition a dispute. A recommendation is a fact that gets read by a human decision, never an action in its own right.',
  },
];

export default function ArchitecturePage() {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] tracking-[0.28em] text-mute">SYSTEM</p>
      <h1 className="mt-3 font-display text-4xl text-vellum">Architecture</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fog">
        Mezzo is a modular NestJS monolith behind a Next.js client, not a services mesh.
        That&apos;s a
        deliberate choice: every module in the API shares one database and one process, which
        makes the cross-module transactions this system depends on (a ledger post and a state
        transition landing atomically, for instance) a local guarantee instead of a distributed
        one.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">Request boundary</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        The web client never talks to Paystack, Flutterwave, object storage, or the AI provider
        directly. Every external integration is mediated by the API, so provider secrets, webhook
        signature verification, and every ledger write stay server-side. The client&apos;s job is
        capture and display — evidence photos, escrow state, chat — not trust decisions.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">The spine</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        Three modules form the core that almost everything else hangs off of:
      </p>
      <ul className="mt-3 space-y-3">
        <li className="rounded-lg border border-line-soft bg-surface-2/60 p-4 text-[13px] leading-relaxed text-fog">
          <span className="font-mono text-[12px] text-vellum">escrow</span> — the state machine.
          An explicit transition table decides what&apos;s legal; nothing else is allowed to
          write{' '}
          <code className="text-vellum">escrow.state</code>.
        </li>
        <li className="rounded-lg border border-line-soft bg-surface-2/60 p-4 text-[13px] leading-relaxed text-fog">
          <span className="font-mono text-[12px] text-vellum">ledger</span> — the double-entry
          journal. Balances are derived, never stored as a mutable field, so a balance is always
          reconstructible from the postings that produced it.
        </li>
        <li className="rounded-lg border border-line-soft bg-surface-2/60 p-4 text-[13px] leading-relaxed text-fog">
          <span className="font-mono text-[12px] text-vellum">evidence</span> — hashed, timestamped
          media capture. The condition record a dispute gets adjudicated against exists before the
          item ships, not after someone complains.
        </li>
      </ul>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        <span className="font-mono text-[12px] text-vellum">payments</span>,{' '}
        <span className="font-mono text-[12px] text-vellum">disputes</span>, and{' '}
        <span className="font-mono text-[12px] text-vellum">arbitration</span> each compose one or
        more of these rather than owning parallel state of their own — a dispute resolution
        doesn&apos;t have its own ledger; it calls the same settlement path a normal release does.
        See{' '}
        <a href="/docs/modules" className="text-mint underline underline-offset-2 hover:text-mint-deep">
          Modules
        </a>{' '}
        for the full breakdown and the reasoning behind where each concern lives.
      </p>

      <h2 className="mt-10 text-lg font-medium text-vellum">Design invariants</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        These hold structurally — enforced by the state machine, the transaction boundary, or the
        schema — not by convention or code review.
      </p>
      <ol className="mt-4 space-y-4">
        {INVARIANTS.map((inv, i) => (
          <li key={inv.title} className="flex gap-4">
            <span className="mt-0.5 font-mono text-[12px] text-mute">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <p className="text-[13px] font-medium text-vellum">{inv.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-fog">{inv.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-lg font-medium text-vellum">The AI boundary</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-fog">
        Arbitration consumes a frozen <code className="text-vellum">DisputePacket</code> — terms,
        the full event timeline, both parties&apos; evidence with integrity flags, and the chat
        transcript — and returns a schema-validated recommendation with a confidence score and
        cited evidence. A recommendation citing no evidence, or falling below the configured
        confidence threshold, is automatically downgraded to{' '}
        <span className="font-mono text-[12px] text-vellum">NEEDS_HUMAN</span>. Anthropic is the
        primary model provider, OpenAI the fallback if the primary call throws. Nothing in this
        path has a ledger or state-machine dependency injected into it — it can&apos;t post money
        or
        move a dispute even if a bug tried to make it.
      </p>
    </div>
  );
}
