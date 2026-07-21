declare module 'file-type' {
  export interface FileTypeResult {
    ext: string;
    mime: string;
  }

  export function fromBuffer(input: Buffer | Uint8Array | ArrayBuffer): Promise<FileTypeResult | undefined>;
}
