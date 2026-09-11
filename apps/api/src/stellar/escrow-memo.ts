const MEMO_TEXT_MAX_BYTES = 28;

export function escrowMemo(escrowId: string): string {
  return escrowId.replace(/-/g, '').slice(0, MEMO_TEXT_MAX_BYTES);
}
