import { Module } from '@nestjs/common';
import { User } from '../database/entities/user.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { isDatabaseConfigured } from '../database/persistence-mode';
import { persistenceFeature } from '../database/persistence.feature';
import { StorageModule } from '../evidence/storage/storage.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

const profilesEnabled = isDatabaseConfigured();

@Module({
  imports: [
    ...persistenceFeature([User, EscrowParty]),
    ...(profilesEnabled ? [StorageModule] : []),
  ],
  controllers: [UsersController, ...(profilesEnabled ? [ProfileController] : [])],
  providers: [UsersService, ...(profilesEnabled ? [ProfileService] : [])],
  exports: [UsersService],
})
export class UsersModule {}
