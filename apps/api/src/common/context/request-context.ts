import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface RequestContextStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

@Injectable()
export class RequestContextService {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return storage.run(store, callback);
  }

  get(): RequestContextStore | undefined {
    return storage.getStore();
  }

  correlationId(): string | undefined {
    return storage.getStore()?.correlationId;
  }
}
