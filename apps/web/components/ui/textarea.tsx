import * as React from 'react';
import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-vellum placeholder:text-mute',
        'transition-colors focus:border-fog focus:outline-none focus:ring-2 focus:ring-mint/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/40',
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';
