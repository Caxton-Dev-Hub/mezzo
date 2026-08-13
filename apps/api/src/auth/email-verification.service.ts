import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailVerificationCode } from '../database/entities/email-verification-code.entity';
import { User } from '../database/entities/user.entity';
import { ResendVerificationDto, VerifyEmailDto } from './dto/auth.schemas';
import { InvalidVerificationCodeError } from './errors/invalid-verification-code.error';
import {
  EMAIL_VERIFICATION_MAILER,
  EmailVerificationMailer,
} from './mailers/email-verification-mailer.interface';

@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(EmailVerificationCode)
    private readonly codes: Repository<EmailVerificationCode>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly configService: ConfigService,
    @Inject(EMAIL_VERIFICATION_MAILER)
    private readonly mailer: EmailVerificationMailer,
  ) {}

  async sendCode(user: User): Promise<void> {
    const existing = await this.codes.findOne({ where: { userId: user.id } });
    const code = this.generateCode();
    const ttlMinutes = this.configService.getOrThrow<number>('EMAIL_VERIFICATION_CODE_TTL_MINUTES');

    await this.codes.save({
      ...(existing ?? this.codes.create({ userId: user.id })),
      codeHash: this.hashCode(code),
      attempts: 0,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      usedAt: null,
    });

    await this.mailer.send({ recipientEmail: user.email, code });
  }

  async resend(dto: ResendVerificationDto): Promise<void> {
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });

    if (!user || user.emailVerifiedAt) {
      return;
    }

    await this.sendCode(user);
  }

  async verify(dto: VerifyEmailDto): Promise<void> {
    const user = await this.users.findOne({ where: { email: dto.email.toLowerCase() } });

    if (!user || user.emailVerifiedAt) {
      throw new InvalidVerificationCodeError();
    }

    const record = await this.codes.findOne({ where: { userId: user.id } });
    const maxAttempts = this.configService.getOrThrow<number>('EMAIL_VERIFICATION_MAX_ATTEMPTS');

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new InvalidVerificationCodeError();
    }

    if (record.codeHash !== this.hashCode(dto.code)) {
      record.attempts += 1;
      if (record.attempts >= maxAttempts) {
        record.usedAt = new Date();
      }
      await this.codes.save(record);
      throw new InvalidVerificationCodeError();
    }

    record.usedAt = new Date();
    await this.codes.save(record);

    user.emailVerifiedAt = new Date();
    await this.users.save(user);
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
