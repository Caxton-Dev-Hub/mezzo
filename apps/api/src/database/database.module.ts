import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { JsonPersistenceModule } from './json-store/json-persistence.module';
import { isDatabaseConfigured } from './persistence-mode';

@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    if (!isDatabaseConfigured()) {
      return {
        module: DatabaseModule,
        imports: [JsonPersistenceModule.register()],
      };
    }

    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
            type: 'postgres',
            url: configService.getOrThrow<string>('DATABASE_URL'),
            entities: [`${__dirname}/entities/**/*.entity{.ts,.js}`],
            migrations: [`${__dirname}/migrations/**/*{.ts,.js}`],
            synchronize: false,
            autoLoadEntities: true,
          }),
        }),
      ],
    };
  }
}
