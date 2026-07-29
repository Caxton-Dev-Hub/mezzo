import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border border-line bg-surface px-4 text-sm text-vellum placeholder:text-mute',
          'transition-colors focus:border-fog focus:outline-none focus:ring-2 focus:ring-mint/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/40',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
