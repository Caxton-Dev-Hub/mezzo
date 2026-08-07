import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-11 w-full appearance-none rounded-lg border border-line bg-surface px-4 pr-9 text-sm text-vellum shadow-hairline',
            'transition-[border-color,box-shadow] duration-200 hover:border-line-strong',
            'focus:border-mint/70 focus:outline-none focus:ring-2 focus:ring-mint/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/40',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
      </div>
    );
  },
);
Select.displayName = 'Select';
