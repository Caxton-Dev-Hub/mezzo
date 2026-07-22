import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  INSPECTION_ENDING_SOON_QUEUE,
  InspectionEndingSoonJobData,
} from './inspection-ending-soon-queue.constants';
import { SettlementService } from './settlement.service';

@Processor(INSPECTION_ENDING_SOON_QUEUE)
export class InspectionEndingSoonProcessor extends WorkerHost {
  constructor(private readonly settlementService: SettlementService) {
    super();
  }

  async process(job: Job<InspectionEndingSoonJobData>): Promise<void> {
    await this.settlementService.notifyInspectionEndingSoon(job.data.escrowId);
  }
}
