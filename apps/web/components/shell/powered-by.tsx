import { BUILDER_NAME, BUILDER_URL } from '../../lib/site';

export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={`font-mono text-[11px] tracking-[0.14em] text-mute ${className ?? ''}`}>
      POWERED BY{' '}
      <a
        href={BUILDER_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-sm text-fog transition-colors hover:text-vellum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
      >
        {BUILDER_NAME.toUpperCase()}
      </a>
    </p>
  );
}
