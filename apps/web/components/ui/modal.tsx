'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
    >
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-line-soft bg-surface p-6 shadow-panel',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          {title ? (
            <h2 className="font-display text-lg leading-tight text-vellum">{title}</h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-mute hover:text-vellum"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
