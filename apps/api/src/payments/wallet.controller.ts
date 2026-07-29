import { Controller, Get } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { WalletActivityResponse, WalletBalancesResponse } from './dto/wallet-response';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  balances(@CurrentUser() currentUser: AuthenticatedUser): Promise<WalletBalancesResponse> {
    return this.walletService.getBalances(currentUser.id);
  }

  @Get('activity')
  activity(@CurrentUser() currentUser: AuthenticatedUser): Promise<WalletActivityResponse[]> {
    return this.walletService.listActivity(currentUser.id);
  }
}
