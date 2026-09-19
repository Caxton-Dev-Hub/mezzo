import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarLinkChallengeResponse } from '@mezzo/shared-types';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { AuditService } from '../audit/audit.service';
import { isStellarAccountId } from './stellar-account-id';
import { StellarConfigService } from './stellar-config.service';
import { StellarLinkChallengeService } from './stellar-link-challenge.service';
import { verifyStellarSignature } from './stellar-signature';
import { STELLAR_ACCOUNT_ENTITY, STELLAR_AUDIT_ACTIONS } from './stellar-audit-actions';
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
    private readonly auditService: AuditService,
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
    const previousAccountId = existing?.accountId ?? null;

    account.accountId = trimmed;
    account.linkedAt = new Date();

    const linked = await this.accounts.save(account);

    await this.auditService.record({
      actorId: userId,
      action: STELLAR_AUDIT_ACTIONS.WALLET_LINKED,
      entityType: STELLAR_ACCOUNT_ENTITY,
      entityId: userId,
      reason: previousAccountId
        ? 'Replaced the settlement destination with a newly proven account'
        : 'Proved control of a Stellar account and set it as the settlement destination',
      before: previousAccountId ? { accountId: previousAccountId, network } : null,
      after: { accountId: linked.accountId, network },
    });

    return linked;
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
    const network = this.stellarConfig.networkName;
    const existing = await this.accounts.findOne({ where: { userId, network } });
    if (!existing) {
      return;
    }

    await this.accounts.delete({ userId, network });

    await this.auditService.record({
      actorId: userId,
      action: STELLAR_AUDIT_ACTIONS.WALLET_UNLINKED,
      entityType: STELLAR_ACCOUNT_ENTITY,
      entityId: userId,
      reason: 'Removed the settlement destination',
      before: { accountId: existing.accountId, network },
      after: null,
    });
  }
}
