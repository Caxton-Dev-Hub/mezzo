'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { QrcodeErrorCallback, QrcodeSuccessCallback } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<unknown>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (isMountedRef.current) {
        setError('Camera access not supported in this browser');
        setHasPermission(false);
      }
      return;
    }

    const initScanner = async () => {
      try {
        // Dynamically import html5-qrcode
        const { Html5Qrcode: Html5QrcodeClass } = await import('html5-qrcode');

        const scanner = new Html5QrcodeClass('qr-reader', {
          formFactor: 'portrait',
          disableFlip: false,
        });

        const successCallback: QrcodeSuccessCallback = (decodedText: string) => {
          if (isMountedRef.current) {
            onScan(decodedText);
          }
        };

        const errorCallback: QrcodeErrorCallback = () => {
          // Suppress decode errors; we only want actual camera/permission errors
        };

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          successCallback,
          errorCallback,
        );

        if (isMountedRef.current) {
          scannerRef.current = scanner;
          setHasPermission(true);
          setIsScanning(true);
          setError(null);
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        const message = err instanceof Error ? err.message : 'Failed to access camera';
        if (
          message.includes('NotAllowedError') ||
          message.includes('Permission') ||
          message.includes('denied') ||
          message.includes('NotFoundError')
        ) {
          setHasPermission(false);
          setError('Camera permission denied. Please allow camera access to scan QR codes.');
        } else {
          setError(message);
          setHasPermission(false);
        }
        onError?.(message);
      }
    };

    initScanner();

    return () => {
      isMountedRef.current = false;
      const scanner = scannerRef.current as unknown as { stop: () => Promise<void> };

      if (scanner && isScanning) {
        scanner
          .stop()
          .catch((err: unknown) => {
            // Silently handle stop errors
            console.error('Error stopping scanner:', err);
          })
          .finally(() => {
            scannerRef.current = null;
          });
      }
    };
  }, [onScan, onError, isScanning]);

  const handleStop = async () => {
    const scanner = scannerRef.current as unknown as { stop: () => Promise<void> };
    if (scanner && isScanning) {
      try {
        await scanner.stop();
        scannerRef.current = null;
        setIsScanning(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to stop scanner';
        setError(message);
      }
    }
  };

  if (hasPermission === false) {
    return (
      <div className="bg-surface rounded-xl p-8 text-center shadow-card border border-danger/30">
        <AlertCircle className="w-8 h-8 text-danger mx-auto mb-4" />
        <p className="text-danger mb-4 font-medium">{error}</p>
        <p className="text-sm text-fog">
          Please enable camera permissions in your browser settings to use the QR scanner.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl p-6 shadow-card space-y-4">
      {error && !error.includes('Permission') && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div
        id="qr-reader"
        className="relative bg-black rounded-lg overflow-hidden"
        style={{ aspectRatio: '1' }}
        aria-label="Camera feed for scanning QR codes"
      />

      <div className="text-center text-sm text-fog">
        <p className="mb-2">Point your camera at a QR code</p>
        <p className="text-xs">Make sure the QR code is within the frame</p>
      </div>

      {isScanning && (
        <button
          onClick={handleStop}
          aria-label="Stop scanning for QR codes"
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-colors border border-danger/30"
        >
          <X className="w-4 h-4" />
          Stop Scanning
        </button>
      )}

      <div className="bg-ink/50 border border-line rounded-lg p-4">
        <p className="text-xs text-fog text-center">
          ℹ️ Manual QR Code Input: Use the input field below if scanning doesn&apos;t work
        </p>
      </div>
    </div>
  );
}
