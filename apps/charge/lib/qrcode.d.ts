declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    type?: string;
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;

  function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<void>;

  export { toDataURL, toCanvas };
  export default { toDataURL, toCanvas };
}
