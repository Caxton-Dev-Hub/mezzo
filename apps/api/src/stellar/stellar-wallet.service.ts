import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { isStellarAccountId } from './stellar-account-id';
import { StellarConfigService } from './stellar-config.service';
import { InvalidStellarAccountError } from './errors/invalid-stellar-account.error';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';

@Injectable()
export class StellarWalletService {
  constructor(
    @InjectRepository(StellarAccount)
    private readonly accounts: Repository<StellarAccount>,
    private readonly stellarConfig: StellarConfigService,
  ) {}

  async link(userId: string, accountId: string): Promise<StellarAccount> {
    this.stellarConfig.assertEnabled();

    const trimmed = accountId.trim();
    if (!isStellarAccountId(trimmed)) {
      throw new InvalidStellarAccountError(trimmed);
    }

    const network = this.stellarConfig.networkName;
    const existing = await this.accounts.findOne({ where: { userId, network } });
    const account = existing ?? this.accounts.create({ userId, network });

    account.accountId = trimmed;
    account.linkedAt = new Date();

    return this.accounts.save(account);
  }

  find(userId: string): Promise<StellarAccount | null> {
    return this.accounts.findOne({
      where: { userId, network: this.stellarConfig.networkName },
    });
  }

  async findOrThrow(userId: string): Promise<StellarAccount> {
    const account = await this.find(userId);
    if (!account) {
      throw new StellarAccountNotLinkedError(userId);
    }
    return account;
  }

  async unlink(userId: string): Promise<void> {
    await this.accounts.delete({ userId, network: this.stellarConfig.networkName });
  }
}
