import { ConfigService } from '@nestjs/config';
import { WhatsAppDedupeService } from './whatsapp-dedupe.service';
import { RedisService } from '../redis/redis.service';

describe('WhatsAppDedupeService.claim', () => {
  it('claims a message id the first time and enforces a TTL', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const redis = { set } as unknown as RedisService;
    const configService = { getOrThrow: jest.fn().mockReturnValue(300) } as unknown as ConfigService;
    const service = new WhatsAppDedupeService(redis, configService);

    const claimed = await service.claim('wamid.123');

    expect(claimed).toBe(true);
    expect(set).toHaveBeenCalledWith('whatsapp:inbound:wamid.123', '1', 'EX', 300, 'NX');
  });

  it('reports false for a redelivered message id', async () => {
    const set = jest.fn().mockResolvedValue(null);
    const redis = { set } as unknown as RedisService;
    const configService = { getOrThrow: jest.fn().mockReturnValue(300) } as unknown as ConfigService;
    const service = new WhatsAppDedupeService(redis, configService);

    const claimed = await service.claim('wamid.123');

    expect(claimed).toBe(false);
  });
});
