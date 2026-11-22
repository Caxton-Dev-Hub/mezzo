declare module 'html5-qrcode' {
  export type QrcodeSuccessCallback = (decodedText: string, result?: unknown) => void;
  export type QrcodeErrorCallback = (errorMessage: string) => void;

  export interface Html5QrcodeConfig {
    formFactor?: 'portrait' | 'landscape' | 'square';
    disableFlip?: boolean;
  }

  export interface Html5QrcodeScanConfig {
    fps?: number;
    qrbox?: { width: number; height: number } | number;
    aspectRatio?: number;
    disableFlip?: boolean;
  }

  export interface Html5QrcodeCameraConfig {
    facingMode?: 'user' | 'environment';
    aspectRatio?: number;
  }

  export class Html5Qrcode {
    constructor(elementId: string, config?: Html5QrcodeConfig);
    start(
      cameraConfig: Html5QrcodeCameraConfig,
      scanConfig: Html5QrcodeScanConfig,
      onSuccessCallback: QrcodeSuccessCallback,
      onErrorCallback: QrcodeErrorCallback,
    ): Promise<void>;
    stop(): Promise<void>;
    getState(): 'SCANNING' | 'NOT_STARTED' | 'PAUSED';
    pause(): void;
    resume(): Promise<void>;
  }
}
