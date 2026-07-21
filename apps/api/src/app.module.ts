import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { EscrowModule } from './escrow/escrow.module';
import { EvidenceModule } from './evidence/evidence.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    CommonModule,
    UsersModule,
    AuthModule,
    KycModule,
    EscrowModule,
    EvidenceModule,
  ],
})
export class AppModule {}
