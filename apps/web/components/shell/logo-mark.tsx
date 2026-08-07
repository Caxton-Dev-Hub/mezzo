export function LogoMark({ className = 'h-[1.55em] w-[1.55em]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l10 12L26 9" className="stroke-mint" />
      <path d="M6 25V9" className="stroke-current" />
      <path d="M26 25V9" className="stroke-current" />
    </svg>
  );
}
