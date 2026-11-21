'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if browser supports camera
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera access not supported in this browser');
      setHasPermission(false);
      return;
    }

    const initScanner = async () => {
      try {
        // Request camera permission first
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the test stream
        setHasPermission(true);

        // Initialize scanner
        const scanner = new Html5QrcodeScanner(
          'qr-scanner-container',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            showTorchButtonIfSupported: true,
            defaultZoomValueIfSupported: 2,
          },
          false
        );

        scanner.render(
          (decodedText: string) => {
            onScan(decodedText);
            setError(null);
          },
          (error: unknown) => {
            // Ignore scanning errors - they're expected during scanning attempts
            if (error && typeof error === 'object' && 'type' in error && 
                (error as any).type !== 'NotAllowedError') {
              // Only log actual errors, not permission denials
            }
          }
        );

        scannerRef.current = scanner;
        setIsScanning(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize camera';
        if (message.includes('NotAllowedError') || message.includes('Permission')) {
          setHasPermission(false);
          setError('Camera permission denied. Please allow camera access to scan QR codes.');
        } else {
          setError(message);
        }
        setHasPermission(false);
        onError?.(message);
      }
    };

    initScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {
          // Cleanup errors are non-critical
        });
        scannerRef.current = null;
      }
    };
  }, [onScan, onError]);

  const handleStop = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.clear();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  if (hasPermission === false) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center shadow-card border border-red-500/30">
        <p className="text-red-500 mb-4">{error}</p>
        <p className="text-sm text-fog">
          Please enable camera permissions in your browser settings to use the QR scanner.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-6 shadow-card">
      {error && !error.includes('Permission') && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div
        id="qr-scanner-container"
        className="w-full bg-black rounded-lg overflow-hidden mb-4"
        style={{ aspectRatio: '1' }}
      />

      {isScanning && (
        <button
          onClick={handleStop}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-vellum text-ink rounded-lg hover:bg-fog transition-colors"
        >
          <X className="w-4 h-4" />
          Stop Scanning
        </button>
      )}

      <p className="text-xs text-mute text-center mt-4">
        Point your camera at a QR code. Scanning will start automatically.
      </p>
    </div>
  );
}
