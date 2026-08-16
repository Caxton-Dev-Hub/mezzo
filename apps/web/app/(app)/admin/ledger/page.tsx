'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../../lib/auth-store';
import {
  getLedgerReconciliation,
  listLedgerEntriesByAccountRef,
  listLedgerPostingsByCorrelationId,
  postLedgerAdjustment,
} from '../../../../lib/admin-client';
import { ApiError } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format-date';
import { formatMoney } from '../../../../lib/money';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { Textarea } from '../../../../components/ui/textarea';
import { Button } from '../../../../components/ui/button';
import { FieldError } from '../../../../components/ui/field-error';

export default function AdminLedgerPage() {
  const sessionStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();

  const [correlationId, setCorrelationId] = useState('');
  const [accountRef, setAccountRef] = useState('');

  const [debitAccountRef, setDebitAccountRef] = useState('');
  const [creditAccountRef, setCreditAccountRef] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const reconciliationQuery = useQuery({
    queryKey: ['admin-reconciliation'],
    queryFn: getLedgerReconciliation,
    enabled: sessionStatus === 'authenticated',
  });

  const postingsQuery = useQuery({
    queryKey: ['admin-ledger-postings', correlationId],
    queryFn: () => listLedgerPostingsByCorrelationId(correlationId),
    enabled: sessionStatus === 'authenticated' && correlationId.trim().length > 0,
  });

  const entriesQuery = useQuery({
    queryKey: ['admin-ledger-entries', accountRef],
    queryFn: () => listLedgerEntriesByAccountRef(accountRef),
    enabled: sessionStatus === 'authenticated' && accountRef.trim().length > 0,
  });

  const adjustmentMutation = useMutation({
    mutationFn: () =>
      postLedgerAdjustment({
        debitAccountRef: debitAccountRef.trim(),
        creditAccountRef: creditAccountRef.trim(),
        amount: Number(amount),
        currency,
        reason: adjustmentReason.trim(),
      }),
    onSuccess: () => {
      setDebitAccountRef('');
      setCreditAccountRef('');
      setAmount('');
      setAdjustmentReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-reconciliation'] });
    },
  });

  const report = reconciliationQuery.data ?? null;

  function submitAdjustment() {
    if (!debitAccountRef.trim() || !creditAccountRef.trim()) {
      setFormError('Both account references are required.');
      return;
    }
    if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
      setFormError('Amount must be a positive whole number of minor units.');
      return;
    }
    if (adjustmentReason.trim().length === 0) {
      setFormError('Say why this adjustment is being posted — it goes into the audit trail.');
      return;
    }
    setFormError(null);
    adjustmentMutation.mutate();
  }

  return (
    <div>
      <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Ledger
      </h1>
      <p className="mt-1 text-sm text-fog">
        Reconciliation status, cross-system posting traces, and manual adjustments.
      </p>

      <section className="mt-8 max-w-2xl rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
        <h2 className="text-sm font-medium text-vellum">Reconciliation</h2>
        {reconciliationQuery.isLoading ? (
          <div className="mt-3 h-16 animate-pulse rounded-xl bg-surface-2" />
        ) : reconciliationQuery.isError ? (
          <p className="mt-3 text-sm text-danger">Could not load the reconciliation status.</p>
        ) : report ? (
          <div className="mt-3">
            <span
              className={
                report.globalBalanced
                  ? 'rounded-full bg-surface-2 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-vellum'
                  : 'rounded-full bg-danger/15 px-3 py-1 font-mono text-[12px] uppercase tracking-wide text-danger'
              }
            >
              {report.globalBalanced ? 'Balanced' : 'Drift detected'}
            </span>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-mute">
              <span>Total debits {report.totalDebits}</span>
              <span>Total credits {report.totalCredits}</span>
            </div>
            {report.driftedAccountRefs.length > 0 ? (
              <ul className="mt-3 space-y-1 font-mono text-[12px] text-danger">
                {report.driftedAccountRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
          <h2 className="text-sm font-medium text-vellum">Trace by correlation id</h2>
          <div className="mt-3">
            <Input
              value={correlationId}
              onChange={(event) => setCorrelationId(event.target.value)}
              placeholder="e.g. an escrow or intent id"
            />
          </div>
          {postingsQuery.data ? (
            <ul className="mt-4 space-y-3">
              {postingsQuery.data.map((posting) => (
                <li key={posting.id} className="border-l border-line pl-3">
                  <p className="font-mono text-[12px] text-mute">{posting.idempotencyKey}</p>
                  <p className="text-[12px] text-mute">{formatDateTime(posting.createdAt)}</p>
                  <ul className="mt-1 space-y-0.5">
                    {posting.entries.map((entry) => (
                      <li key={entry.id} className="text-[13px] text-vellum">
                        {entry.direction} {formatMoney(entry.amount, entry.currency)} ·{' '}
                        <span className="font-mono text-[12px] text-mute">{entry.accountId}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {postingsQuery.data.length === 0 ? (
                <p className="text-[13px] text-mute">No postings for this id.</p>
              ) : null}
            </ul>
          ) : null}
        </div>

        <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
          <h2 className="text-sm font-medium text-vellum">Recent entries by account</h2>
          <div className="mt-3">
            <Input
              value={accountRef}
              onChange={(event) => setAccountRef(event.target.value)}
              placeholder="e.g. user:&lt;id&gt;:wallet"
            />
          </div>
          {entriesQuery.data ? (
            <ul className="mt-4 space-y-2">
              {entriesQuery.data.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-mono text-[12px] uppercase tracking-wide text-mute">
                    {entry.direction}
                  </span>
                  <span className="text-vellum">{formatMoney(entry.amount, entry.currency)}</span>
                </li>
              ))}
              {entriesQuery.data.length === 0 ? (
                <p className="text-[13px] text-mute">No entries for this account.</p>
              ) : null}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="mt-8 max-w-xl rounded-2xl border border-line-soft bg-surface p-5 shadow-card">
        <h2 className="text-sm font-medium text-vellum">Manual adjustment</h2>
        <p className="mt-1 text-[13px] text-fog">
          Posts a balanced two-line correction. This never edits existing rows.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="debit-ref">Debit account ref</Label>
            <Input
              id="debit-ref"
              value={debitAccountRef}
              onChange={(event) => setDebitAccountRef(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="credit-ref">Credit account ref</Label>
            <Input
              id="credit-ref"
              value={creditAccountRef}
              onChange={(event) => setCreditAccountRef(event.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="adjustment-amount">Amount (minor units)</Label>
              <Input
                id="adjustment-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="w-32">
              <Label htmlFor="adjustment-currency">Currency</Label>
              <Select
                id="adjustment-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'NGN' | 'USD')}
              >
                <option value="NGN">NGN</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Textarea
              id="adjustment-reason"
              rows={2}
              value={adjustmentReason}
              onChange={(event) => setAdjustmentReason(event.target.value)}
              placeholder="Why is this adjustment being posted?"
            />
            <FieldError message={formError ?? undefined} />
          </div>
          <Button type="button" loading={adjustmentMutation.isPending} onClick={submitAdjustment}>
            Post adjustment
          </Button>
          {adjustmentMutation.error ? (
            <p role="alert" className="text-[13px] text-danger">
              {adjustmentMutation.error instanceof ApiError
                ? adjustmentMutation.error.message
                : 'Could not post this adjustment.'}
            </p>
          ) : null}
          {adjustmentMutation.isSuccess ? (
            <p className="text-[13px] text-mint">Adjustment posted.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
