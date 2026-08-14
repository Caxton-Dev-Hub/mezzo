import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSettingsResponse } from '@mezzo/shared-types';
import { PlatformFlag } from '../database/entities/platform-flag.entity';
import { VERIFICATION_FLAG_KEY, WHATSAPP_TRANSACTIONAL_FLAG_KEY } from './platform-flag-key';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(PlatformFlag)
    private readonly flags: Repository<PlatformFlag>,
    private readonly configService: ConfigService,
  ) {}

  async isVerificationEnabled(): Promise<boolean> {
    const flag = await this.flags.findOne({ where: { key: VERIFICATION_FLAG_KEY } });
    return flag ? flag.enabled : this.defaultVerificationEnabled();
  }

  async getPlatformSettings(): Promise<PlatformSettingsResponse> {
    const flag = await this.flags.findOne({ where: { key: VERIFICATION_FLAG_KEY } });

    return {
      verificationEnabled: flag ? flag.enabled : this.defaultVerificationEnabled(),
      updatedAt: flag ? flag.updatedAt : null,
      updatedById: flag ? flag.updatedById : null,
    };
  }

  async setVerificationEnabled(
    actorId: string,
    enabled: boolean,
  ): Promise<{ before: boolean; after: boolean }> {
    const before = await this.isVerificationEnabled();

    await this.flags.save(
      this.flags.create({ key: VERIFICATION_FLAG_KEY, enabled, updatedById: actorId }),
    );

    return { before, after: enabled };
  }

  private defaultVerificationEnabled(): boolean {
    return this.configService.get<boolean>('VERIFICATION_ENABLED') ?? true;
  }

  async isWhatsappTransactionalEnabled(): Promise<boolean> {
    const flag = await this.flags.findOne({ where: { key: WHATSAPP_TRANSACTIONAL_FLAG_KEY } });
    return flag ? flag.enabled : this.defaultWhatsappTransactionalEnabled();
  }

  async setWhatsappTransactionalEnabled(
    actorId: string,
    enabled: boolean,
  ): Promise<{ before: boolean; after: boolean }> {
    const before = await this.isWhatsappTransactionalEnabled();

    await this.flags.save(
      this.flags.create({ key: WHATSAPP_TRANSACTIONAL_FLAG_KEY, enabled, updatedById: actorId }),
    );

    return { before, after: enabled };
  }

  private defaultWhatsappTransactionalEnabled(): boolean {
    return this.configService.get<boolean>('WHATSAPP_TRANSACTIONAL_ENABLED') ?? false;
  }
}
