import {
  StellarAccountResponse,
  StellarEscrowResponse,
  StellarLinkChallengeResponse,
  StellarRailConfigResponse,
} from '@mezzo/shared-types';
import { StellarAccount } from '../../database/entities/stellar-account.entity';
import { StellarEscrow } from '../../database/entities/stellar-escrow.entity';
import { Money } from '../../common/money/money';
import { toStellarAmount } from '../stellar-amount';
import { StellarConfigService } from '../stellar-config.service';

export {
  StellarAccountResponse,
  StellarEscrowResponse,
  StellarLinkChallengeResponse,
  StellarRailConfigResponse,
};

export function toStellarRailConfigResponse(
  stellarConfig: StellarConfigService,
): StellarRailConfigResponse {
  return {
    enabled: stellarConfig.isEnabled(),
    network: stellarConfig.networkName,
    asset: stellarConfig.asset,
  };
}

export function toStellarAccountResponse(account: StellarAccount): StellarAccountResponse {
  return {
    accountId: account.accountId,
    network: account.network,
    linkedAt: account.linkedAt,
  };
}

export function toStellarEscrowResponse(stellarEscrow: StellarEscrow): StellarEscrowResponse {
  const expected = Money.of(stellarEscrow.expectedAmount, stellarEscrow.expectedCurrency);

  return {
    escrowId: stellarEscrow.escrowId,
    status: stellarEscrow.status,
    network: stellarEscrow.network,
    depositAccountId: stellarEscrow.depositAccountId,
    memo: stellarEscrow.memo,
    asset: { code: stellarEscrow.assetCode, issuer: stellarEscrow.assetIssuer },
    expected: expected.toJSON(),
    expectedAssetAmount: toStellarAmount(expected),
    fundingTransactionHash: stellarEscrow.fundingTransactionHash,
    settlementTransactionHash: stellarEscrow.settlementTransactionHash,
  };
}
