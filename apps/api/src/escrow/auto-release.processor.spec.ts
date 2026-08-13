import { Job } from 'bullmq';
import { AutoReleaseProcessor } from './auto-release.processor';
import { InspectionEndingSoonProcessor } from './inspection-ending-soon.processor';
import { AutoReleaseJobData } from './auto-release-queue.constants';
import { InspectionEndingSoonJobData } from './inspection-ending-soon-queue.constants';
import { SettlementService } from './settlement.service';

const ESCROW_ID = 'escrow-1';

function buildSettlement(): {
  settlementService: SettlementService;
  autoRelease: jest.Mock;
  notifyInspectionEndingSoon: jest.Mock;
} {
  const autoRelease = jest.fn().mockResolvedValue(undefined);
  const notifyInspectionEndingSoon = jest.fn().mockResolvedValue(undefined);
  return {
    settlementService: { autoRelease, notifyInspectionEndingSoon } as unknown as SettlementService,
    autoRelease,
    notifyInspectionEndingSoon,
  };
}

describe('AutoReleaseProcessor', () => {
  it('releases the escrow named in the job', async () => {
    const { settlementService, autoRelease } = buildSettlement();
    const processor = new AutoReleaseProcessor(settlementService);

    await processor.process({ data: { escrowId: ESCROW_ID } } as Job<AutoReleaseJobData>);

    expect(autoRelease).toHaveBeenCalledWith(ESCROW_ID);
  });

  it('lets a failure propagate so BullMQ retries the job', async () => {
    const { settlementService, autoRelease } = buildSettlement();
    autoRelease.mockRejectedValue(new Error('connection lost'));
    const processor = new AutoReleaseProcessor(settlementService);

    await expect(
      processor.process({ data: { escrowId: ESCROW_ID } } as Job<AutoReleaseJobData>),
    ).rejects.toThrow('connection lost');
  });
});

describe('InspectionEndingSoonProcessor', () => {
  it('nudges the parties of the escrow named in the job', async () => {
    const { settlementService, notifyInspectionEndingSoon } = buildSettlement();
    const processor = new InspectionEndingSoonProcessor(settlementService);

    await processor.process({
      data: { escrowId: ESCROW_ID },
    } as Job<InspectionEndingSoonJobData>);

    expect(notifyInspectionEndingSoon).toHaveBeenCalledWith(ESCROW_ID);
  });

  it('lets a failure propagate so BullMQ retries the job', async () => {
    const { settlementService, notifyInspectionEndingSoon } = buildSettlement();
    notifyInspectionEndingSoon.mockRejectedValue(new Error('redis down'));
    const processor = new InspectionEndingSoonProcessor(settlementService);

    await expect(
      processor.process({ data: { escrowId: ESCROW_ID } } as Job<InspectionEndingSoonJobData>),
    ).rejects.toThrow('redis down');
  });
});
