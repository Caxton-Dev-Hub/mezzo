'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../../lib/auth-store';
import { getEscrowReceipt, getEscrowReceiptPdf } from '../../../../../lib/receipt-client';
import { formatMoney } from '../../../../../lib/money';
import { formatDateTime } from '../../../../../lib/format-date';
import { ESCROW_STATE_LABELS } from '../../../../../lib/escrow-state-labels';
import { ApiError } from '../../../../../lib/api-error';
import { Button } from '../../../../../components/ui/button';

export default function EscrowReceiptPage() {
  const params = useParams<{ id: string }>();
  const escrowId = params.id;
  const sessionStatus = useAuthStore((state) => state.status);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const receiptQuery = useQuery({
    queryKey: ['receipt', escrowId],
    queryFn: () => getEscrowReceipt(escrowId),
    enabled: sessionStatus === 'authenticated',
  });

  async function handleDownload(): Promise<void> {
    setDownloadError(null);
    setDownloading(true);
    try {
      const blob = await getEscrowReceiptPdf(escrowId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mezzo-receipt-${escrowId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? error.message : 'Could not download the receipt. Please try again.',
      );
    } finally {
      setDownloading(false);
    }
  }

  if (sessionStatus === 'pending' || receiptQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (receiptQuery.isError) {
    const message =
      receiptQuery.error instanceof ApiError
        ? receiptQuery.error.message
        : 'Could not load the receipt.';
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">{message}</p>
      </div>
    );
  }

  const receipt = receiptQuery.data;
  if (!receipt) {
    return null;
  }

  return (
    <div>
      <Link
        href={`/escrow/${escrowId}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-vellum"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the escrow
      </Link>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
          Receipt
        </h1>
        <Button type="button" variant="secondary" loading={downloading} onClick={() => void handleDownload()}>
          <Download className="h-4 w-4" />
          Download PDF
        </Button>
      </div>
      {downloadError ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {downloadError}
        </p>
      ) : null}

      <dl className="mt-6 space-y-3 rounded-xl border border-line-soft bg-surface shadow-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Escrow</dt>
          <dd className="text-right font-mono text-[12px] text-vellum">{receipt.escrowId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Status</dt>
          <dd className="text-vellum">{ESCROW_STATE_LABELS[receipt.state]}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Item</dt>
          <dd className="text-right text-vellum">{receipt.itemDescription}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Delivery</dt>
          <dd className="text-right text-vellum">{receipt.deliveryMethod}</dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-3 rounded-xl border border-line-soft bg-surface shadow-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Price</dt>
          <dd className="font-mono tabular text-vellum">
            {formatMoney(receipt.price.amount, receipt.price.currency)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Platform fee ({(receipt.feeBps / 100).toFixed(2)}%)</dt>
          <dd className="font-mono tabular text-vellum">
            {formatMoney(receipt.feeAmount.amount, receipt.feeAmount.currency)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line-soft pt-3">
          <dt className="text-fog">Net to seller</dt>
          <dd className="font-mono tabular text-vellum">
            {formatMoney(receipt.netAmount.amount, receipt.netAmount.currency)}
          </dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-3 rounded-xl border border-line-soft bg-surface shadow-card p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Buyer</dt>
          <dd className="text-right text-vellum">{receipt.buyerEmail}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Seller</dt>
          <dd className="text-right text-vellum">{receipt.sellerEmail}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fog">Created</dt>
          <dd className="text-vellum">{formatDateTime(receipt.createdAt)}</dd>
        </div>
        {receipt.fundedAt ? (
          <div className="flex justify-between gap-4">
            <dt className="text-fog">Funded</dt>
            <dd className="text-vellum">{formatDateTime(receipt.fundedAt)}</dd>
          </div>
        ) : null}
        {receipt.releasedAt ? (
          <div className="flex justify-between gap-4">
            <dt className="text-fog">Released</dt>
            <dd className="text-vellum">{formatDateTime(receipt.releasedAt)}</dd>
          </div>
        ) : null}
        {receipt.paymentReference ? (
          <div className="flex justify-between gap-4">
            <dt className="text-fog">Payment reference</dt>
            <dd className="text-right font-mono text-[12px] text-vellum">
              {receipt.paymentReference}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
