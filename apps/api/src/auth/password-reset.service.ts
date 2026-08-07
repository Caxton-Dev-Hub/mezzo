import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetToken } from '../database/entities/password-reset-token.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { PasswordService } from './password.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/auth.schemas';
import { InvalidPasswordResetTokenError } from './errors/invalid-password-reset-token.error';
import {
  PASSWORD_RESET_MAILER,
  PasswordResetMailer,
} from './mailers/password-reset-mailer.interface';

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
    @Inject(PASSWORD_RESET_MAILER)
    private readonly mailer: PasswordResetMailer,
  ) {}

  async request(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });

    if (!user) {
      return;
    }

    await this.resetTokens.update({ userId: user.id }, { usedAt: new Date() });

    const token = randomBytes(32).toString('base64url');
    const ttlMinutes = this.configService.getOrThrow<number>('PASSWORD_RESET_TOKEN_TTL_MINUTES');

    await this.resetTokens.save(
      this.resetTokens.create({
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
        usedAt: null,
      }),
    );

    await this.mailer.send({
      recipientEmail: user.email,
      resetUrl: this.buildResetUrl(token),
    });
  }

  async reset(dto: ResetPasswordDto): Promise<void> {
    const record = await this.resetTokens.findOne({
      where: { tokenHash: this.hashToken(dto.token) },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new InvalidPasswordResetTokenError();
    }

    const user = await this.users.findOne({ where: { id: record.userId } });

    if (!user) {
      throw new InvalidPasswordResetTokenError();
    }

    user.passwordHash = await this.passwordService.hash(dto.password);
    await this.users.save(user);

    record.usedAt = new Date();
    await this.resetTokens.save(record);

    await this.refreshTokens.update({ userId: user.id }, { revokedAt: new Date() });
  }

  private buildResetUrl(token: string): string {
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    return `${webAppUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
