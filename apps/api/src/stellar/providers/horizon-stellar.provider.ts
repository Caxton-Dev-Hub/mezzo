import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarAsset, StellarNetworkName } from '@mezzo/shared-types';
import { escrowMemo } from '../escrow-memo';
import {
  StellarDepositAddress,
  StellarNetworkClient,
  StellarPayment,
  StellarPaymentRequest,
} from './stellar-network.interface';

const TRANSACTION_TIMEOUT_SECONDS = 60;

@Injectable()
export class HorizonStellarProvider implements StellarNetworkClient {
  readonly name: StellarNetworkName;

  readonly asset: StellarAsset;

  private readonly logger = new Logger(HorizonStellarProvider.name);

  private readonly server: Horizon.Server;

  private readonly custody: Keypair;

  private readonly networkPassphrase: string;

  constructor(configService: ConfigService) {
    this.name = configService.getOrThrow<StellarNetworkName>('STELLAR_NETWORK');
    this.asset = {
      code: configService.getOrThrow<string>('STELLAR_ASSET_CODE'),
      issuer: configService.getOrThrow<string>('STELLAR_ASSET_ISSUER'),
    };
    this.server = new Horizon.Server(configService.getOrThrow<string>('STELLAR_HORIZON_URL'));
    this.custody = Keypair.fromSecret(configService.getOrThrow<string>('STELLAR_CUSTODY_SECRET'));
    this.networkPassphrase = this.name === 'public' ? Networks.PUBLIC : Networks.TESTNET;
  }

  openDepositAddress(escrowId: string): Promise<StellarDepositAddress> {
    return Promise.resolve({
      accountId: this.custody.publicKey(),
      memo: escrowMemo(escrowId),
    });
  }

  async findPayment(transactionHash: string): Promise<StellarPayment | null> {
    const transaction = await this.loadTransaction(transactionHash);
    if (!transaction || !transaction.successful) {
      return null;
    }

    const { records } = await this.server.payments().forTransaction(transactionHash).call();
    const payment = records.find(
      (record): record is Horizon.ServerApi.PaymentOperationRecord =>
        record.type === Horizon.HorizonApi.OperationResponseType.payment &&
        record.to === this.custody.publicKey(),
    );
    if (!payment || payment.asset_type === 'native') {
      return null;
    }

    return {
      transactionHash,
      from: payment.from,
      to: payment.to,
      memo: transaction.memo_type === 'text' ? (transaction.memo ?? null) : null,
      asset: { code: payment.asset_code ?? '', issuer: payment.asset_issuer ?? '' },
      amount: payment.amount,
    };
  }

  async sendPayment(request: StellarPaymentRequest): Promise<string> {
    if (request.from !== this.custody.publicKey()) {
      throw new ServiceUnavailableException('Mezzo does not hold the key for that Stellar account');
    }

    const account = await this.server.loadAccount(this.custody.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: request.to,
          asset: new Asset(this.asset.code, this.asset.issuer),
          amount: request.amount,
        }),
      )
      .addMemo(Memo.text(request.memo))
      .setTimeout(TRANSACTION_TIMEOUT_SECONDS)
      .build();

    transaction.sign(this.custody);

    try {
      const result = await this.server.submitTransaction(transaction);
      return result.hash;
    } catch (error) {
      this.logger.error(`Stellar payment submission failed: ${describeSubmitError(error)}`);
      throw new ServiceUnavailableException('The Stellar network rejected the payment');
    }
  }

  private async loadTransaction(
    transactionHash: string,
  ): Promise<Horizon.ServerApi.TransactionRecord | null> {
    try {
      return await this.server.transactions().transaction(transactionHash).call();
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404;
}

function describeSubmitError(error: unknown): string {
  const codes = (
    error as {
      response?: { data?: { extras?: { result_codes?: Record<string, unknown> } } };
    }
  )?.response?.data?.extras?.result_codes;

  return codes ? JSON.stringify(codes) : String(error);
}
