import QRCode from 'qrcode';

export async function generateQRCode(text: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export async function generateQRCodeAsBlob(text: string): Promise<Blob> {
  try {
    const dataUrl = await generateQRCode(text);
    const response = await fetch(dataUrl);
    return response.blob();
  } catch (error) {
    console.error('Error generating QR code blob:', error);
    throw error;
  }
}
