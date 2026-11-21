'use client';

import { useEffect, useRef, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const scannerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (isMounted) {
        setError('Camera access not supported in this browser');
        setHasPermission(false);
      }
      return;
    }

    const initScanner = async () => {
      try {
        // Request camera permission
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        
        if (isMounted && videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasPermission(true);
          setIsScanning(true);
          setError(null);
          
          // Start scanning for QR codes
          scanForQRCode();
        }
      } catch (err) {
        if (!isMounted) return;
        
        const message = err instanceof Error ? err.message : 'Failed to access camera';
        if (message.includes('NotAllowedError') || message.includes('Permission') || message.includes('denied')) {
          setHasPermission(false);
          setError('Camera permission denied. Please allow camera access to scan QR codes.');
        } else {
          setError(message);
          setHasPermission(false);
        }
        onError?.(message);
      }
    };

    const scanForQRCode = () => {
      // For now, we'll show a message that proper QR scanning requires a decoding library
      // This is a placeholder that allows manual QR code entry
      console.log('QR scanner initialized. Please use a browser with a QR code decoder library.');
    };

    initScanner();

    return () => {
      isMounted = false;
      const videoElement = videoRef.current;
      const intervalId = scannerIntervalRef.current;

      if (videoElement?.srcObject) {
        const tracks = (videoElement.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [onScan, onError]);

  const handleStop = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsScanning(false);
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

      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '1' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label="Camera feed for scanning QR codes"
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        
        {/* QR scanner frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-64 h-64 border-4 border-mint rounded-lg opacity-50"></div>
        </div>
      </div>

      <div className="text-center text-sm text-fog">
        <p className="mb-2">Point your camera at a QR code</p>
        <p className="text-xs">Make sure the QR code is within the square frame</p>
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
