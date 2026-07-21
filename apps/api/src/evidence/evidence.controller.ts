import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ConfirmEvidenceDto,
  confirmEvidenceSchema,
  PresignEvidenceDto,
  presignEvidenceSchema,
} from './dto/evidence.schemas';
import {
  EvidenceBundleResponse,
  EvidenceItemResponse,
  PresignEvidenceResponse,
} from './dto/evidence-response';

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  presign(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignEvidenceSchema)) dto: PresignEvidenceDto,
  ): Promise<PresignEvidenceResponse> {
    return this.evidenceService.presign(currentUser.id, dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  confirm(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmEvidenceSchema)) dto: ConfirmEvidenceDto,
  ): Promise<EvidenceItemResponse> {
    return this.evidenceService.confirm(currentUser.id, dto);
  }

  @Get(':escrowId')
  getBundle(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('escrowId') escrowId: string,
  ): Promise<EvidenceBundleResponse> {
    return this.evidenceService.getBundle(currentUser.id, escrowId);
  }
}
