import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { toUserResponse, UserResponse } from '../users/dto/user-response';
import { PasswordService } from './password.service';
import { TokenService, TokenPair } from './token.service';
import { GoogleTokenVerifier } from './google-token-verifier.service';
import { EmailVerificationService } from './email-verification.service';
import { RegisterDto, LoginDto, RefreshDto, GoogleLoginDto } from './dto/auth.schemas';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { GoogleEmailNotVerifiedError } from './errors/google-email-not-verified.error';
import { EmailNotVerifiedError } from './errors/email-not-verified.error';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly googleTokenVerifier: GoogleTokenVerifier,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponse> {
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create(dto.email, passwordHash);
    await this.emailVerificationService.sendCode(user);
    return toUserResponse(user);
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: UserResponse }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user?.passwordHash) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    if (!user.emailVerifiedAt) {
      throw new EmailNotVerifiedError();
    }

    const tokens = await this.tokenService.issueTokenPair(user);
    return { ...tokens, user: toUserResponse(user) };
  }

  async loginWithGoogle(dto: GoogleLoginDto): Promise<TokenPair & { user: UserResponse }> {
    const identity = await this.googleTokenVerifier.verify(dto.idToken);

    if (!identity.emailVerified) {
      throw new GoogleEmailNotVerifiedError();
    }

    const user = await this.usersService.linkOrCreateGoogleUser(identity.sub, identity.email);
    const tokens = await this.tokenService.issueTokenPair(user);

    return { ...tokens, user: toUserResponse(user) };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const { accessToken, refreshToken } = await this.tokenService.rotate(dto.refreshToken);
    return { accessToken, refreshToken };
  }
}
