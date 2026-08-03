import { randomUUID } from 'node:crypto';
import { JsonDatabase, JsonRow, JsonTable } from './json-database';
import { UniqueConstraintViolationError } from './errors/unique-constraint-violation.error';

export interface JsonEntity {
  id: string;
  createdAt: Date;
}

export interface JsonCollectionSchema<T> {
  table: string;
  entity: string;
  fields: readonly (keyof T & string)[];
  dateFields: readonly (keyof T & string)[];
  unique: readonly (readonly (keyof T & string)[])[];
  hasUpdatedAt: boolean;
  defaults: () => Partial<T>;
}

type SortOrder = 'ASC' | 'DESC';

export class JsonRepository<T extends JsonEntity> {
  constructor(
    private readonly database: JsonDatabase,
    private readonly schema: JsonCollectionSchema<T>,
  ) {}

  create(partial: Partial<T> = {}): T {
    return { ...this.schema.defaults(), ...partial } as T;
  }

  async find(options: { order?: Partial<Record<keyof T & string, SortOrder>> } = {}): Promise<T[]> {
    const table = await this.table();
    const entities = table.rows.map((row) => this.hydrate(row));
    const order = options.order;

    if (!order) {
      return entities;
    }

    const criteria = Object.entries(order) as [keyof T & string, SortOrder][];

    return entities.sort((left, right) => {
      for (const [field, direction] of criteria) {
        const comparison = this.compare(left[field], right[field]);

        if (comparison !== 0) {
          return direction === 'DESC' ? -comparison : comparison;
        }
      }

      return 0;
    });
  }

  async findOne(options: { where: Partial<T> }): Promise<T | null> {
    const table = await this.table();
    const match = table.rows.find((row) => this.matches(row, options.where));

    return match ? this.hydrate(match) : null;
  }

  async save(entity: T): Promise<T> {
    const table = await this.table();
    const stored = { ...entity };

    if (!stored.id) {
      stored.id = randomUUID();
    }

    const index = table.rows.findIndex((row) => row.id === stored.id);

    if (!stored.createdAt) {
      stored.createdAt = index >= 0 ? this.hydrate(table.rows[index]).createdAt : new Date();
    }

    this.stampUpdatedAt(stored);

    this.assertUnique(table, stored);

    const row = this.serialize(stored);

    if (index >= 0) {
      table.rows[index] = row;
    } else {
      table.rows.push(row);
    }

    await this.database.persist();
    Object.assign(entity, stored);

    return entity;
  }

  async update(criteria: Partial<T>, patch: Partial<T>): Promise<void> {
    const table = await this.table();
    let changed = false;

    table.rows.forEach((row, index) => {
      if (!this.matches(row, criteria)) {
        return;
      }

      const updated = { ...this.hydrate(row), ...patch };
      this.stampUpdatedAt(updated);
      table.rows[index] = this.serialize(updated);
      changed = true;
    });

    if (changed) {
      await this.database.persist();
    }
  }

  private stampUpdatedAt(entity: T): void {
    if (this.schema.hasUpdatedAt) {
      (entity as unknown as Record<string, unknown>).updatedAt = new Date();
    }
  }

  private table(): Promise<JsonTable> {
    return this.database.table(this.schema.table, this.schema.entity);
  }

  private matches(row: JsonRow, where: Partial<T>): boolean {
    return Object.entries(where).every(
      ([field, value]) => row[field] === this.toStoredValue(field, value),
    );
  }

  private assertUnique(table: JsonTable, entity: T): void {
    for (const fields of this.schema.unique) {
      const values = fields.map((field) => this.toStoredValue(field, entity[field]));

      if (values.some((value) => value === null || value === undefined)) {
        continue;
      }

      const clash = table.rows.some(
        (row) => row.id !== entity.id && fields.every((field, at) => row[field] === values[at]),
      );

      if (clash) {
        throw new UniqueConstraintViolationError(this.schema.table, fields);
      }
    }
  }

  private serialize(entity: T): JsonRow {
    const row: JsonRow = {};

    for (const field of this.schema.fields) {
      row[field] = this.toStoredValue(field, entity[field]);
    }

    return row;
  }

  private hydrate(row: JsonRow): T {
    const entity: JsonRow = {};

    for (const field of this.schema.fields) {
      const value = row[field];

      entity[field] =
        this.schema.dateFields.includes(field) && typeof value === 'string'
          ? new Date(value)
          : (value ?? null);
    }

    return entity as T;
  }

  private toStoredValue(field: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value === undefined) {
      return this.schema.fields.includes(field as keyof T & string) ? null : undefined;
    }

    return value;
  }

  private compare(left: unknown, right: unknown): number {
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() - right.getTime();
    }

    if (typeof left === 'string' && typeof right === 'string') {
      return left.localeCompare(right);
    }

    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }

    return 0;
  }
}
