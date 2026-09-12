import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarLinkChallengeResponse } from '@mezzo/shared-types';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { isStellarAccountId } from './stellar-account-id';
import { StellarConfigService } from './stellar-config.service';
import { StellarLinkChallengeService } from './stellar-link-challenge.service';
import { verifyStellarSignature } from './stellar-signature';
import { InvalidStellarAccountError } from './errors/invalid-stellar-account.error';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';
import { StellarSignatureInvalidError } from './errors/stellar-signature-invalid.error';

@Injectable()
export class StellarWalletService {
  constructor(
    @InjectRepository(StellarAccount)
    private readonly accounts: Repository<StellarAccount>,
    private readonly stellarConfig: StellarConfigService,
    private readonly challenges: StellarLinkChallengeService,
  ) {}

  async createChallenge(userId: string, accountId: string): Promise<StellarLinkChallengeResponse> {
    this.stellarConfig.assertEnabled();
    return this.challenges.issue(userId, this.assertAccountId(accountId));
  }

  async link(userId: string, accountId: string, signature: string): Promise<StellarAccount> {
    this.stellarConfig.assertEnabled();

    const trimmed = this.assertAccountId(accountId);
    const message = await this.challenges.claim(userId, trimmed);

    if (!verifyStellarSignature(trimmed, message, signature)) {
      throw new StellarSignatureInvalidError(trimmed);
    }

    const network = this.stellarConfig.networkName;
    const existing = await this.accounts.findOne({ where: { userId, network } });
    const account = existing ?? this.accounts.create({ userId, network });

    account.accountId = trimmed;
    account.linkedAt = new Date();

    return this.accounts.save(account);
  }

  private assertAccountId(accountId: string): string {
    const trimmed = accountId.trim();
    if (!isStellarAccountId(trimmed)) {
      throw new InvalidStellarAccountError(trimmed);
    }
    return trimmed;
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
