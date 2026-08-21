import Link from 'next/link';
import type { Metadata } from 'next';
import { Wordmark } from '../../components/shell/wordmark';
import { DocsNav } from '../../components/docs/docs-nav';

export const metadata: Metadata = {
  title: {
    default: 'Docs',
    template: '%s · Docs · Mezzo',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell min-h-screen bg-ink text-vellum">
      <header className="sticky top-0 z-50 border-b border-line-soft bg-ink/80 shadow-hairline backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
            >
              <Wordmark className="text-base" />
            </Link>
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
              Docs
            </span>
          </div>
          <Link
            href="/"
            className="rounded-sm text-sm text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
          >
            Back to mezzo.app
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <DocsNav />
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>

      <footer className="border-t border-line-soft">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="font-mono text-[11px] tracking-[0.14em] text-mute">
            MEZZO ENGINEERING DOCS — INTERNAL
          </p>
        </div>
      </footer>
    </div>
  );
}
