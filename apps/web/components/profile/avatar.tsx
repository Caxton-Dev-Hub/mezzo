import { cn } from '../../lib/utils';

const SIZES = {
  sm: 'h-9 w-9 text-[13px]',
  md: 'h-14 w-14 text-lg',
  lg: 'h-20 w-20 text-2xl',
} as const;

interface AvatarProps {
  url: string | null;
  name: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

function initials(name: string | null): string {
  if (!name) {
    return '?';
  }

  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ url, name, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-soft bg-surface-2 font-medium text-fog',
        SIZES[size],
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
