import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RentalsService } from './rentals.service';

@Processor('rental-accrual')
export class OverdueAccrualProcessor extends WorkerHost {
  constructor(private readonly rentalsService: RentalsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    await this.rentalsService.runOverdueAccrual();
  }
}
