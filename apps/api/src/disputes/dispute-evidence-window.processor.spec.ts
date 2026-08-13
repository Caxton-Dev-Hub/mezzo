import { Job } from 'bullmq';
import { DisputeEvidenceWindowProcessor } from './dispute-evidence-window.processor';
import { DisputeEvidenceWindowJobData } from './dispute-evidence-window-queue.constants';
import { DisputeService } from './dispute.service';

const DISPUTE_ID = 'dispute-1';

function buildProcessor(): {
  processor: DisputeEvidenceWindowProcessor;
  autoCloseEvidenceWindow: jest.Mock;
} {
  const autoCloseEvidenceWindow = jest.fn().mockResolvedValue(undefined);
  const disputeService = { autoCloseEvidenceWindow } as unknown as DisputeService;

  return {
    processor: new DisputeEvidenceWindowProcessor(disputeService),
    autoCloseEvidenceWindow,
  };
}

describe('DisputeEvidenceWindowProcessor', () => {
  it('closes the evidence window for the dispute named in the job', async () => {
    const { processor, autoCloseEvidenceWindow } = buildProcessor();

    await processor.process({
      data: { disputeId: DISPUTE_ID },
    } as Job<DisputeEvidenceWindowJobData>);

    expect(autoCloseEvidenceWindow).toHaveBeenCalledWith(DISPUTE_ID);
  });

  it('lets a failure propagate so BullMQ retries the job', async () => {
    const { processor, autoCloseEvidenceWindow } = buildProcessor();
    autoCloseEvidenceWindow.mockRejectedValue(new Error('connection lost'));

    await expect(
      processor.process({ data: { disputeId: DISPUTE_ID } } as Job<DisputeEvidenceWindowJobData>),
    ).rejects.toThrow('connection lost');
  });
});
