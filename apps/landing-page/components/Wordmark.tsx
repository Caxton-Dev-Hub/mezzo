export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[0.15em] ${className}`}>
      <span className="font-display text-[1.35em] leading-none tracking-tight text-vellum">
        Mezzo
      </span>
      <span className="mt-[0.1em] h-[0.34em] w-[0.34em] translate-y-[-0.05em] rounded-full bg-mint" />
    </span>
  );
}
