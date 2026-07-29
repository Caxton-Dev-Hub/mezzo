import * as React from 'react';
import { cn } from '../../lib/utils';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn('mb-2 block text-[13px] font-medium text-fog', className)}
        {...props}
      />
    );
  },
);
Label.displayName = 'Label';
