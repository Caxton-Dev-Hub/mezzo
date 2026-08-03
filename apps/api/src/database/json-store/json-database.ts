import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JsonStoreUnavailableError } from './errors/json-store-unavailable.error';

export const JSON_STORE_VERSION = 1;

export type JsonRow = Record<string, unknown>;

export interface JsonTable {
  entity: string;
  rows: JsonRow[];
}

export interface JsonDocument {
  version: number;
  updatedAt: string;
  tables: Record<string, JsonTable>;
}

export class JsonDatabase {
  private document: JsonDocument | null = null;
  private loading: Promise<JsonDocument> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath;
  }

  load(): Promise<JsonDocument> {
    if (this.document) {
      return Promise.resolve(this.document);
    }

    this.loading ??= this.read()
      .then((document) => {
        this.document = document;
        return document;
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  async table(name: string, entity: string): Promise<JsonTable> {
    const document = await this.load();
    const existing = document.tables[name];

    if (existing) {
      return existing;
    }

    const created: JsonTable = { entity, rows: [] };
    document.tables[name] = created;
    return created;
  }

  persist(): Promise<void> {
    this.writing = this.writing.then(
      () => this.write(),
      () => this.write(),
    );

    return this.writing;
  }

  private async read(): Promise<JsonDocument> {
    let raw: string;

    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return { version: JSON_STORE_VERSION, updatedAt: new Date().toISOString(), tables: {} };
    }

    let parsed: JsonDocument;

    try {
      parsed = JSON.parse(raw) as JsonDocument;
    } catch (error) {
      throw new JsonStoreUnavailableError(
        this.filePath,
        error instanceof Error ? error.message : 'the file is not valid JSON',
      );
    }

    if (parsed.version !== JSON_STORE_VERSION) {
      throw new JsonStoreUnavailableError(
        this.filePath,
        `expected store version ${JSON_STORE_VERSION} but found ${String(parsed.version)}`,
      );
    }

    return {
      version: parsed.version,
      updatedAt: parsed.updatedAt,
      tables: parsed.tables ?? {},
    };
  }

  private async write(): Promise<void> {
    const document = this.document;

    if (!document) {
      return;
    }

    document.updatedAt = new Date().toISOString();

    const temporaryPath = `${this.filePath}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}
