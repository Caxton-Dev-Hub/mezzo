import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EvidenceService } from './evidence.service';
import { EvidencePhase } from './entities/evidence-phase.enum';
import { EvidenceFlagType } from './entities/evidence-flag-type.enum';
import { MediaAnalysisResult, MediaAnalysisService } from './media-analysis.service';
import { StorageProvider } from './storage/storage-provider.interface';
import { InvalidStorageKeyError } from './errors/invalid-storage-key.error';
import { MimeMismatchError } from './errors/mime-mismatch.error';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowService } from '../escrow/escrow.service';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { callArgs } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const ACTOR_ID = 'buyer-1';
const DRIFT_HOURS = 48;

function buildAnalysis(overrides: Partial<MediaAnalysisResult> = {}): MediaAnalysisResult {
  return {
    contentHash: 'a'.repeat(64),
    detectedMime: 'image/jpeg',
    sizeBytes: 2_048,
    width: 800,
    height: 600,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    hasExif: true,
    ...overrides,
  };
}

function buildItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'item-1',
    escrowId: ESCROW_ID,
    uploaderId: ACTOR_ID,
    phase: EvidencePhase.AT_CREATION,
    storageKey: `evidence/${ESCROW_ID}/one.jpg`,
    contentHash: 'a'.repeat(64),
    declaredMime: 'image/jpeg',
    detectedMime: 'image/jpeg',
    sizeBytes: 2_048,
    width: 800,
    height: 600,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    createdAt: new Date(),
    ...overrides,
  } as EvidenceItem;
}

interface Harness {
  service: EvidenceService;
  assertIsParty: jest.Mock;
  itemsFind: jest.Mock;
  itemsFindOne: jest.Mock;
  itemsCount: jest.Mock;
  flagsFind: jest.Mock;
  presignUpload: jest.Mock;
  presignDownload: jest.Mock;
  getObject: jest.Mock;
  deleteObject: jest.Mock;
  analyze: jest.Mock;
  managerSave: jest.Mock;
}

function buildHarness(
  options: {
    analysis?: MediaAnalysisResult;
    duplicate?: EvidenceItem | null;
    items?: EvidenceItem[];
    itemsCount?: number;
  } = {},
): Harness {
  const itemsFind = jest.fn().mockResolvedValue(options.items ?? []);
  const itemsFindOne = jest.fn().mockResolvedValue(options.duplicate ?? null);
  const itemsCount = jest.fn().mockResolvedValue(options.itemsCount ?? 0);
  const items = {
    find: itemsFind,
    findOne: itemsFindOne,
    count: itemsCount,
  } as unknown as Repository<EvidenceItem>;

  const flagsFind = jest.fn().mockResolvedValue([]);
  const flags = { find: flagsFind } as unknown as Repository<EvidenceFlag>;

  const managerSave = jest
    .fn()
    .mockImplementation((_entity, row) => Promise.resolve({ id: 'item-1', ...row }));
  const manager = {
    save: managerSave,
    create: (_entity: unknown, row: Record<string, unknown>) => row,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const presignUpload = jest.fn().mockResolvedValue('https://upload.example/put');
  const presignDownload = jest.fn().mockResolvedValue('https://cdn.example/get');
  const getObject = jest.fn().mockResolvedValue(Buffer.from('binary'));
  const deleteObject = jest.fn().mockResolvedValue(undefined);
  const storage = {
    getPresignedUploadUrl: presignUpload,
    getPresignedDownloadUrl: presignDownload,
    getObject,
    deleteObject,
  } as unknown as StorageProvider;

  const analyze = jest.fn().mockResolvedValue(options.analysis ?? buildAnalysis());
  const mediaAnalysis = { analyze } as unknown as MediaAnalysisService;

  const assertIsParty = jest.fn().mockResolvedValue(undefined);
  const escrowService = { assertIsParty } as unknown as EscrowService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(DRIFT_HOURS),
  } as unknown as ConfigService;

  const service = new EvidenceService(
    items,
    flags,
    dataSource,
    storage,
    mediaAnalysis,
    escrowService,
    configService,
  );

  return {
    service,
    assertIsParty,
    itemsFind,
    itemsFindOne,
    itemsCount,
    flagsFind,
    presignUpload,
    presignDownload,
    getObject,
    deleteObject,
    analyze,
    managerSave,
  };
}

const confirmDto = {
  escrowId: ESCROW_ID,
  key: `evidence/${ESCROW_ID}/abc`,
  declaredMime: 'image/jpeg' as const,
  phase: EvidencePhase.AT_CREATION,
};

describe('EvidenceService.presign', () => {
  it('refuses a caller who is not a party to the escrow', async () => {
    const harness = buildHarness();
    harness.assertIsParty.mockRejectedValue(new NotEscrowPartyError());

    await expect(
      harness.service.presign(ACTOR_ID, { escrowId: ESCROW_ID, phase: EvidencePhase.AT_CREATION, mimeType: 'image/jpeg' as const }),
    ).rejects.toBeInstanceOf(NotEscrowPartyError);
    expect(harness.presignUpload).not.toHaveBeenCalled();
  });

  it('namespaces the upload key under the escrow it belongs to', async () => {
    const harness = buildHarness();

    const { key, uploadUrl } = await harness.service.presign(ACTOR_ID, {
      escrowId: ESCROW_ID,
      phase: EvidencePhase.AT_CREATION,
      mimeType: 'image/jpeg' as const,
    });

    expect(key.startsWith(`evidence/${ESCROW_ID}/`)).toBe(true);
    expect(uploadUrl).toBe('https://upload.example/put');
  });

  it('scopes the presigned url to the declared mime type', async () => {
    const harness = buildHarness();

    await harness.service.presign(ACTOR_ID, { escrowId: ESCROW_ID, phase: EvidencePhase.AT_CREATION, mimeType: 'image/png' as const });

    expect(harness.presignUpload).toHaveBeenCalledWith(expect.any(String) as string, 'image/png');
  });

  it('mints a distinct key on every call', async () => {
    const harness = buildHarness();

    const first = await harness.service.presign(ACTOR_ID, {
      escrowId: ESCROW_ID,
      phase: EvidencePhase.AT_CREATION,
      mimeType: 'image/jpeg' as const,
    });
    const second = await harness.service.presign(ACTOR_ID, {
      escrowId: ESCROW_ID,
      phase: EvidencePhase.AT_CREATION,
      mimeType: 'image/jpeg' as const,
    });

    expect(first.key).not.toBe(second.key);
  });
});

describe('EvidenceService.confirm', () => {
  it('refuses a caller who is not a party', async () => {
    const harness = buildHarness();
    harness.assertIsParty.mockRejectedValue(new NotEscrowPartyError());

    await expect(harness.service.confirm(ACTOR_ID, confirmDto)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('refuses a key belonging to another escrow', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.confirm(ACTOR_ID, { ...confirmDto, key: 'evidence/other-escrow/abc' }),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(harness.getObject).not.toHaveBeenCalled();
  });

  it('rejects and deletes an upload whose real type differs from the declared one', async () => {
    const harness = buildHarness({ analysis: buildAnalysis({ detectedMime: 'application/zip' }) });

    await expect(harness.service.confirm(ACTOR_ID, confirmDto)).rejects.toBeInstanceOf(
      MimeMismatchError,
    );
    expect(harness.deleteObject).toHaveBeenCalledWith(confirmDto.key);
    expect(harness.managerSave).not.toHaveBeenCalled();
  });

  it('rejects an upload whose type could not be detected at all', async () => {
    const harness = buildHarness({ analysis: buildAnalysis({ detectedMime: null }) });

    await expect(harness.service.confirm(ACTOR_ID, confirmDto)).rejects.toBeInstanceOf(
      MimeMismatchError,
    );
    expect(harness.deleteObject).toHaveBeenCalled();
  });

  it('persists the analysed metadata alongside the item', async () => {
    const harness = buildHarness({
      analysis: buildAnalysis({
        width: 1_024,
        height: 768,
        deviceMake: 'Acme',
        deviceModel: 'X1',
        gpsLatitude: 6.5,
        gpsLongitude: 3.4,
      }),
    });

    await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(harness.managerSave).toHaveBeenCalledWith(
      EvidenceItem,
      expect.objectContaining({
        escrowId: ESCROW_ID,
        uploaderId: ACTOR_ID,
        phase: EvidencePhase.AT_CREATION,
        width: 1_024,
        height: 768,
        deviceMake: 'Acme',
        gpsLatitude: 6.5,
      }),
    );
  });

  it('accepts a clean upload without raising any flag', async () => {
    const harness = buildHarness();

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).toEqual([]);
    expect(response.url).toBe('https://cdn.example/get');
  });

  it('flags an image whose bytes match evidence already on file', async () => {
    const harness = buildHarness({ duplicate: buildItem() });

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).toContain(EvidenceFlagType.DUPLICATE_CONTENT);
  });

  it('flags an image that arrives stripped of its exif metadata', async () => {
    const harness = buildHarness({ analysis: buildAnalysis({ hasExif: false }) });

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).toContain(EvidenceFlagType.MISSING_METADATA);
  });

  it('does not demand exif from a non-image upload', async () => {
    const harness = buildHarness({
      analysis: buildAnalysis({ detectedMime: 'video/mp4', hasExif: false }),
    });

    const response = await harness.service.confirm(ACTOR_ID, {
      ...confirmDto,
      declaredMime: 'video/mp4' as const,
    });

    expect(response.flags).not.toContain(EvidenceFlagType.MISSING_METADATA);
  });

  it('flags a capture timestamp that drifts beyond the allowed window', async () => {
    const staleCapture = new Date(Date.now() - (DRIFT_HOURS + 1) * 60 * 60 * 1000);
    const harness = buildHarness({ analysis: buildAnalysis({ capturedAt: staleCapture }) });

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).toContain(EvidenceFlagType.TIMESTAMP_MISMATCH);
  });

  it('accepts a capture timestamp inside the allowed window', async () => {
    const recentCapture = new Date(Date.now() - 60 * 60 * 1000);
    const harness = buildHarness({ analysis: buildAnalysis({ capturedAt: recentCapture }) });

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).not.toContain(EvidenceFlagType.TIMESTAMP_MISMATCH);
  });

  it('persists every flag it raised alongside the item', async () => {
    const staleCapture = new Date(Date.now() - (DRIFT_HOURS + 1) * 60 * 60 * 1000);
    const harness = buildHarness({
      duplicate: buildItem(),
      analysis: buildAnalysis({ hasExif: false, capturedAt: staleCapture }),
    });

    const response = await harness.service.confirm(ACTOR_ID, confirmDto);

    expect(response.flags).toEqual([
      EvidenceFlagType.DUPLICATE_CONTENT,
      EvidenceFlagType.MISSING_METADATA,
      EvidenceFlagType.TIMESTAMP_MISMATCH,
    ]);
    expect(
      callArgs(harness.managerSave).filter((call) => call[0] === EvidenceFlag),
    ).toHaveLength(3);
  });
});

describe('EvidenceService.getBundle', () => {
  it('refuses a caller who is not a party', async () => {
    const harness = buildHarness();
    harness.assertIsParty.mockRejectedValue(new NotEscrowPartyError());

    await expect(harness.service.getBundle(ACTOR_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('returns an empty bundle without asking storage for anything', async () => {
    const harness = buildHarness({ items: [] });

    const bundle = await harness.service.getBundle(ACTOR_ID, ESCROW_ID);

    expect(bundle).toEqual({ escrowId: ESCROW_ID, items: [] });
    expect(harness.flagsFind).not.toHaveBeenCalled();
    expect(harness.presignDownload).not.toHaveBeenCalled();
  });

  it('attaches a viewable url to every item in the bundle', async () => {
    const harness = buildHarness({ items: [buildItem(), buildItem({ id: 'item-2' })] });

    const bundle = await harness.service.getBundle(ACTOR_ID, ESCROW_ID);

    expect(bundle.items).toHaveLength(2);
    expect(bundle.items.every((item) => item.url === 'https://cdn.example/get')).toBe(true);
  });

  it('reads the bundle oldest first so the story reads in order', async () => {
    const harness = buildHarness({ items: [buildItem()] });

    await harness.service.getBundle(ACTOR_ID, ESCROW_ID);

    expect(harness.itemsFind).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  });
});

describe('EvidenceService.hasAtLeastOne', () => {
  it('is false when the phase has no evidence', async () => {
    const harness = buildHarness({ itemsCount: 0 });

    await expect(
      harness.service.hasAtLeastOne(ESCROW_ID, EvidencePhase.AT_DELIVERY),
    ).resolves.toBe(false);
  });

  it('is true once the phase has evidence', async () => {
    const harness = buildHarness({ itemsCount: 2 });

    await expect(
      harness.service.hasAtLeastOne(ESCROW_ID, EvidencePhase.AT_DELIVERY),
    ).resolves.toBe(true);
    expect(harness.itemsCount).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID, phase: EvidencePhase.AT_DELIVERY },
    });
  });
});
