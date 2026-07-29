export function Eyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-mute">
      <span className="h-px w-6 bg-line" />
      {children}
    </span>
  );
}
