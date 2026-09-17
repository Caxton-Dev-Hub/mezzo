'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Bank } from '@mezzo/shared-types';
import { cn } from '../../lib/utils';

interface BankSelectProps {
  id: string;
  banks: Bank[];
  value: string;
  onChange: (bankCode: string) => void;
  onBlur: () => void;
  loading: boolean;
  invalid: boolean;
}

export function BankSelect({
  id,
  banks,
  value,
  onChange,
  onBlur,
  loading,
  invalid,
}: BankSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = banks.find((bank) => bank.code === value) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? banks.filter((bank) => bank.name.toLowerCase().includes(needle)) : banks;
  }, [banks, query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const select = (bank: Bank) => {
    onChange(bank.code);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (matches.length === 0) return 0;
        return (current + step + matches.length) % matches.length;
      });
      return;
    }

    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const bank = matches[activeIndex];
      if (bank) {
        select(bank);
      }
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        role="combobox"
        type="text"
        autoComplete="off"
        disabled={loading}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-activedescendant={open && matches[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        value={open ? query : (selected?.name ?? '')}
        placeholder={loading ? 'Loading banks…' : 'Search for your bank'}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-11 w-full rounded-lg border border-line bg-surface px-4 pr-9 text-sm text-vellum shadow-hairline',
          'transition-[border-color,box-shadow] duration-200 hover:border-line-strong',
          'placeholder:text-mute focus:border-mint/70 focus:outline-none focus:ring-2 focus:ring-mint/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/40',
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Bank"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-hairline"
        >
          {matches.length === 0 ? (
            <li className="px-4 py-2 text-[13px] text-mute">No bank matches that search</li>
          ) : (
            matches.map((bank, index) => (
              <li
                key={bank.code}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={bank.code === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(bank)}
                className={cn(
                  'cursor-pointer px-4 py-2 text-sm text-fog',
                  index === activeIndex && 'bg-surface-2 text-vellum',
                  bank.code === value && 'text-mint',
                )}
              >
                {bank.name}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
