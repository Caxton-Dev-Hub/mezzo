import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WhatsAppDedupeService {
  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /** Returns true the first time a given WhatsApp message id is seen, false on any redelivery. */
  async claim(waMessageId: string): Promise<boolean> {
    const ttlSeconds = this.configService.getOrThrow<number>('WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS');
    const result = await this.redis.set(
      `whatsapp:inbound:${waMessageId}`,
      '1',
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }
}
