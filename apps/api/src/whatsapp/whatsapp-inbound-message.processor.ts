import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WhatsAppCommandDispatcherService } from './whatsapp-command-dispatcher.service';
import { WHATSAPP_INBOUND_QUEUE, WhatsAppInboundJobData } from './whatsapp-inbound-queue.constants';

@Processor(WHATSAPP_INBOUND_QUEUE)
export class WhatsAppInboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppInboundMessageProcessor.name);

  constructor(private readonly dispatcher: WhatsAppCommandDispatcherService) {
    super();
  }

  async process(job: Job<WhatsAppInboundJobData>): Promise<void> {
    await this.dispatcher.handle(job.data);
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`WhatsApp inbound worker error: ${error.message}`);
  }
}
