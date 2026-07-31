import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  confirmAvatarSchema,
  ConfirmAvatarDto,
  presignAvatarSchema,
  PresignAvatarDto,
  PresignAvatarResponse,
  updateProfileSchema,
  UpdateProfileDto,
} from '@mezzo/shared-types';
import { ProfileService } from './profile.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ProfileResponse, PublicProfileResponse } from './dto/profile-response';

@Controller('profiles')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  me(@CurrentUser() currentUser: AuthenticatedUser): Promise<ProfileResponse> {
    return this.profileService.getOwnProfile(currentUser.id);
  }

  @Patch('me')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.profileService.update(currentUser.id, dto);
  }

  @Post('me/avatar/presign')
  @HttpCode(HttpStatus.CREATED)
  presignAvatar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(presignAvatarSchema)) dto: PresignAvatarDto,
  ): Promise<PresignAvatarResponse> {
    return this.profileService.presignAvatar(currentUser.id, dto);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.CREATED)
  confirmAvatar(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(confirmAvatarSchema)) dto: ConfirmAvatarDto,
  ): Promise<ProfileResponse> {
    return this.profileService.confirmAvatar(currentUser.id, dto);
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string): Promise<PublicProfileResponse> {
    return this.profileService.getPublicProfile(id);
  }
}
