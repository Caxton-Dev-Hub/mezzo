import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarLinkChallengeResponse } from '@mezzo/shared-types';
import { RedisService } from '../redis/redis.service';
import { StellarConfigService } from './stellar-config.service';
import { StellarLinkChallengeNotFoundError } from './errors/stellar-link-challenge-not-found.error';

const TTL_SECONDS = 300;

interface StoredChallenge {
  accountId: string;
  message: string;
}

@Injectable()
export class StellarLinkChallengeService {
  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly stellarConfig: StellarConfigService,
  ) {}

  async issue(userId: string, accountId: string): Promise<StellarLinkChallengeResponse> {
    const issuedAt = new Date();
    const message = this.buildMessage({
      userId,
      accountId,
      nonce: randomBytes(16).toString('hex'),
      issuedAt,
    });

    await this.redis.set(
      this.key(userId),
      JSON.stringify({ accountId, message } satisfies StoredChallenge),
      'EX',
      TTL_SECONDS,
    );

    return {
      accountId,
      message,
      expiresAt: new Date(issuedAt.getTime() + TTL_SECONDS * 1000),
    };
  }

  async claim(userId: string, accountId: string): Promise<string> {
    const raw = await this.redis.getdel(this.key(userId));
    if (!raw) {
      throw new StellarLinkChallengeNotFoundError();
    }

    const stored = JSON.parse(raw) as StoredChallenge;
    if (stored.accountId !== accountId) {
      throw new StellarLinkChallengeNotFoundError();
    }

    return stored.message;
  }

  private key(userId: string): string {
    return `stellar:link-challenge:${userId}`;
  }

  private buildMessage(params: {
    userId: string;
    accountId: string;
    nonce: string;
    issuedAt: Date;
  }): string {
    const domain = new URL(this.configService.getOrThrow<string>('WEB_APP_URL')).host;

    return [
      `${domain} wants you to link this Stellar account to your Mezzo account.`,
      '',
      `Account: ${params.accountId}`,
      `Mezzo user: ${params.userId}`,
      `Network: ${this.stellarConfig.networkName}`,
      `Nonce: ${params.nonce}`,
      `Issued at: ${params.issuedAt.toISOString()}`,
      '',
      'Signing this proves you control the account. It authorises no payment and moves no funds.',
    ].join('\n');
  }
}
