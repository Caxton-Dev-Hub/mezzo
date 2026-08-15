import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  createEscrowSchema,
  CreateEscrowDto,
  listEscrowsQuerySchema,
  ListEscrowsQuery,
  updateEscrowTermsSchema,
  UpdateEscrowTermsDto,
} from './dto/escrow.schemas';
import {
  EscrowDetailResponse,
  EscrowEventResponse,
  EscrowListResponse,
  EscrowTermsResponse,
  InviteResponse,
  toEscrowDetailResponse,
  toEscrowEventResponse,
  toEscrowListResponse,
  toEscrowTermsResponse,
  toInviteResponse,
} from './dto/escrow-response';

@Controller('escrows')
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(createEscrowSchema)) dto: CreateEscrowDto,
  ): Promise<EscrowDetailResponse> {
    const escrow = await this.escrowService.createDraft(currentUser.id, dto);
    const detail = await this.escrowService.getDetail(escrow.id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }

  @Get()
  async list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ZodValidationPipe(listEscrowsQuerySchema)) query: ListEscrowsQuery,
  ): Promise<EscrowListResponse> {
    const { items, total } = await this.escrowService.listForUser(currentUser.id, query);
    return toEscrowListResponse(items, query.page, query.pageSize, total);
  }

  @Get(':id')
  async get(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowDetailResponse> {
    await this.escrowService.assertIsParty(id, currentUser.id);
    const detail = await this.escrowService.getDetail(id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }

  @Get(':id/events')
  async getEvents(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowEventResponse[]> {
    await this.escrowService.assertIsParty(id, currentUser.id);
    const events = await this.escrowService.getEvents(id);
    return events.map(toEscrowEventResponse);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<InviteResponse> {
    const invite = await this.escrowService.invite(id, currentUser.id);
    return toInviteResponse(invite);
  }

  @Post(':id/accept-terms')
  @HttpCode(HttpStatus.OK)
  async acceptTerms(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowDetailResponse> {
    await this.escrowService.acceptTerms(id, currentUser.id);
    const detail = await this.escrowService.getDetail(id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }

  @Patch(':id/terms')
  @HttpCode(HttpStatus.OK)
  async updateTerms(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateEscrowTermsSchema)) dto: UpdateEscrowTermsDto,
  ): Promise<EscrowTermsResponse> {
    const terms = await this.escrowService.updateTerms(id, currentUser.id, dto);
    return toEscrowTermsResponse(terms);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EscrowDetailResponse> {
    await this.escrowService.cancel(id, currentUser.id);
    const detail = await this.escrowService.getDetail(id);
    return toEscrowDetailResponse(detail.escrow, detail.terms, detail.parties);
  }
}
