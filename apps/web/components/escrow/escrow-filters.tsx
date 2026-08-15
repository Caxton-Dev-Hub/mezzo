'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { EscrowState } from '@mezzo/shared-types';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { ESCROW_STATE_LABELS } from '../../lib/escrow-state-labels';

export type EscrowSortOption =
  | 'updatedAt:desc'
  | 'updatedAt:asc'
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'price:desc'
  | 'price:asc';

const SORT_LABELS: Record<EscrowSortOption, string> = {
  'updatedAt:desc': 'Recently updated',
  'updatedAt:asc': 'Oldest updated',
  'createdAt:desc': 'Recently created',
  'createdAt:asc': 'Oldest created',
  'price:desc': 'Price: high to low',
  'price:asc': 'Price: low to high',
};

interface EscrowFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  state: EscrowState | 'ALL';
  onStateChange: (state: EscrowState | 'ALL') => void;
  sort: EscrowSortOption;
  onSortChange: (sort: EscrowSortOption) => void;
}

export function EscrowFilters({
  search,
  onSearchChange,
  state,
  onStateChange,
  sort,
  onSortChange,
}: EscrowFiltersProps) {
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== search) {
        onSearchChange(searchInput);
      }
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounces on searchInput only; onSearchChange/search are read fresh via closure
  }, [searchInput]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
        <Input
          type="search"
          placeholder="Search by item or escrow code"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="pl-10"
          aria-label="Search escrows"
        />
      </div>
      <Select
        value={state}
        onChange={(event) => onStateChange(event.target.value as EscrowState | 'ALL')}
        aria-label="Filter by status"
        className="sm:w-52"
      >
        <option value="ALL">All statuses</option>
        {(Object.keys(ESCROW_STATE_LABELS) as EscrowState[]).map((value) => (
          <option key={value} value={value}>
            {ESCROW_STATE_LABELS[value]}
          </option>
        ))}
      </Select>
      <Select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as EscrowSortOption)}
        aria-label="Sort escrows"
        className="sm:w-52"
      >
        {(Object.keys(SORT_LABELS) as EscrowSortOption[]).map((value) => (
          <option key={value} value={value}>
            {SORT_LABELS[value]}
          </option>
        ))}
      </Select>
    </div>
  );
}
