'use client';

import { useEffect, useState, useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { generateQRCode } from '@/lib/qrcode';

interface QRCodeDisplayProps {
  url: string;
  title?: string;
  subtitle?: string;
  downloadFileName?: string;
}

export function QRCodeDisplay({
  url,
  title,
  subtitle,
  downloadFileName = 'qrcode.png',
}: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const generateQR = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const dataUrl = await generateQRCode(url);
        setQrDataUrl(dataUrl);
      } catch (err) {
        setError('Failed to generate QR code');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    generateQR();
  }, [url]);

  const handleDownload = async () => {
    if (!qrDataUrl) return;

    try {
      const link = document.createElement('a');
      link.href = qrDataUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Failed to download QR code');
    }
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;

    const printWindow = window.open('', '', 'width=400,height=500');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${downloadFileName}</title>
            <style>
              body { margin: 20px; text-align: center; font-family: system-ui; }
              img { max-width: 300px; }
              p { color: #666; }
            </style>
          </head>
          <body>
            ${title ? `<h2>${title}</h2>` : ''}
            ${subtitle ? `<p>${subtitle}</p>` : ''}
            <img src="${qrDataUrl}" alt="QR Code" />
            <p>${url}</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center shadow-card">
        <div className="inline-block w-8 h-8 border-2 border-mint border-t-transparent rounded-full animate-spin" />
        <p className="text-fog mt-4">Generating QR code...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center shadow-card">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-8 shadow-card">
      <div className="max-w-sm mx-auto">
        {title && <h3 className="text-xl font-display mb-2 text-center">{title}</h3>}
        {subtitle && <p className="text-fog text-center mb-6">{subtitle}</p>}

        <div className="bg-white p-6 rounded-lg flex justify-center mb-6">
          <canvas ref={canvasRef} className="hidden" />
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="w-64 h-64"
              crossOrigin="anonymous"
            />
          )}
        </div>

        <p className="text-sm text-mute text-center mb-6 break-all">{url}</p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="inline-flex items-center gap-2 px-4 py-2 bg-mint text-white rounded-lg hover:bg-mint-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="inline-flex items-center gap-2 px-4 py-2 bg-vellum text-ink rounded-lg hover:bg-fog disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
