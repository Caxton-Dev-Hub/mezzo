import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { StorageModule } from '../evidence/storage/storage.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, EscrowParty]), StorageModule],
  controllers: [UsersController, ProfileController],
  providers: [UsersService, ProfileService],
  exports: [UsersService],
})
export class UsersModule {}
