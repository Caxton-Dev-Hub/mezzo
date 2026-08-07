import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PasswordResetToken } from '../database/entities/password-reset-token.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { persistenceFeature } from '../database/persistence.feature';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { FakePasswordResetMailer } from './mailers/fake-password-reset.mailer';
import { ResendPasswordResetMailer } from './mailers/resend-password-reset.mailer';
import {
  PASSWORD_RESET_MAILER,
  PasswordResetMailer,
} from './mailers/password-reset-mailer.interface';

@Module({
  imports: [
    ...persistenceFeature([User, RefreshToken, PasswordResetToken]),
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    TokenService,
    GoogleTokenVerifier,
    AuthRateLimitGuard,
    FakePasswordResetMailer,
    ResendPasswordResetMailer,
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
  ],
  exports: [FakePasswordResetMailer],
})
export class AuthModule {}
