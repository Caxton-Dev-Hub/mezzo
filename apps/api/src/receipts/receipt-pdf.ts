import PDFDocument from 'pdfkit';
import type { ReceiptResponse } from '@mezzo/shared-types';

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amount / 100);
}

function formatDate(value: Date | null): string {
  return value ? new Date(value).toLocaleString('en-NG') : '—';
}

export function renderReceiptPdf(receipt: ReceiptResponse): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  doc.fontSize(20).text('Mezzo');
  doc.fontSize(12).fillColor('#555555').text('Escrow receipt');
  doc.moveDown(1.5);
  doc.fillColor('#000000');

  const line = (label: string, value: string): void => {
    doc.fontSize(11).text(label, 50, doc.y, { continued: true, width: 280 });
    doc.text(value, { align: 'right' });
    doc.moveDown(0.4);
  };

  line('Escrow ID', receipt.escrowId);
  line('Status', receipt.state);
  line('Item', receipt.itemDescription);
  line('Delivery method', receipt.deliveryMethod);
  doc.moveDown(0.6);

  line('Price', formatMoney(receipt.price.amount, receipt.price.currency));
  line(
    `Platform fee (${(receipt.feeBps / 100).toFixed(2)}%)`,
    formatMoney(receipt.feeAmount.amount, receipt.feeAmount.currency),
  );
  line('Net amount to seller', formatMoney(receipt.netAmount.amount, receipt.netAmount.currency));
  doc.moveDown(0.6);

  line('Buyer', receipt.buyerEmail);
  line('Seller', receipt.sellerEmail);
  doc.moveDown(0.6);

  line('Created', formatDate(receipt.createdAt));
  line('Funded', formatDate(receipt.fundedAt));
  line('Released', formatDate(receipt.releasedAt));
  if (receipt.paymentReference) {
    line('Payment reference', receipt.paymentReference);
  }

  doc.end();
  return doc;
}
