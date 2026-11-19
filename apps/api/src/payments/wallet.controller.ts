import { Body, Controller, Get, Post } from '@nestjs/common';
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

  @Post('fund')
  async fund(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: { amountKobo: number },
  ): Promise<{ authorizationUrl: string; reference: string }> {
    return this.walletService.initiateFunding(currentUser.id, body.amountKobo);
  }
}
