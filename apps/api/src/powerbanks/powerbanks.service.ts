import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Powerbank, PowerbankStatus } from '../database/entities/powerbank.entity';
import { AuditService } from '../audit/audit.service';
import { ShopsService } from '../shops/shops.service';
import {
  PowerbankNotFoundError,
  PowerbankNumberInUseError,
  InvalidPowerbankNumberError,
} from './powerbanks.errors';
import { CreatePowerbankDto } from './dto/powerbanks.schemas';

@Injectable()
export class PowerbanksService {
  constructor(
    @InjectRepository(Powerbank)
    private readonly powerbanks: Repository<Powerbank>,
    private readonly shopsService: ShopsService,
    private readonly auditService: AuditService,
  ) {}

  async createPowerbank(dto: CreatePowerbankDto): Promise<Powerbank> {
    await this.shopsService.getShop(dto.shopId);

    const numberValue = parseInt(dto.number, 10);
    if (isNaN(numberValue) || numberValue < 1 || numberValue > 99) {
      throw new InvalidPowerbankNumberError(dto.number);
    }

    const powerbank = this.powerbanks.create({
      shopId: dto.shopId,
      number: dto.number,
      status: PowerbankStatus.AVAILABLE,
      replacementPriceAmount: '1500000',
      replacementPriceCurrency: 'NGN',
    });

    try {
      return await this.powerbanks.save(powerbank);
    } catch (error) {
      if (error instanceof QueryFailedError && error.message.includes('unique')) {
        throw new PowerbankNumberInUseError(dto.shopId, dto.number);
      }
      throw error;
    }
  }

  async listPowerbanks(shopId?: string): Promise<Powerbank[]> {
    return this.powerbanks.find({
      where: shopId ? { shopId } : {},
      order: { number: 'ASC' },
    });
  }

  async listAvailablePowerbanks(shopId?: string): Promise<Powerbank[]> {
    return this.powerbanks.find({
      where: shopId ? { shopId, status: PowerbankStatus.AVAILABLE } : { status: PowerbankStatus.AVAILABLE },
      order: { number: 'ASC' },
    });
  }

  async markAvailable(id: string, actorId: string): Promise<Powerbank> {
    const powerbank = await this.powerbanks.findOne({ where: { id } });
    if (!powerbank) {
      throw new PowerbankNotFoundError(id);
    }

    const previousStatus = powerbank.status;
    powerbank.status = PowerbankStatus.AVAILABLE;
    const updated = await this.powerbanks.save(powerbank);

    await this.auditService.record({
      actorId,
      action: 'powerbank.mark_available',
      entityType: 'Powerbank',
      entityId: id,
      before: { status: previousStatus },
      after: { status: PowerbankStatus.AVAILABLE },
    });

    return updated;
  }

  async markMaintenance(id: string, actorId: string): Promise<Powerbank> {
    const powerbank = await this.powerbanks.findOne({ where: { id } });
    if (!powerbank) {
      throw new PowerbankNotFoundError(id);
    }

    const previousStatus = powerbank.status;
    powerbank.status = PowerbankStatus.MAINTENANCE;
    const updated = await this.powerbanks.save(powerbank);

    await this.auditService.record({
      actorId,
      action: 'powerbank.mark_maintenance',
      entityType: 'Powerbank',
      entityId: id,
      before: { status: previousStatus },
      after: { status: PowerbankStatus.MAINTENANCE },
    });

    return updated;
  }

  async markLost(id: string, actorId: string): Promise<Powerbank> {
    const powerbank = await this.powerbanks.findOne({ where: { id } });
    if (!powerbank) {
      throw new PowerbankNotFoundError(id);
    }

    const previousStatus = powerbank.status;
    powerbank.status = PowerbankStatus.LOST;
    const updated = await this.powerbanks.save(powerbank);

    await this.auditService.record({
      actorId,
      action: 'powerbank.mark_lost',
      entityType: 'Powerbank',
      entityId: id,
      before: { status: previousStatus },
      after: { status: PowerbankStatus.LOST },
    });

    return updated;
  }

  async markUnreturned(id: string, actorId: string): Promise<Powerbank> {
    const powerbank = await this.powerbanks.findOne({ where: { id } });
    if (!powerbank) {
      throw new PowerbankNotFoundError(id);
    }

    const previousStatus = powerbank.status;
    powerbank.status = PowerbankStatus.UNRETURNED;
    const updated = await this.powerbanks.save(powerbank);

    await this.auditService.record({
      actorId,
      action: 'powerbank.mark_unreturned',
      entityType: 'Powerbank',
      entityId: id,
      before: { status: previousStatus },
      after: { status: PowerbankStatus.UNRETURNED },
    });

    return updated;
  }

  async getPowerbank(id: string): Promise<Powerbank> {
    const powerbank = await this.powerbanks.findOne({ where: { id } });
    if (!powerbank) {
      throw new PowerbankNotFoundError(id);
    }
    return powerbank;
  }
}
