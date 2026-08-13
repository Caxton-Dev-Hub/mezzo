import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformFlag } from '../database/entities/platform-flag.entity';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformFlag])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
