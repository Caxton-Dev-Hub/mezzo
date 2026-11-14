import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Rental, RentalStatus } from '../database/entities/rental.entity';
import { RentalCharge, RentalChargeType } from '../database/entities/rental-charge.entity';
import { Powerbank, PowerbankStatus } from '../database/entities/powerbank.entity';
import {
  OutstandingBalance,
  OutstandingBalanceReason,
} from '../database/entities/outstanding-balance.entity';
import {
  VerificationSubmission,
  VerificationSubmissionStatus,
} from '../database/entities/verification-submission.entity';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { Money } from '../common/money/money';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { userWalletRef, rentalHoldingRef, rentalRevenueRef } from '../ledger/account-refs';
import { UserRole } from '../users/entities/user-role.enum';
import {
  RentalNotFoundError,
  PowerbankNotAvailableError,
  UserNotVerifiedError,
  OutstandingBalanceExistsError,
  ReplacementChargeNotFoundError,
} from './rentals.errors';
import { CheckoutDto } from './dto/rentals.schemas';
import {
  BASE_RATE_KOBO,
  HOURLY_OVERAGE_KOBO,
  MAX_OVERAGE_KOBO,
  RENTAL_DURATION_MS,
} from './entities/pricing.constants';

@Injectable()
export class RentalsService {
  constructor(
    @InjectRepository(Rental)
    private readonly rentals: Repository<Rental>,
    @InjectRepository(OutstandingBalance)
    private readonly outstandingBalances: Repository<OutstandingBalance>,
    @InjectRepository(VerificationSubmission)
    private readonly verifications: Repository<VerificationSubmission>,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async checkout(userId: string, dto: CheckoutDto): Promise<Rental> {
    const verification = await this.verifications.findOne({
      where: {
        userId,
        status: VerificationSubmissionStatus.APPROVED,
      },
    });

    if (!verification) {
      throw new UserNotVerifiedError();
    }

    const unclearedBalances = await this.outstandingBalances.find({
      where: {
        userId,
        clearedAt: IsNull(),
      },
    });

    if (unclearedBalances.length > 0) {
      throw new OutstandingBalanceExistsError();
    }

    return this.dataSource.transaction(async (manager) => {
      const powerbank = await manager.findOne(Powerbank, {
        where: { id: dto.powerbankId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!powerbank || powerbank.status !== PowerbankStatus.AVAILABLE) {
        throw new PowerbankNotAvailableError(dto.powerbankId);
      }

      const now = new Date();
      const dueAt = new Date(now.getTime() + RENTAL_DURATION_MS);

      const rental = await manager.save(
        Rental,
        manager.create(Rental, {
          powerbankId: dto.powerbankId,
          userId,
          shopId: dto.shopId,
          startedAt: now,
          dueAt,
          returnedAt: null,
          status: RentalStatus.ACTIVE,
          baseChargeAmount: BASE_RATE_KOBO.toString(),
          baseChargeCurrency: 'NGN',
          totalChargedAmount: BASE_RATE_KOBO.toString(),
          totalChargedCurrency: 'NGN',
        }),
      );

      powerbank.status = PowerbankStatus.RENTED;
      await manager.save(Powerbank, powerbank);

      const baseMoney = Money.of(BASE_RATE_KOBO, 'NGN');
      const posting = await this.ledgerService.postTransaction(
        [
          {
            accountRef: userWalletRef(userId, 'NGN'),
            direction: EntryDirection.DEBIT,
            money: baseMoney,
          },
          {
            accountRef: rentalHoldingRef(rental.id),
            direction: EntryDirection.CREDIT,
            money: baseMoney,
          },
        ],
        {
          idempotencyKey: `rental-base:${rental.id}`,
          correlationId: rental.id,
        },
        manager,
      );

      await manager.save(
        RentalCharge,
        manager.create(RentalCharge, {
          rentalId: rental.id,
          chargeType: RentalChargeType.BASE,
          amount: BASE_RATE_KOBO.toString(),
          currency: 'NGN',
          chargedAt: now,
          ledgerPostingId: posting.id,
          reason: null,
        }),
      );

      return rental;
    });
  }

  async checkin(rentalId: string, actorId: string): Promise<Rental> {
    return this.dataSource.transaction(async (manager) => {
      const rental = await manager.findOne(Rental, {
        where: { id: rentalId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!rental) {
        throw new RentalNotFoundError(rentalId);
      }

      const powerbank = await manager.findOne(Powerbank, {
        where: { id: rental.powerbankId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!powerbank) {
        throw new PowerbankNotAvailableError(rental.powerbankId);
      }

      rental.status = RentalStatus.RETURNED;
      rental.returnedAt = new Date();
      powerbank.status = PowerbankStatus.AVAILABLE;

      await manager.save(Rental, rental);
      await manager.save(Powerbank, powerbank);

      await this.auditService.record(
        {
          actorId,
          action: 'rental.checkin',
          entityType: 'Rental',
          entityId: rental.id,
          before: { status: RentalStatus.ACTIVE },
          after: { status: RentalStatus.RETURNED, returnedAt: rental.returnedAt },
        },
        manager,
      );

      return rental;
    });
  }

  async listRentals(
    userId: string,
    role: UserRole,
    allowedShopIds: string[] | null,
  ): Promise<Rental[]> {
    if (role === UserRole.ADMIN) {
      return this.rentals.find({ order: { startedAt: 'DESC' } });
    }

    if (role === UserRole.STAFF && allowedShopIds) {
      return this.rentals.find({
        where: { shopId: In(allowedShopIds) },
        order: { startedAt: 'DESC' },
      });
    }

    return this.rentals.find({
      where: { userId },
      order: { startedAt: 'DESC' },
    });
  }

  async getRental(id: string, userId: string, role: UserRole): Promise<Rental> {
    const rental = await this.rentals.findOne({ where: { id } });

    if (!rental) {
      throw new RentalNotFoundError(id);
    }

    if (role === UserRole.ADMIN) {
      return rental;
    }

    if (role === UserRole.USER && rental.userId !== userId) {
      throw new RentalNotFoundError(id);
    }

    return rental;
  }

  async markUnreturned(rentalId: string, actorId: string, reason?: string): Promise<Rental> {
    return this.dataSource.transaction(async (manager) => {
      const rental = await manager.findOne(Rental, {
        where: { id: rentalId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!rental) {
        throw new RentalNotFoundError(rentalId);
      }

      const powerbank = await manager.findOne(Powerbank, {
        where: { id: rental.powerbankId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!powerbank) {
        throw new PowerbankNotAvailableError(rental.powerbankId);
      }

      rental.status = RentalStatus.UNRETURNED;
      powerbank.status = PowerbankStatus.UNRETURNED;

      await manager.save(Rental, rental);
      await manager.save(Powerbank, powerbank);

      await this.auditService.record(
        {
          actorId,
          action: 'rental.mark_unreturned',
          entityType: 'Rental',
          entityId: rental.id,
          reason,
          after: { status: RentalStatus.UNRETURNED },
        },
        manager,
      );

      return rental;
    });
  }

  async chargeReplacement(rentalId: string, actorId: string, reason?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rental = await manager.findOne(Rental, {
        where: { id: rentalId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!rental) {
        throw new RentalNotFoundError(rentalId);
      }

      const powerbank = await manager.findOne(Powerbank, {
        where: { id: rental.powerbankId },
      });

      if (!powerbank) {
        throw new PowerbankNotAvailableError(rental.powerbankId);
      }

      const replacementAmount = Number(powerbank.replacementPriceAmount);
      const currency = powerbank.replacementPriceCurrency as 'NGN' | 'USD';
      const replacementMoney = Money.of(replacementAmount, currency);

      const walletBalance = await this.ledgerService.getBalanceOrZero(
        userWalletRef(rental.userId, currency),
        currency,
      );

      let posting;
      if (walletBalance.amount >= replacementAmount) {
        posting = await this.ledgerService.postTransaction(
          [
            {
              accountRef: userWalletRef(rental.userId, currency),
              direction: EntryDirection.DEBIT,
              money: replacementMoney,
            },
            {
              accountRef: rentalRevenueRef(),
              direction: EntryDirection.CREDIT,
              money: replacementMoney,
            },
          ],
          {
            idempotencyKey: `rental-replacement:${rentalId}`,
            correlationId: rentalId,
          },
          manager,
        );
      } else {
        await manager.save(
          OutstandingBalance,
          manager.create(OutstandingBalance, {
            userId: rental.userId,
            amount: replacementAmount.toString(),
            currency,
            reason: OutstandingBalanceReason.REPLACEMENT_CHARGE,
            rentalId: rental.id,
            clearedAt: null,
          }),
        );
      }

      await manager.save(
        RentalCharge,
        manager.create(RentalCharge, {
          rentalId: rental.id,
          chargeType: RentalChargeType.REPLACEMENT,
          amount: replacementAmount.toString(),
          currency,
          chargedAt: new Date(),
          ledgerPostingId: posting?.id ?? null,
          reason,
        }),
      );

      await this.auditService.record(
        {
          actorId,
          action: 'rental.charge_replacement',
          entityType: 'Rental',
          entityId: rental.id,
          reason,
          after: { replacementAmount, currency },
        },
        manager,
      );
    });
  }

  async reverseReplacement(rentalId: string, actorId: string, reason?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const rental = await manager.findOne(Rental, {
        where: { id: rentalId },
      });

      if (!rental) {
        throw new RentalNotFoundError(rentalId);
      }

      const replacementCharge = await manager.findOne(RentalCharge, {
        where: {
          rentalId: rental.id,
          chargeType: RentalChargeType.REPLACEMENT,
        },
      });

      if (!replacementCharge) {
        throw new ReplacementChargeNotFoundError(rentalId);
      }

      const amount = Number(replacementCharge.amount);
      const currency = replacementCharge.currency as 'NGN' | 'USD';
      const reversalMoney = Money.of(amount, currency);

      await this.ledgerService.postTransaction(
        [
          {
            accountRef: userWalletRef(rental.userId, currency),
            direction: EntryDirection.CREDIT,
            money: reversalMoney,
          },
          {
            accountRef: rentalRevenueRef(),
            direction: EntryDirection.DEBIT,
            money: reversalMoney,
          },
        ],
        {
          idempotencyKey: `rental-replacement-reversal:${rentalId}`,
          correlationId: rentalId,
        },
        manager,
      );

      const outstandingBalance = await manager.findOne(OutstandingBalance, {
        where: {
          userId: rental.userId,
          rentalId: rental.id,
          reason: OutstandingBalanceReason.REPLACEMENT_CHARGE,
          clearedAt: IsNull(),
        },
      });

      if (outstandingBalance) {
        outstandingBalance.clearedAt = new Date();
        await manager.save(OutstandingBalance, outstandingBalance);
      }

      await this.auditService.record(
        {
          actorId,
          action: 'rental.reverse_replacement',
          entityType: 'Rental',
          entityId: rental.id,
          reason,
          after: { reversedAmount: amount, currency },
        },
        manager,
      );
    });
  }

  async runOverdueAccrual(): Promise<void> {
    const overdueRentals = await this.rentals.find({
      where: [{ status: RentalStatus.ACTIVE }, { status: RentalStatus.OVERDUE }],
    });

    const now = new Date();

    for (const rental of overdueRentals) {
      if (now <= rental.dueAt) {
        continue;
      }

      await this.dataSource.transaction(async (manager) => {
        const lockedRental = await manager.findOne(Rental, {
          where: { id: rental.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedRental || lockedRental.status === RentalStatus.UNRETURNED) {
          return;
        }

        const msOverdue = now.getTime() - lockedRental.dueAt.getTime();
        const hoursOverdue = Math.min(Math.floor(msOverdue / 3600000), 24);

        if (hoursOverdue === 0) {
          return;
        }

        const existingOverageCharges = await manager.find(RentalCharge, {
          where: {
            rentalId: lockedRental.id,
            chargeType: RentalChargeType.OVERAGE,
          },
        });

        const alreadyCharged = existingOverageCharges.reduce(
          (sum, charge) => sum + Number(charge.amount),
          0,
        );

        const shouldHaveCharged = Math.min(hoursOverdue * HOURLY_OVERAGE_KOBO, MAX_OVERAGE_KOBO);
        const delta = shouldHaveCharged - alreadyCharged;

        if (delta <= 0) {
          if (hoursOverdue >= 24) {
            lockedRental.status = RentalStatus.UNRETURNED;
            await manager.save(Rental, lockedRental);

            const powerbank = await manager.findOne(Powerbank, {
              where: { id: lockedRental.powerbankId },
            });
            if (powerbank) {
              powerbank.status = PowerbankStatus.UNRETURNED;
              await manager.save(Powerbank, powerbank);
            }
          }
          return;
        }

        const chargeMoney = Money.of(delta, 'NGN');
        const walletBalance = await this.ledgerService.getBalanceOrZero(
          userWalletRef(lockedRental.userId, 'NGN'),
          'NGN',
        );

        let posting;
        if (walletBalance.amount >= delta) {
          posting = await this.ledgerService.postTransaction(
            [
              {
                accountRef: userWalletRef(lockedRental.userId, 'NGN'),
                direction: EntryDirection.DEBIT,
                money: chargeMoney,
              },
              {
                accountRef: rentalRevenueRef(),
                direction: EntryDirection.CREDIT,
                money: chargeMoney,
              },
            ],
            {
              idempotencyKey: `rental-overage:${lockedRental.id}:${hoursOverdue}`,
              correlationId: lockedRental.id,
            },
            manager,
          );
        } else {
          await manager.save(
            OutstandingBalance,
            manager.create(OutstandingBalance, {
              userId: lockedRental.userId,
              amount: delta.toString(),
              currency: 'NGN',
              reason: OutstandingBalanceReason.RENTAL_OVERAGE,
              rentalId: lockedRental.id,
              clearedAt: null,
            }),
          );
        }

        await manager.save(
          RentalCharge,
          manager.create(RentalCharge, {
            rentalId: lockedRental.id,
            chargeType: RentalChargeType.OVERAGE,
            amount: delta.toString(),
            currency: 'NGN',
            chargedAt: now,
            ledgerPostingId: posting?.id ?? null,
            reason: null,
          }),
        );

        const newTotalCharged = Number(lockedRental.totalChargedAmount) + delta;
        lockedRental.totalChargedAmount = newTotalCharged.toString();

        if (hoursOverdue >= 24) {
          lockedRental.status = RentalStatus.UNRETURNED;
          const powerbank = await manager.findOne(Powerbank, {
            where: { id: lockedRental.powerbankId },
          });
          if (powerbank) {
            powerbank.status = PowerbankStatus.UNRETURNED;
            await manager.save(Powerbank, powerbank);
          }
        } else if (lockedRental.status === RentalStatus.ACTIVE) {
          lockedRental.status = RentalStatus.OVERDUE;
          const powerbank = await manager.findOne(Powerbank, {
            where: { id: lockedRental.powerbankId },
          });
          if (powerbank && powerbank.status === PowerbankStatus.RENTED) {
            powerbank.status = PowerbankStatus.OVERDUE;
            await manager.save(Powerbank, powerbank);
          }
        }

        await manager.save(Rental, lockedRental);
      });
    }
  }
}
