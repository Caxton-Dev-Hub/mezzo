export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  getPresignedUploadUrl(key: string, contentType: string): Promise<string>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
