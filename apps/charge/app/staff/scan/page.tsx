'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { Navbar } from '@/components/layout/navbar';
import { QRScanner } from '@/components/qr-scanner';
import { PowerbankScannerPanel } from '@/components/powerbank-scanner-panel';

function ScanContent() {
  const [scannedId, setScannedId] = useState<string | null>(null);

  const handleScan = (result: string) => {
    // Extract just the ID in case the QR code contains additional data
    const id = result.includes('/') ? result.split('/').pop() || result : result;
    setScannedId(id);
  };

  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-display mb-2">Powerbank Scanner</h1>
          <p className="text-fog">Scan or enter a powerbank ID to manage status</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-display mb-4">Scan QR Code</h2>
            <QRScanner onScan={handleScan} />
          </div>

          <div>
            <h2 className="text-xl font-display mb-4">Powerbank Details</h2>
            <PowerbankScannerPanel initialPowerbankId={scannedId || undefined} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ScanPage() {
  return (
    <AuthGuard requireStaff>
      <ScanContent />
    </AuthGuard>
  );
}
