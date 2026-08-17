import { PayoutAccountResponse } from '@mezzo/shared-types';
import { PayoutAccount } from '../../database/entities/payout-account.entity';

export type { PayoutAccountResponse };

export function toPayoutAccountResponse(account: PayoutAccount): PayoutAccountResponse {
  return {
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    updatedAt: account.updatedAt,
  };
}
