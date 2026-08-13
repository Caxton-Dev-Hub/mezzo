import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { EmailVerificationService } from './email-verification.service';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import {
  loginSchema,
  LoginDto,
  refreshSchema,
  RefreshDto,
  registerSchema,
  RegisterDto,
  googleLoginSchema,
  GoogleLoginDto,
  forgotPasswordSchema,
  ForgotPasswordDto,
  resetPasswordSchema,
  ResetPasswordDto,
  verifyEmailSchema,
  VerifyEmailDto,
  resendVerificationSchema,
  ResendVerificationDto,
} from './dto/auth.schemas';
import { UserResponse } from '../users/dto/user-response';
import { TokenPair } from './token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto): Promise<UserResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
  ): Promise<TokenPair & { user: UserResponse }> {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('google')
  @HttpCode(HttpStatus.OK)
  loginWithGoogle(
    @Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginDto,
  ): Promise<TokenPair & { user: UserResponse }> {
    return this.authService.loginWithGoogle(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) dto: RefreshDto): Promise<TokenPair> {
    return this.authService.refresh(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ): Promise<void> {
    return this.passwordResetService.request(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<void> {
    return this.passwordResetService.reset(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto): Promise<void> {
    return this.emailVerificationService.verify(dto);
  }

  @Public()
  @UseGuards(AuthRateLimitGuard)
  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) dto: ResendVerificationDto,
  ): Promise<void> {
    return this.emailVerificationService.resend(dto);
  }
}
