import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { PasswordService } from '../auth/password.service';
import { WhatsAppPinNotSetError } from './errors/whatsapp-pin-not-set.error';
import { WhatsAppPinLockedError } from './errors/whatsapp-pin-locked.error';
import { WhatsAppPinIncorrectError } from './errors/whatsapp-pin-incorrect.error';

@Injectable()
export class WhatsAppPinService {
  constructor(
    @InjectRepository(WhatsAppAccount)
    private readonly accounts: Repository<WhatsAppAccount>,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
  ) {}

  async setPin(userId: string, plainPin: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { userId } });
    if (!account) {
      throw new NotFoundException('WhatsApp account not found');
    }

    account.pinHash = await this.passwordService.hash(plainPin);
    account.pinFailedAttempts = 0;
    account.pinLockedUntil = null;
    await this.accounts.save(account);
  }

  hasPin(account: WhatsAppAccount): boolean {
    return account.pinHash !== null;
  }

  async verify(account: WhatsAppAccount, plainPin: string): Promise<void> {
    if (!account.pinHash) {
      throw new WhatsAppPinNotSetError();
    }

    if (account.pinLockedUntil && account.pinLockedUntil.getTime() > Date.now()) {
      throw new WhatsAppPinLockedError(account.pinLockedUntil);
    }

    const maxAttempts = this.configService.getOrThrow<number>('WHATSAPP_PIN_MAX_ATTEMPTS');
    const isValid = await this.passwordService.verify(account.pinHash, plainPin);

    if (!isValid) {
      account.pinFailedAttempts += 1;
      let lockedUntil: Date | null = null;
      if (account.pinFailedAttempts >= maxAttempts) {
        const lockoutMinutes = this.configService.getOrThrow<number>('WHATSAPP_PIN_LOCKOUT_MINUTES');
        lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
        account.pinLockedUntil = lockedUntil;
        account.pinFailedAttempts = 0;
      }
      await this.accounts.save(account);

      if (lockedUntil) {
        throw new WhatsAppPinLockedError(lockedUntil);
      }
      throw new WhatsAppPinIncorrectError(maxAttempts - account.pinFailedAttempts);
    }

    account.pinFailedAttempts = 0;
    account.pinLockedUntil = null;
    await this.accounts.save(account);
  }
}
