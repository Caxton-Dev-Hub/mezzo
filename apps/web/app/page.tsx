import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { Fingerprint, Scale, Layers } from 'lucide-react';
import { REFRESH_COOKIE_NAME } from '../lib/server-config';
import { Wordmark } from '../components/shell/wordmark';
import { PoweredBy } from '../components/shell/powered-by';
import { buttonVariants } from '../components/ui/button';
import { EscrowOrb } from '../components/landing/escrow-orb';
import { WaitlistForm } from '../components/landing/waitlist-form';
import { faqSchema, jsonLdGraph, serviceSchema } from '../lib/site';

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#evidence', label: 'Evidence' },
  { href: '#disputes', label: 'Disputes' },
  { href: '#fees', label: 'Fees' },
  { href: '#faq', label: 'FAQ' },
];

const FAQS = [
  {
    question: 'Is Mezzo open yet?',
    answer:
      'Not to the public. We are letting in a small first group so every early escrow gets our full attention. Join the waitlist and we will email you when it is your turn — early sign-ups get priority.',
  },
  {
    question: 'How does Mezzo hold the money?',
    answer:
      'The buyer pays into a Mezzo escrow instead of paying the seller directly, and the money stops there. Neither side can move it until the item has been delivered and inspected, or until an arbiter decides the outcome.',
  },
  {
    question: 'How long does the buyer have to inspect the item?',
    answer:
      'The inspection window is agreed in the terms before the escrow starts, so both sides know it in advance. If it closes without a dispute, the funds release to the seller automatically.',
  },
  {
    question: 'What does Mezzo cost?',
    answer:
      'One fee of 1.5% of the transaction, capped at ₦7,500, charged once when the money is released. Payouts to a Nigerian bank account are included and settle same day on business days. Nothing is charged while an escrow is open, and nothing is charged on a refund.',
  },
  {
    question: 'What happens if the item arrives wrong or damaged?',
    answer:
      'Either side can raise a dispute any time before the inspection window closes. Raising one freezes the escrow so the money stays exactly where it is. Both parties upload evidence and see what the other filed, and an arbiter decides on a release, a refund, or a split.',
  },
  {
    question: 'Why must the seller photograph the item inside the app?',
    answer:
      'A file from the camera roll proves nothing about when it was taken. Mezzo fingerprints each photo with a SHA-256 hash the moment it is captured, so a record of the item’s condition exists before it ships and cannot be swapped later.',
  },
  {
    question: 'Do I have to verify my identity?',
    answer:
      'Yes, before you can receive a payout. Verification is what keeps a payout tied to a real, accountable person on the other side of the deal.',
  },
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-line-soft bg-ink/70 shadow-hairline backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
          >
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
                <a href="#waitlist" className={buttonVariants({ size: 'sm' })}>
                  Join the waitlist
                </a>
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
                'radial-gradient(circle, rgba(46,95,194,0.06) 0%, rgba(10,122,82,0.04) 38%, rgba(250,248,241,0) 68%)',
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
              <div id="waitlist" className="mx-auto mt-9 max-w-md scroll-mt-24">
                <WaitlistForm />
                <p className="mt-4 text-[13px] text-mute">
                  Mezzo isn&rsquo;t open yet. Join the waitlist and we&rsquo;ll email you when
                  it&rsquo;s your turn — no spam, one email.
                </p>
              </div>
              <div className="mt-5 flex justify-center">
                <a
                  href="#how"
                  className="rounded-sm text-[13px] text-fog underline decoration-line underline-offset-4 transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
                >
                  See how it works
                </a>
              </div>
            </div>

            <div className="mt-10 px-10 sm:mt-12 sm:px-16">
              <EscrowOrb />
            </div>
          </div>
        </section>

        <section className="border-y border-line-soft bg-ink-2/70">
          <div className="mx-auto grid max-w-6xl gap-4 px-6 py-14 sm:grid-cols-3">
            {GUARANTEES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="reveal group rounded-xl border border-line bg-surface p-6 shadow-card transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift sm:p-7"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line-soft bg-ink-2 text-mint shadow-hairline transition-colors duration-300 group-hover:border-mint/30">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                  </span>
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
                  className="reveal group -mx-4 grid gap-4 rounded-lg border-t border-line-soft px-4 py-8 transition-colors duration-300 hover:bg-surface/70 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-12"
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

            <div className="reveal rounded-2xl border border-line bg-surface p-2 shadow-lift transition-shadow duration-500 hover:shadow-float">
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
                <div className="relative aspect-[4/3] overflow-hidden border-b border-line-soft bg-surface-2">
                  <Image
                    src="/evidence-item-sample.jpg"
                    alt="Item photographed inside the app before it ships"
                    fill
                    sizes="(min-width: 1024px) 480px, 100vw"
                    className="object-cover"
                  />
                  <p className="absolute bottom-3 right-4 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[11px] text-mute backdrop-blur-sm">
                    IMG_0114 · 3.2 MB
                  </p>
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
                  className="reveal flex gap-5 border-t border-line-soft py-6 text-[17px] leading-relaxed text-fog"
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
            <dl className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEES.map((fee) => (
                <div
                  key={fee.label}
                  className="reveal rounded-xl border border-line bg-surface px-6 py-7 shadow-card transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
                >
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

        <section id="faq" className="scroll-mt-16 border-b border-line-soft">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mute">
                Questions
              </p>
              <h2 className="font-display mt-4 text-4xl leading-tight text-vellum sm:text-5xl">
                The things people ask first
              </h2>
              <p className="mt-5 max-w-xl leading-relaxed text-fog">
                If your question is about where the money is at any given moment, the answer is
                always the same: in escrow, until the terms say otherwise.
              </p>
            </div>

            <dl className="mt-14">
              {FAQS.map((faq) => (
                <div
                  key={faq.question}
                  className="reveal -mx-4 grid gap-3 rounded-lg border-t border-line-soft px-4 py-7 transition-colors duration-300 hover:bg-surface/70 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-12"
                >
                  <dt className="text-[17px] leading-snug text-vellum">{faq.question}</dt>
                  <dd className="max-w-2xl leading-relaxed text-fog">{faq.answer}</dd>
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
                'radial-gradient(circle, rgba(10,122,82,0.05) 0%, rgba(250,248,241,0) 70%)',
            }}
          />
          <div className="relative mx-auto max-w-2xl px-6 py-28 text-center">
            <h2 className="font-display text-4xl leading-tight text-vellum sm:text-5xl">
              Be first in line
            </h2>
            <p className="mx-auto mt-5 max-w-md leading-relaxed text-fog">
              We&rsquo;re opening Mezzo to a small first group. Join the waitlist and set the terms
              on the next one through Mezzo as soon as your invite lands.
            </p>
            <div className="mx-auto mt-9 max-w-md">
              <WaitlistForm />
            </div>
            <p className="mt-6 text-[13px] text-mute">
              Already have an account?{' '}
              <Link
                href="/login"
                className="rounded-sm text-vellum underline decoration-line underline-offset-4 transition-colors hover:text-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
              >
                Log in
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line-soft bg-ink-2/60">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,22rem)_1fr_1fr]">
            <div>
              <Wordmark className="text-sm" />
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-mute">
                Escrow for people trading in naira who would rather not take a stranger at their
                word. The item gets documented, then the money moves.
              </p>
            </div>
            <nav aria-label="Product">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
                Product
              </h2>
              <ul className="mt-4 space-y-2.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="rounded-sm text-[13px] text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Account">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
                Account
              </h2>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <a
                    href="#waitlist"
                    className="rounded-sm text-[13px] text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
                  >
                    Join the waitlist
                  </a>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="rounded-sm text-[13px] text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
                  >
                    Log in
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-12 flex flex-col gap-3 border-t border-line-soft pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] tracking-[0.14em] text-mute">
              ESCROW THAT DOCUMENTS THE ITEM BEFORE MONEY MOVES
            </p>
            <div className="flex flex-col gap-1 sm:items-end">
              <p className="text-[13px] text-mute">© {new Date().getFullYear()} Mezzo</p>
              <PoweredBy />
            </div>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdGraph([serviceSchema(), faqSchema(FAQS)]),
        }}
      />
    </div>
  );
}
