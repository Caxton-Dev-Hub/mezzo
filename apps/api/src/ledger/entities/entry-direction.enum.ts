export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export function opposite(direction: EntryDirection): EntryDirection {
  return direction === EntryDirection.DEBIT ? EntryDirection.CREDIT : EntryDirection.DEBIT;
}
