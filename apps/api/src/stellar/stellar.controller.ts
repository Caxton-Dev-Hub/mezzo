import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { StellarConfigService } from './stellar-config.service';
import { StellarWalletService } from './stellar-wallet.service';
import { StellarEscrowService } from './stellar-escrow.service';
import { StellarSettlementOutcome, StellarSettlementService } from './stellar-settlement.service';
import {
  ConfirmStellarDepositDto,
  confirmStellarDepositSchema,
  LinkStellarAccountDto,
  linkStellarAccountSchema,
  StellarLinkChallengeRequestDto,
  stellarLinkChallengeRequestSchema,
} from './dto/stellar.schemas';
import {
  StellarAccountResponse,
  StellarEscrowResponse,
  StellarLinkChallengeResponse,
  StellarRailConfigResponse,
  toStellarAccountResponse,
  toStellarEscrowResponse,
  toStellarRailConfigResponse,
} from './dto/stellar-response';

@Controller('stellar')
export class StellarController {
  constructor(
    private readonly stellarConfig: StellarConfigService,
    private readonly walletService: StellarWalletService,
    private readonly escrowService: StellarEscrowService,
    private readonly settlementService: StellarSettlementService,
  ) {}

  @Get('config')
  @Public()
  getConfig(): StellarRailConfigResponse {
    return toStellarRailConfigResponse(this.stellarConfig);
  }

  @Get('wallet')
  async getWallet(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<StellarAccountResponse | null> {
    const account = await this.walletService.find(currentUser.id);
    return account ? toStellarAccountResponse(account) : null;
  }

  @Post('wallet/challenge')
  @HttpCode(HttpStatus.OK)
  requestLinkChallenge(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(stellarLinkChallengeRequestSchema))
    dto: StellarLinkChallengeRequestDto,
  ): Promise<StellarLinkChallengeResponse> {
    return this.walletService.createChallenge(currentUser.id, dto.accountId);
  }

  @Post('wallet')
  @HttpCode(HttpStatus.OK)
  async linkWallet(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(linkStellarAccountSchema)) dto: LinkStellarAccountDto,
  ): Promise<StellarAccountResponse> {
    const account = await this.walletService.link(currentUser.id, dto.accountId, dto.signature);
    return toStellarAccountResponse(account);
  }

  @Delete('wallet')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkWallet(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.walletService.unlink(currentUser.id);
  }

  @Get('escrows/:escrowId')
  async getEscrow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<StellarEscrowResponse> {
    const stellarEscrow = await this.escrowService.get(escrowId, currentUser.id);
    return toStellarEscrowResponse(stellarEscrow);
  }

  @Post('escrows/:escrowId/fund')
  @HttpCode(HttpStatus.CREATED)
  async openFunding(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<StellarEscrowResponse> {
    const stellarEscrow = await this.escrowService.openFunding(escrowId, currentUser.id);
    return toStellarEscrowResponse(stellarEscrow);
  }

  @Post('escrows/:escrowId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmDeposit(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
    @Body(new ZodValidationPipe(confirmStellarDepositSchema)) dto: ConfirmStellarDepositDto,
  ): Promise<StellarEscrowResponse> {
    const stellarEscrow = await this.escrowService.confirmDeposit(
      escrowId,
      currentUser.id,
      dto.transactionHash,
    );
    return toStellarEscrowResponse(stellarEscrow);
  }

  @Post('escrows/:escrowId/simulate-deposit')
  @HttpCode(HttpStatus.OK)
  async simulateDeposit(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<StellarEscrowResponse> {
    const stellarEscrow = await this.escrowService.simulateDeposit(escrowId, currentUser.id);
    return toStellarEscrowResponse(stellarEscrow);
  }

  @Post('settlements/run')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  runSettlements(): Promise<StellarSettlementOutcome[]> {
    return this.settlementService.settleDue();
  }
}
