import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailVerificationCode } from '../database/entities/email-verification-code.entity';
import { PasswordResetToken } from '../database/entities/password-reset-token.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { persistenceFeature } from '../database/persistence.feature';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';
import { EmailVerificationService } from './email-verification.service';
import { TokenService } from './token.service';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { FakePasswordResetMailer } from './mailers/fake-password-reset.mailer';
import { ResendPasswordResetMailer } from './mailers/resend-password-reset.mailer';
import {
  PASSWORD_RESET_MAILER,
  PasswordResetMailer,
} from './mailers/password-reset-mailer.interface';
import { FakeEmailVerificationMailer } from './mailers/fake-email-verification.mailer';
import { ResendEmailVerificationMailer } from './mailers/resend-email-verification.mailer';
import {
  EMAIL_VERIFICATION_MAILER,
  EmailVerificationMailer,
} from './mailers/email-verification-mailer.interface';

@Module({
  imports: [
    ...persistenceFeature([User, RefreshToken, PasswordResetToken, EmailVerificationCode]),
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    EmailVerificationService,
    TokenService,
    GoogleTokenVerifier,
    AuthRateLimitGuard,
    FakePasswordResetMailer,
    ResendPasswordResetMailer,
    FakeEmailVerificationMailer,
    ResendEmailVerificationMailer,
    {
      provide: PASSWORD_RESET_MAILER,
      inject: [ConfigService, FakePasswordResetMailer, ResendPasswordResetMailer],
      useFactory: (
        configService: ConfigService,
        fakeMailer: FakePasswordResetMailer,
        resendMailer: ResendPasswordResetMailer,
      ): PasswordResetMailer =>
        configService.get<string>('NOTIFICATION_EMAIL_PROVIDER') === 'resend'
          ? resendMailer
          : fakeMailer,
    },
    {
      provide: EMAIL_VERIFICATION_MAILER,
      inject: [ConfigService, FakeEmailVerificationMailer, ResendEmailVerificationMailer],
      useFactory: (
        configService: ConfigService,
        fakeMailer: FakeEmailVerificationMailer,
        resendMailer: ResendEmailVerificationMailer,
      ): EmailVerificationMailer =>
        configService.get<string>('NOTIFICATION_EMAIL_PROVIDER') === 'resend'
          ? resendMailer
          : fakeMailer,
    },
  ],
  exports: [FakePasswordResetMailer, FakeEmailVerificationMailer, TokenService],
})
export class AuthModule {}
