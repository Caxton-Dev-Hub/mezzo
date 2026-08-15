import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AUTO_RELEASE_QUEUE, AutoReleaseJobData } from './auto-release-queue.constants';
import { SettlementService } from './settlement.service';

@Processor(AUTO_RELEASE_QUEUE, { drainDelay: 300_000 })
export class AutoReleaseProcessor extends WorkerHost {
  constructor(private readonly settlementService: SettlementService) {
    super();
  }

  async process(job: Job<AutoReleaseJobData>): Promise<void> {
    await this.settlementService.autoRelease(job.data.escrowId);
  }
}
