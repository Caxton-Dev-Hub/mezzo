import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { toUserResponse, UserResponse } from '../users/dto/user-response';
import { PasswordService } from './password.service';
import { TokenService, TokenPair } from './token.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/auth.schemas';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponse> {
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create(dto.email, passwordHash);
    return toUserResponse(user);
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: UserResponse }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await this.passwordService.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    const tokens = await this.tokenService.issueTokenPair(user);
    return { ...tokens, user: toUserResponse(user) };
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const { accessToken, refreshToken } = await this.tokenService.rotate(dto.refreshToken);
    return { accessToken, refreshToken };
  }
}
