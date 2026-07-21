import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken]), JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuthRateLimitGuard],
})
export class AuthModule {}
