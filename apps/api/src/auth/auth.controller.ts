import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
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
} from './dto/auth.schemas';
import { UserResponse } from '../users/dto/user-response';
import { TokenPair } from './token.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
