import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarAsset, StellarNetworkName } from '@mezzo/shared-types';
import { encodeStellarAccountId } from '../stellar-account-id';
import { escrowMemo } from '../escrow-memo';
import { StellarRailDisabledError } from '../errors/stellar-rail-disabled.error';
import {
  SimulatedStellarNetworkClient,
  StellarDepositAddress,
  StellarPayment,
  StellarPaymentRequest,
} from './stellar-network.interface';

@Injectable()
export class FakeStellarProvider implements SimulatedStellarNetworkClient {
  readonly name: StellarNetworkName;

  private readonly assetCode: string;

  private readonly assetIssuer: string | undefined;

  private readonly payments = new Map<string, StellarPayment>();

  constructor(configService: ConfigService) {
    this.name = configService.getOrThrow<StellarNetworkName>('STELLAR_NETWORK');
    this.assetCode = configService.getOrThrow<string>('STELLAR_ASSET_CODE');
    this.assetIssuer = configService.get<string>('STELLAR_ASSET_ISSUER');
  }

  get asset(): StellarAsset {
    if (!this.assetIssuer) {
      throw new StellarRailDisabledError();
    }
    return { code: this.assetCode, issuer: this.assetIssuer };
  }

  openDepositAddress(escrowId: string): Promise<StellarDepositAddress> {
    return Promise.resolve({
      accountId: this.deriveAccountId(`escrow:${escrowId}`),
      memo: escrowMemo(escrowId),
    });
  }

  findPayment(transactionHash: string): Promise<StellarPayment | null> {
    return Promise.resolve(this.payments.get(transactionHash) ?? null);
  }

  sendPayment(request: StellarPaymentRequest): Promise<string> {
    const payment = this.record(request);
    return Promise.resolve(payment.transactionHash);
  }

  receivePayment(request: StellarPaymentRequest): Promise<StellarPayment> {
    return Promise.resolve(this.record(request));
  }

  reset(): void {
    this.payments.clear();
  }

  private record(request: StellarPaymentRequest): StellarPayment {
    const payment: StellarPayment = {
      transactionHash: randomBytes(32).toString('hex'),
      from: request.from,
      to: request.to,
      memo: request.memo,
      asset: this.asset,
      amount: request.amount,
    };
    this.payments.set(payment.transactionHash, payment);
    return payment;
  }

  private deriveAccountId(seed: string): string {
    return encodeStellarAccountId(createHash('sha256').update(seed).digest());
  }
}
