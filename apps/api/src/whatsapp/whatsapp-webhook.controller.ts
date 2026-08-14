import type { Request, Response } from 'express';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Public } from '../common/decorators/public.decorator';
import { extractInboundMessages, whatsAppWebhookEventSchema } from './dto/whatsapp.schemas';
import { WhatsAppWebhookSignatureService } from './whatsapp-webhook-signature.service';
import { WhatsAppDedupeService } from './whatsapp-dedupe.service';
import { WHATSAPP_INBOUND_JOB, WHATSAPP_INBOUND_QUEUE } from './whatsapp-inbound-queue.constants';

@Controller('whatsapp')
export class WhatsAppWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly signatureService: WhatsAppWebhookSignatureService,
    private readonly dedupeService: WhatsAppDedupeService,
    @InjectQueue(WHATSAPP_INBOUND_QUEUE)
    private readonly queue: Queue,
  ) {}

  @Public()
  @Get('webhook')
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): void {
    if (!this.configService.getOrThrow<boolean>('WHATSAPP_ENABLED')) {
      throw new NotFoundException();
    }

    if (mode !== 'subscribe' || !this.signatureService.verifyChallengeToken(verifyToken)) {
      throw new ForbiddenException();
    }

    response.status(HttpStatus.OK).send(challenge ?? '');
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: RawBodyRequest<Request>): Promise<{ received: boolean }> {
    if (!this.configService.getOrThrow<boolean>('WHATSAPP_ENABLED')) {
      return { received: false };
    }

    const signature = request.headers['x-hub-signature-256'];
    this.signatureService.verify(
      request.rawBody ?? Buffer.alloc(0),
      typeof signature === 'string' ? signature : undefined,
    );

    const parsed = whatsAppWebhookEventSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message));
    }

    for (const message of extractInboundMessages(parsed.data)) {
      const isNew = await this.dedupeService.claim(message.waMessageId);
      if (!isNew) {
        continue;
      }

      await this.queue.add(WHATSAPP_INBOUND_JOB, message, { jobId: message.waMessageId });
    }

    return { received: true };
  }
}
