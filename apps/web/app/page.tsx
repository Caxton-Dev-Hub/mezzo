import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, Fingerprint, Scale, Layers } from 'lucide-react';
import { REFRESH_COOKIE_NAME } from '../lib/server-config';
import { Wordmark } from '../components/shell/wordmark';
import { buttonVariants } from '../components/ui/button';
import { EscrowOrb } from '../components/landing/escrow-orb';

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#disputes', label: 'Disputes' },
  { href: '#fees', label: 'Fees' },
];

const GUARANTEES = [
  {
    icon: Layers,
    title: 'Double-entry ledger',
    body: 'Every movement is posted twice. Balances reconcile to the kobo, and nothing is stored as a floating-point number.',
  },
  {
    icon: Fingerprint,
    title: 'Evidence hashed at capture',
    body: 'Photos are fingerprinted the moment they are taken, so nobody can swap in a different item later.',
  },
  {
    icon: Scale,
    title: 'Reviewed by a person',
    body: 'A contested escrow goes to an arbiter with the agreed terms, both evidence sets, and the full message history.',
  },
];

const STEPS = [
  {
    state: 'AGREED',
    actor: 'Both sides',
    tone: 'text-vellum',
    rule: 'bg-vellum',
    title: 'The terms get pinned down',
    body: 'Price, description, delivery window, and how long the buyer has to inspect. Nothing starts until both parties accept the same terms.',
  },
  {
    state: 'FUNDED',
    actor: 'Buyer',
    tone: 'text-buyer',
    rule: 'bg-buyer',
    title: 'The buyer pays into escrow',
    body: 'The money leaves the buyer and stops. The seller can see that it landed. Neither side can move it.',
  },
  {
    state: 'SHIPPED',
    actor: 'Seller',
    tone: 'text-seller',
    rule: 'bg-seller',
    title: 'The seller documents, then sends',
    body: 'Before it ships, the seller photographs the item and records its condition. Each capture is hashed and time-stamped as it happens.',
  },
  {
    state: 'DELIVERED',
    actor: 'Buyer',
    tone: 'text-buyer',
    rule: 'bg-buyer',
    title: 'The inspection clock starts',
    body: 'The buyer compares what arrived against what was documented. The money has still not moved.',
  },
  {
    state: 'RELEASED',
    actor: 'Mezzo',
    tone: 'text-mint',
    rule: 'bg-mint',
    title: 'The money moves once',
    body: 'The buyer accepts, or the inspection window closes on its own. Funds release to the seller and the ledger records both halves of the entry.',
  },
];

const EVIDENCE_RECORD = [
  { field: 'captured', value: '2026-07-30 14:02:11 WAT' },
  { field: 'device', value: 'rear camera, in-app' },
  { field: 'sha-256', value: 'a3f9c1…7e02b4' },
  { field: 'status', value: 'locked' },
];

const DISPUTE_FACTS = [
  'Either side can raise a dispute any time before the inspection window closes.',
  'Raising one freezes the escrow. The money stays exactly where it is while the case is open.',
  'Both parties upload evidence and see what the other filed. Nothing is submitted in secret.',
  'The outcome is a release, a refund, or a split, and it is posted to the ledger like any other movement.',
];

const FEES = [
  { label: 'Escrow fee', value: '1.5%', note: 'of the transaction, capped at ₦7,500' },
  { label: 'Paid by', value: 'Seller', note: 'or split with the buyer, agreed in the terms' },
  { label: 'Payout to bank', value: '₦0', note: 'included, settles same day on business days' },
  { label: 'Refund to buyer', value: '₦0', note: 'no fee is charged on a refunded escrow' },
];

export default async function LandingPage() {
  const cookieStore = await cookies();
  const signedIn = Boolean(cookieStore.get(REFRESH_COOKIE_NAME));

  return (
    <div className="min-h-screen bg-ink">
      <header className="sticky top-0 z-50 border-b border-line-soft bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink">
            <Wordmark className="text-base" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-sm text-sm text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link href="/dashboard" className={buttonVariants({ size: 'sm' })}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  Log in
                </Link>
                <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                  Start an escrow
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-14rem] h-[52rem] w-[52rem] -translate-x-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(91,141,239,0.16) 0%, rgba(127,232,176,0.07) 38%, rgba(11,15,20,0) 68%)',
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-[11px] tracking-[0.28em] text-mute">
                AGREED <span className="text-line">→</span> FUNDED{' '}
                <span className="text-line">→</span> SHIPPED <span className="text-line">→</span>{' '}
                DELIVERED <span className="text-line">→</span>{' '}
                <span className="text-mint">RELEASED</span>
              </p>
              <h1 className="font-display mt-7 text-[3.25rem] leading-[0.95] tracking-tight text-vellum sm:text-7xl">
                Money that waits
                <br />
                for <em className="italic text-mint">proof</em>.
              </h1>
              <p className="mx-auto mt-7 max-w-xl text-[17px] leading-relaxed text-fog">
                Mezzo holds the buyer&rsquo;s payment while the seller documents the item — photos,
                condition, timestamps. The funds move when both sides agree, or when an arbiter
                decides. Never on a promise.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/register" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
                  Start an escrow
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
                <a
                  href="#how"
                  className={buttonVariants({ variant: 'secondary', className: 'w-full sm:w-auto' })}
                >
                  See how it works
                </a>
              </div>
              <p className="mt-5 text-[13px] text-mute">
                Identity verification is required before you can receive a payout.
              </p>
            </div>

            <div className="mt-10 px-10 sm:mt-12 sm:px-16">
              <EscrowOrb />
            </div>
          </div>
        </section>

        <section className="border-y border-line-soft bg-ink-2">
          <div className="mx-auto grid max-w-6xl gap-px bg-line-soft sm:grid-cols-3">
            {GUARANTEES.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-ink-2 px-6 py-9 sm:px-8">
                  <Icon className="h-5 w-5 text-mint" strokeWidth={1.5} />
                  <h2 className="mt-4 text-[15px] text-vellum">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-b border-line-soft">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mute">
                The state machine
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight text-vellum sm:text-5xl">
                How the money moves
              </h2>
              <p className="mt-5 max-w-xl leading-relaxed text-fog">
                Five states, in order. An escrow can only ever be in one of them, and every change
                is written down with who caused it.
              </p>
            </div>

            <ol className="mt-16 space-y-px">
              {STEPS.map((step) => (
                <li
                  key={step.state}
                  className="group grid gap-4 border-t border-line-soft py-8 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-12"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-[7px] h-px w-6 shrink-0 ${step.rule} opacity-60`} />
                    <div>
                      <div className={`font-mono text-[13px] tracking-[0.1em] ${step.tone}`}>
                        {step.state}
                      </div>
                      <div className="mt-1 text-xs text-mute">{step.actor}</div>
                    </div>
                  </div>
                  <div className="max-w-2xl">
                    <h3 className="text-lg text-vellum">{step.title}</h3>
                    <p className="mt-2 leading-relaxed text-fog">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="evidence" className="scroll-mt-16 border-b border-line-soft bg-ink-2">
          <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mute">
                The part other escrows skip
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight text-vellum sm:text-5xl">
                The item gets documented
                <br />
                before the money moves
              </h2>
              <p className="mt-6 max-w-lg leading-relaxed text-fog">
                Holding funds is the easy half. The hard half is knowing what was actually in the
                box. Mezzo makes the seller capture the item in-app — not upload a file from the
                camera roll — and fingerprints each photo the instant it is taken.
              </p>
              <p className="mt-4 max-w-lg leading-relaxed text-fog">
                When a buyer says the item is wrong, there is a record from before it shipped to
                compare against. Arguments become checkable.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-2 shadow-panel">
              <div className="rounded-xl border border-line-soft bg-ink">
                <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
                    Evidence record
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-mint">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                    verified
                  </span>
                </div>
                <div className="flex aspect-[4/3] items-center justify-center border-b border-line-soft bg-gradient-to-br from-surface-2 to-ink">
                  <div className="text-center">
                    <Fingerprint className="mx-auto h-8 w-8 text-line" strokeWidth={1.25} />
                    <p className="mt-3 font-mono text-[11px] text-mute">IMG_0114 · 3.2 MB</p>
                  </div>
                </div>
                <dl className="divide-y divide-line-soft">
                  {EVIDENCE_RECORD.map((row) => (
                    <div key={row.field} className="flex items-baseline justify-between px-5 py-3">
                      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
                        {row.field}
                      </dt>
                      <dd className="tabular font-mono text-[13px] text-vellum">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section id="disputes" className="scroll-mt-16 border-b border-line-soft">
          <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mute">
                When it goes wrong
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight text-vellum">
                Somebody has to decide
              </h2>
              <p className="mt-6 leading-relaxed text-fog">
                Most deals close without this. The ones that do not are the reason escrow exists, so
                here is exactly what happens.
              </p>
            </div>
            <ul className="space-y-px">
              {DISPUTE_FACTS.map((fact) => (
                <li
                  key={fact}
                  className="flex gap-5 border-t border-line-soft py-6 text-[17px] leading-relaxed text-fog"
                >
                  <span className="mt-[13px] h-px w-6 shrink-0 bg-danger opacity-60" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="fees" className="scroll-mt-16 border-b border-line-soft bg-ink-2">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mute">Pricing</p>
              <h2 className="font-display mt-4 text-4xl leading-tight text-vellum sm:text-5xl">
                One fee, taken at release
              </h2>
              <p className="mt-5 leading-relaxed text-fog">
                Nothing is charged while an escrow is open, and nothing is charged on a refund.
              </p>
            </div>
            <dl className="mt-14 grid gap-px border border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
              {FEES.map((fee) => (
                <div key={fee.label} className="bg-ink-2 px-6 py-8">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
                    {fee.label}
                  </dt>
                  <dd className="tabular mt-3 font-mono text-3xl text-vellum">{fee.value}</dd>
                  <p className="mt-2 text-[13px] leading-relaxed text-mute">{fee.note}</p>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(127,232,176,0.09) 0%, rgba(11,15,20,0) 70%)',
            }}
          />
          <div className="relative mx-auto max-w-2xl px-6 py-28 text-center">
            <h2 className="font-display text-4xl leading-tight text-vellum sm:text-5xl">
              Send the next one through Mezzo
            </h2>
            <p className="mx-auto mt-5 max-w-md leading-relaxed text-fog">
              Set the terms, share a link, and let the money sit still until the item checks out.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className={buttonVariants({ className: 'w-full sm:w-auto' })}>
                Start an escrow
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'secondary', className: 'w-full sm:w-auto' })}
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark className="text-sm" />
          <p className="font-mono text-[11px] tracking-[0.14em] text-mute">
            ESCROW THAT DOCUMENTS THE ITEM BEFORE MONEY MOVES
          </p>
          <p className="text-[13px] text-mute">© {new Date().getFullYear()} Mezzo</p>
        </div>
      </footer>
    </div>
  );
}
