import { LogoMark } from './logo-mark';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.34em] text-vellum ${className}`}>
      <LogoMark />
      <span className="font-display text-[1.35em] leading-none tracking-tight">Mezzo</span>
    </span>
  );
}
