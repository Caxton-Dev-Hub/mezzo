import { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditEvent } from '../database/entities/audit-event.entity';

interface Harness {
  service: AuditService;
  save: jest.Mock;
  find: jest.Mock;
}

function buildHarness(rows: AuditEvent[] = []): Harness {
  const save = jest.fn().mockImplementation((row) => Promise.resolve({ id: 'audit-1', ...row }));
  const find = jest.fn().mockResolvedValue(rows);
  const events = {
    save,
    find,
    create: (row: Partial<AuditEvent>) => row,
  } as unknown as Repository<AuditEvent>;

  return { service: new AuditService(events), save, find };
}

describe('AuditService.record', () => {
  it('stores who did what to which entity', async () => {
    const harness = buildHarness();

    await harness.service.record({
      actorId: 'admin-1',
      action: 'DISPUTE_RESOLUTION_EXECUTED',
      entityType: 'dispute',
      entityId: 'dispute-1',
    });

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'DISPUTE_RESOLUTION_EXECUTED',
        entityType: 'dispute',
        entityId: 'dispute-1',
      }),
    );
  });

  it('keeps both sides of a state change for the trail', async () => {
    const harness = buildHarness();

    await harness.service.record({
      actorId: 'admin-1',
      action: 'ESCROW_FORCED',
      entityType: 'escrow',
      entityId: 'escrow-1',
      before: { state: 'DISPUTED' },
      after: { state: 'REFUNDED' },
    });

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeState: { state: 'DISPUTED' },
        afterState: { state: 'REFUNDED' },
      }),
    );
  });

  it('normalises omitted optional fields to null rather than undefined', async () => {
    const harness = buildHarness();

    await harness.service.record({
      actorId: null,
      action: 'AUTO_RELEASE',
      entityType: 'escrow',
      entityId: 'escrow-1',
    });

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: null,
        reason: null,
        beforeState: null,
        afterState: null,
        correlationId: null,
      }),
    );
  });

  it('carries the correlation id through so a trail can be stitched together', async () => {
    const harness = buildHarness();

    await harness.service.record({
      actorId: 'admin-1',
      action: 'X',
      entityType: 'escrow',
      entityId: 'e1',
      correlationId: 'corr-7',
    });

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'corr-7' }));
  });
});

describe('AuditService.list', () => {
  it('returns the newest entries first and caps the page at one hundred', async () => {
    const harness = buildHarness();

    await harness.service.list();

    expect(harness.find).toHaveBeenCalledWith({
      where: {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  });

  it('narrows to one entity when both type and id are given', async () => {
    const harness = buildHarness();

    await harness.service.list({ entityType: 'dispute', entityId: 'dispute-1' });

    expect(harness.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entityType: 'dispute', entityId: 'dispute-1' } }),
    );
  });

  it('narrows to a whole entity type on its own', async () => {
    const harness = buildHarness();

    await harness.service.list({ entityType: 'escrow' });

    expect(harness.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { entityType: 'escrow' } }),
    );
  });

  it('honours a caller-supplied page size', async () => {
    const harness = buildHarness();

    await harness.service.list({ limit: 5 });

    expect(harness.find).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });
});
