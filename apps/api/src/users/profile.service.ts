import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import {
  ConfirmAvatarDto,
  PresignAvatarDto,
  PresignAvatarResponse,
  UpdateProfileDto,
} from '@mezzo/shared-types';
import { User } from '../database/entities/user.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { STORAGE_PROVIDER, StorageProvider } from '../evidence/storage/storage-provider.interface';
import {
  ProfileResponse,
  PublicProfileResponse,
  toProfileResponse,
  toPublicProfileResponse,
} from './dto/profile-response';
import { InvalidAvatarKeyError } from './errors/invalid-avatar-key.error';
import { AvatarMimeMismatchError } from './errors/avatar-mime-mismatch.error';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(EscrowParty)
    private readonly parties: Repository<EscrowParty>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  async getOwnProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.requireUser(userId);
    const [completedEscrows, avatarUrl] = await Promise.all([
      this.countCompletedEscrows(user.id),
      this.resolveAvatarUrl(user),
    ]);

    return toProfileResponse(user, completedEscrows, avatarUrl);
  }

  async getPublicProfile(userId: string): Promise<PublicProfileResponse> {
    const user = await this.requireUser(userId);
    const [completedEscrows, avatarUrl] = await Promise.all([
      this.countCompletedEscrows(user.id),
      this.resolveAvatarUrl(user),
    ]);

    return toPublicProfileResponse(user, completedEscrows, avatarUrl);
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const user = await this.requireUser(userId);

    user.businessName = dto.businessName;
    user.bio = dto.bio;
    user.location = dto.location;
    await this.users.save(user);

    return this.getOwnProfile(user.id);
  }

  async presignAvatar(userId: string, dto: PresignAvatarDto): Promise<PresignAvatarResponse> {
    const key = `avatars/${userId}/${randomUUID()}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(key, dto.mimeType);
    return { uploadUrl, key };
  }

  async confirmAvatar(userId: string, dto: ConfirmAvatarDto): Promise<ProfileResponse> {
    const user = await this.requireUser(userId);

    if (!dto.key.startsWith(`avatars/${userId}/`)) {
      throw new InvalidAvatarKeyError();
    }

    const buffer = await this.storage.getObject(dto.key);
    const detected = await fileTypeFromBuffer(buffer);
    const detectedMime = detected?.mime ?? null;

    if (detectedMime !== dto.declaredMime || buffer.length > MAX_AVATAR_BYTES) {
      await this.storage.deleteObject(dto.key).catch(() => undefined);
      throw new AvatarMimeMismatchError(dto.declaredMime, detectedMime);
    }

    const previousKey = user.avatarKey;
    user.avatarKey = dto.key;
    await this.users.save(user);

    if (previousKey && previousKey !== dto.key) {
      await this.storage.deleteObject(previousKey).catch(() => undefined);
    }

    return this.getOwnProfile(user.id);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private countCompletedEscrows(userId: string): Promise<number> {
    return this.parties
      .createQueryBuilder('party')
      .innerJoin('party.escrow', 'escrow')
      .where('party.userId = :userId', { userId })
      .andWhere('escrow.state = :state', { state: EscrowState.RELEASED })
      .getCount();
  }

  private async resolveAvatarUrl(user: User): Promise<string | null> {
    if (!user.avatarKey) {
      return null;
    }

    return this.storage.getPresignedDownloadUrl(user.avatarKey);
  }
}
