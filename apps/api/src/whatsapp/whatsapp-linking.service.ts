import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { WhatsAppLinkCode } from '../database/entities/whatsapp-link-code.entity';
import { WHATSAPP_CLIENT, WhatsAppClient } from './client/whatsapp-client.interface';
import { WhatsAppLinkCodeInvalidError } from './errors/whatsapp-link-code-invalid.error';
import { WhatsAppNumberAlreadyLinkedError } from './errors/whatsapp-number-already-linked.error';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

@Injectable()
export class WhatsAppLinkingService {
  constructor(
    @InjectRepository(WhatsAppLinkCode)
    private readonly linkCodes: Repository<WhatsAppLinkCode>,
    @InjectRepository(WhatsAppAccount)
    private readonly accounts: Repository<WhatsAppAccount>,
    private readonly configService: ConfigService,
    @Inject(WHATSAPP_CLIENT)
    private readonly client: WhatsAppClient,
  ) {}

  async startLink(userId: string, phoneNumber: string): Promise<void> {
    const existing = await this.accounts.findOne({ where: { phoneNumber } });
    if (existing && existing.userId !== userId) {
      throw new WhatsAppNumberAlreadyLinkedError();
    }

    const code = this.generateCode();
    const ttlMinutes = this.configService.getOrThrow<number>('WHATSAPP_LINK_CODE_TTL_MINUTES');
    const existingRequest = await this.linkCodes.findOne({ where: { userId } });

    await this.linkCodes.save({
      ...(existingRequest ?? this.linkCodes.create({ userId })),
      phoneNumber,
      codeHash: this.hashCode(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      usedAt: null,
    });

    await this.client.sendText(
      phoneNumber,
      `Your Mezzo linking code is ${code}. It expires in ${ttlMinutes} minutes. Reply with the code to finish linking this number.`,
    );
  }

  async confirmLink(phoneNumber: string, code: string): Promise<WhatsAppAccount> {
    const record = await this.linkCodes.findOne({
      where: { phoneNumber },
      order: { createdAt: 'DESC' },
    });
    const maxAttempts = this.configService.getOrThrow<number>('WHATSAPP_LINK_MAX_ATTEMPTS');

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new WhatsAppLinkCodeInvalidError();
    }

    if (record.codeHash !== this.hashCode(code)) {
      record.attempts += 1;
      if (record.attempts >= maxAttempts) {
        record.usedAt = new Date();
      }
      await this.linkCodes.save(record);
      throw new WhatsAppLinkCodeInvalidError();
    }

    record.usedAt = new Date();
    await this.linkCodes.save(record);

    const existing = await this.accounts.findOne({ where: { userId: record.userId } });

    try {
      return await this.accounts.save({
        ...(existing ?? this.accounts.create({ userId: record.userId })),
        phoneNumber,
        verifiedAt: new Date(),
        pinHash: existing?.phoneNumber === phoneNumber ? existing.pinHash : null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new WhatsAppNumberAlreadyLinkedError();
      }
      throw error;
    }
  }

  async findByPhoneNumber(phoneNumber: string): Promise<WhatsAppAccount | null> {
    return this.accounts.findOne({ where: { phoneNumber } });
  }

  async setOptedOut(userId: string, optedOut: boolean): Promise<void> {
    await this.accounts.update({ userId }, { notificationsOptedOutAt: optedOut ? new Date() : null });
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
