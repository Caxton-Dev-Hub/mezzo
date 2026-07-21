import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { KycProvider, KycSubmissionRequest, KycSubmissionResult } from './kyc-provider.interface';

@Injectable()
export class FakeKycProvider implements KycProvider {
  readonly name = 'FAKE';

  submit(_request: KycSubmissionRequest): Promise<KycSubmissionResult> {
    return Promise.resolve({ providerReference: `fake-${randomUUID()}` });
  }
}
