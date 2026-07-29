import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const presignEvidence = vi.fn();
const confirmEvidence = vi.fn();
const getEvidenceBundle = vi.fn();
const uploadFileToPresignedUrl = vi.fn();
const compressImage = vi.fn();

vi.mock('../lib/evidence-client', () => ({
  presignEvidence: (...args: unknown[]) => presignEvidence(...args),
  confirmEvidence: (...args: unknown[]) => confirmEvidence(...args),
  getEvidenceBundle: (...args: unknown[]) => getEvidenceBundle(...args),
  uploadFileToPresignedUrl: (...args: unknown[]) => uploadFileToPresignedUrl(...args),
}));

vi.mock('../lib/image-compression', () => ({
  compressImage: (...args: unknown[]) => compressImage(...args),
}));

import { useEvidenceQueue } from '../hooks/use-evidence-queue';

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe('useEvidenceQueue', () => {
  beforeEach(() => {
    presignEvidence.mockReset();
    confirmEvidence.mockReset();
    uploadFileToPresignedUrl.mockReset();
    compressImage.mockReset();
    getEvidenceBundle.mockReset().mockResolvedValue({ escrowId: 'escrow-1', items: [] });
  });

  it('rejects an unsupported file type without calling presign', async () => {
    const { result } = renderHook(() => useEvidenceQueue('escrow-1', 'AT_CREATION'));

    act(() => {
      result.current.addFiles([makeFile('doc.pdf', 'application/pdf')]);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'));
    expect(result.current.items[0].errorReason).toBe('unsupported_type');
    expect(presignEvidence).not.toHaveBeenCalled();
  });

  it('rejects a file over the size cap without uploading', async () => {
    compressImage.mockResolvedValue({
      blob: new Blob([new Uint8Array(30 * 1024 * 1024)]),
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
    });

    const { result } = renderHook(() => useEvidenceQueue('escrow-1', 'AT_CREATION'));

    act(() => {
      result.current.addFiles([makeFile('big.jpg', 'image/jpeg')]);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'));
    expect(result.current.items[0].errorReason).toBe('too_large');
    expect(presignEvidence).not.toHaveBeenCalled();
  });

  it('uploads a valid file through presign -> upload -> confirm', async () => {
    compressImage.mockResolvedValue({
      blob: new Blob([new Uint8Array(1024)]),
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
    });
    presignEvidence.mockResolvedValue({ uploadUrl: 'https://storage.example/upload', key: 'evidence/escrow-1/abc' });
    uploadFileToPresignedUrl.mockResolvedValue(undefined);
    confirmEvidence.mockResolvedValue({
      id: 'item-1',
      escrowId: 'escrow-1',
      uploaderId: 'user-1',
      phase: 'AT_CREATION',
      contentHash: 'hash',
      declaredMime: 'image/jpeg',
      detectedMime: 'image/jpeg',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
      gpsLatitude: null,
      gpsLongitude: null,
      flags: [],
      createdAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useEvidenceQueue('escrow-1', 'AT_CREATION'));

    act(() => {
      result.current.addFiles([makeFile('photo.jpg', 'image/jpeg')]);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('confirmed'));
    expect(result.current.confirmedCount).toBe(1);
    expect(presignEvidence).toHaveBeenCalledWith({
      escrowId: 'escrow-1',
      phase: 'AT_CREATION',
      mimeType: 'image/jpeg',
    });
  });

  it('retries a failed upload without duplicating the item', async () => {
    compressImage.mockResolvedValue({
      blob: new Blob([new Uint8Array(1024)]),
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
    });
    presignEvidence.mockResolvedValueOnce({ uploadUrl: 'https://storage.example/upload', key: 'evidence/escrow-1/abc' });
    uploadFileToPresignedUrl.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useEvidenceQueue('escrow-1', 'AT_CREATION'));

    act(() => {
      result.current.addFiles([makeFile('photo.jpg', 'image/jpeg')]);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('error'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].errorReason).toBe('upload_failed');

    presignEvidence.mockResolvedValueOnce({ uploadUrl: 'https://storage.example/upload', key: 'evidence/escrow-1/abc' });
    uploadFileToPresignedUrl.mockResolvedValueOnce(undefined);
    confirmEvidence.mockResolvedValueOnce({
      id: 'item-1',
      escrowId: 'escrow-1',
      uploaderId: 'user-1',
      phase: 'AT_CREATION',
      contentHash: 'hash',
      declaredMime: 'image/jpeg',
      detectedMime: 'image/jpeg',
      sizeBytes: 1024,
      width: 100,
      height: 100,
      capturedAt: null,
      deviceMake: null,
      deviceModel: null,
      gpsLatitude: null,
      gpsLongitude: null,
      flags: [],
      createdAt: new Date().toISOString(),
    });

    act(() => {
      result.current.retryItem(result.current.items[0].clientId);
    });

    await waitFor(() => expect(result.current.items[0]?.status).toBe('confirmed'));
    expect(result.current.items).toHaveLength(1);
  });
});
