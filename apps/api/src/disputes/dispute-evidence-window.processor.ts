import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DISPUTE_EVIDENCE_WINDOW_QUEUE, DisputeEvidenceWindowJobData } from './dispute-evidence-window-queue.constants';
import { DisputeService } from './dispute.service';

@Processor(DISPUTE_EVIDENCE_WINDOW_QUEUE)
export class DisputeEvidenceWindowProcessor extends WorkerHost {
  constructor(private readonly disputeService: DisputeService) {
    super();
  }

  async process(job: Job<DisputeEvidenceWindowJobData>): Promise<void> {
    await this.disputeService.autoCloseEvidenceWindow(job.data.disputeId);
  }
}
