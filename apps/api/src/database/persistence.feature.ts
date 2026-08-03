import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { isDatabaseConfigured } from './persistence-mode';

export function persistenceFeature(entities: EntityClassOrSchema[]): DynamicModule[] {
  return isDatabaseConfigured() ? [TypeOrmModule.forFeature(entities)] : [];
}
